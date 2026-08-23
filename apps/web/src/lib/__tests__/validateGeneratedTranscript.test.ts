import type { TranscriptSegment } from '@/lib/platforms/types';
import {
  TranscriptGenerationBlockedError,
  TranscriptGenerationQualityError,
  assertUsableGeneration,
} from '@/lib/transcripts/validateGeneratedTranscript';

const segment = (startMs: number, endMs: number): TranscriptSegment => ({
  startMs,
  endMs,
  text: 'x',
});

// Build a segment list whose last segment ends at `coveredMs`.
const coverageTo = (coveredMs: number): TranscriptSegment[] => [
  segment(0, Math.min(1000, coveredMs)),
  segment(coveredMs - 1000, coveredMs),
];

describe('assertUsableGeneration', () => {
  describe('accepts usable generations', () => {
    it.each<{ desc: string; input: Parameters<typeof assertUsableGeneration>[0] }>([
      {
        desc: 'full coverage with real media tokens',
        input: {
          segments: coverageTo(3_258_000),
          durationSeconds: 3264,
          finishReason: 'stop',
          inputTokens: 297_093,
        },
      },
      {
        desc: 'low coverage but truncated by the token ceiling',
        input: {
          segments: coverageTo(600_000),
          durationSeconds: 7907,
          finishReason: 'length',
          inputTokens: 65_000,
        },
      },
      {
        desc: 'low coverage but unknown duration',
        input: {
          segments: coverageTo(64_000),
          durationSeconds: null,
          finishReason: 'stop',
          inputTokens: 50_000,
        },
      },
      {
        desc: 'unknown input tokens with adequate coverage',
        input: {
          segments: coverageTo(3_200_000),
          durationSeconds: 3264,
          finishReason: 'stop',
          inputTokens: null,
        },
      },
      {
        desc: 'coverage exactly at the threshold',
        input: {
          segments: coverageTo(50_000),
          durationSeconds: 100,
          finishReason: 'stop',
          inputTokens: 50_000,
        },
      },
    ])('$desc', ({ input }) => {
      expect(() => assertUsableGeneration(input)).not.toThrow();
    });
  });

  describe('rejects unusable generations', () => {
    it.each<{ desc: string; input: Parameters<typeof assertUsableGeneration>[0] }>([
      {
        // The real-world failure: 2h11m video, 146 text-only input
        // tokens, transcript ending at 64s.
        desc: 'media never ingested (text-only input tokens)',
        input: {
          segments: coverageTo(64_000),
          durationSeconds: 7907,
          finishReason: 'stop',
          inputTokens: 146,
        },
      },
      {
        desc: 'transcript covers a sliver of a known-duration video',
        input: {
          segments: coverageTo(64_000),
          durationSeconds: 7907,
          finishReason: 'stop',
          inputTokens: 50_000,
        },
      },
      {
        desc: 'coverage just below the threshold',
        input: {
          segments: coverageTo(49_000),
          durationSeconds: 100,
          finishReason: 'stop',
          inputTokens: 50_000,
        },
      },
    ])('$desc', ({ input }) => {
      expect(() => assertUsableGeneration(input)).toThrow(TranscriptGenerationQualityError);
    });
  });

  describe('content-policy blocks', () => {
    it('accepts a partial transcript when a blocked window still leaves enough coverage', () => {
      // 100s video, one window blocked, but the survivors cover 60s (> the
      // 50% ratio) — persist the partial rather than fail.
      expect(() =>
        assertUsableGeneration({
          segments: coverageTo(60_000),
          durationSeconds: 100,
          finishReason: 'stop',
          inputTokens: 200_000,
          blockedWindowCount: 1,
        })
      ).not.toThrow();
    });

    it('reports a block-caused shortfall as the fatal blocked error', () => {
      let caught: unknown;
      try {
        assertUsableGeneration({
          segments: coverageTo(40_000),
          durationSeconds: 100,
          finishReason: 'stop',
          inputTokens: 200_000,
          blockedWindowCount: 2,
        });
      } catch (err) {
        caught = err;
      }
      // Blocks re-block on retry, so this must be the deterministic error
      // the step maps to FatalError — not the retryable quality error.
      expect(caught).toBeInstanceOf(TranscriptGenerationBlockedError);
      expect(caught).not.toBeInstanceOf(TranscriptGenerationQualityError);
    });

    it('reports a shortfall with no blocks as the retryable quality error', () => {
      expect(() =>
        assertUsableGeneration({
          segments: coverageTo(40_000),
          durationSeconds: 100,
          finishReason: 'stop',
          inputTokens: 200_000,
          blockedWindowCount: 0,
        })
      ).toThrow(TranscriptGenerationQualityError);
    });
  });

  it('checks input tokens before coverage', () => {
    // Both guards would fire; the ingestion message wins because it is
    // the root cause the user should see.
    expect(() =>
      assertUsableGeneration({
        segments: coverageTo(64_000),
        durationSeconds: 7907,
        finishReason: 'stop',
        inputTokens: 146,
      })
    ).toThrow(/could not read the video/);
  });

  it('is a retryable error, not a fatal one', () => {
    let caught: unknown;
    try {
      assertUsableGeneration({
        segments: coverageTo(1000),
        durationSeconds: 7907,
        finishReason: 'stop',
        inputTokens: 10,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TranscriptGenerationQualityError);
    expect(caught).toBeInstanceOf(Error);
    // FatalError is the WDK opt-out from retries; this error must not be
    // one, so the workflow's default step retry re-runs the model.
    expect((caught as Error).name).toBe('TranscriptGenerationQualityError');
  });
});

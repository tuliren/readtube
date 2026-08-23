import type { TranscriptGenerationInput } from './steps';
import {
  failTranscriptGenerationStep,
  generateTranscriptStep,
  persistGeneratedTranscriptStep,
  probeCaptionsStep,
  startSummaryGenerationStep,
} from './steps';

export type { TranscriptGenerationInput } from './steps';

// The Gemini call alone measured 4–9 minutes for a ~1 h video, so this
// workflow needs the full route-level budget rather than the 300 s the
// refresh workflows use.
export const maxDuration = 800;

/**
 * AI transcript generation for a caption-less video. Kicked off
 * explicitly by POST /api/videos/[id]/transcript/generate after the
 * route claims the Video row's generation marker (GENERATING +
 * workflow_id). The marker is held through the summary handoff:
 * success paths persist the transcript but leave the marker
 * GENERATING, and startSummaryGenerationStep releases it after the
 * auto-summary run is registered — so the reader's polling panel can
 * hold its spinner until the summary tab has something to tap into.
 * The catch path reverts the marker with a user-facing message and
 * flips the audit row to FAILED. There is no client stream — the
 * reader polls the transcript GET route and picks up the persisted
 * row when it appears.
 */
export async function transcriptGenerationWorkflow(
  input: TranscriptGenerationInput
): Promise<void> {
  'use workflow';

  let transcriptId: string;
  try {
    const probe = await probeCaptionsStep(input);
    if (probe.found && probe.transcriptId != null) {
      transcriptId = probe.transcriptId;
    } else {
      const generated = await generateTranscriptStep(input);
      const persisted = await persistGeneratedTranscriptStep({ ...input, ...generated });
      transcriptId = persisted.transcriptId;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate transcript.';
    await failTranscriptGenerationStep(input, message);
    throw err;
  }

  // Outside the try: the transcript is persisted, so a hiccup here
  // must not flip the generation to FAILED. The step swallows summary
  // errors and then releases the generation marker; if the release
  // itself dies the stale-marker cleanup in
  // findActiveTranscriptGeneration recovers the row, and the reader
  // still sees the transcript (the GET checks the row before the
  // marker).
  await startSummaryGenerationStep(input, transcriptId);
}

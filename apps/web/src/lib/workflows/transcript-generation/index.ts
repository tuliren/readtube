import type { TranscriptGenerationInput } from './steps';
import {
  failTranscriptGenerationStep,
  generateTranscriptStep,
  persistGeneratedTranscriptStep,
  probeCaptionsStep,
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
 * workflow_id). Success paths release the marker; the catch path
 * reverts it with a user-facing message and flips the audit row to
 * FAILED. There is no client stream — the reader polls the transcript
 * GET route and picks up the persisted row when it appears.
 */
export async function transcriptGenerationWorkflow(
  input: TranscriptGenerationInput
): Promise<void> {
  'use workflow';

  try {
    const probe = await probeCaptionsStep(input);
    if (probe.found) {
      return;
    }
    const generated = await generateTranscriptStep(input);
    await persistGeneratedTranscriptStep({ ...input, ...generated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate transcript.';
    await failTranscriptGenerationStep(input, message);
    throw err;
  }
}

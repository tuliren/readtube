import type { GeneratedSummary, SummaryWorkflowInput } from './steps';
import {
  emitTerminalEventStep,
  generateSummaryStep,
  persistSummaryStep,
  revertSummaryRowStep,
} from './steps';

export type { SummaryStreamEvent, SummaryWorkflowInput } from './steps';

export async function summaryWorkflow(input: SummaryWorkflowInput): Promise<void> {
  'use workflow';

  let generated: GeneratedSummary;
  try {
    generated = await generateSummaryStep(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate summary.';
    // Revert the row we claimed at start time before the terminal
    // error event closes the stream. Without this, a fresh-claim
    // failure leaves a phantom GENERATING row that the next read
    // would tap into and stream nothing useful. Also flips the
    // route's UserRequest row (if any) to FAILED with the same
    // message — the message is what the client sees in the stream.
    await revertSummaryRowStep(input, message);
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  try {
    await persistSummaryStep({ ...input, ...generated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save summary.';
    await revertSummaryRowStep(input, message);
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  await emitTerminalEventStep({ type: 'done' });
}

import { GENERATION_MAX_DURATION_SECONDS } from '@/constants';

import { emitTerminalEventStep, generateSummaryStep, persistSummaryStep } from './steps';
import type { GeneratedSummary, SummaryWorkflowInput } from './steps';

export type { SummaryStreamEvent, SummaryWorkflowInput, SummaryFieldPrompt } from './steps';

export const maxDuration = GENERATION_MAX_DURATION_SECONDS;

export async function summaryWorkflow(input: SummaryWorkflowInput): Promise<void> {
  'use workflow';

  let generated: GeneratedSummary;
  try {
    generated = await generateSummaryStep(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate summary.';
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  try {
    await persistSummaryStep({ ...input, ...generated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save summary.';
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  await emitTerminalEventStep({ type: 'done' });
}

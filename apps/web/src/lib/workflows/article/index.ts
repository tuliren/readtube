import { GENERATION_MAX_DURATION_SECONDS } from '@/constants';

import {
  emitTerminalEventStep,
  generateArticleStep,
  persistArticleStep,
  revertArticleRowStep,
} from './steps';
import type { ArticleWorkflowInput, GeneratedArticle } from './steps';

export type { ArticleStreamEvent, ArticleWorkflowInput } from './steps';

export const maxDuration = GENERATION_MAX_DURATION_SECONDS;

export async function articleWorkflow(input: ArticleWorkflowInput): Promise<void> {
  'use workflow';

  let generated: GeneratedArticle;
  try {
    generated = await generateArticleStep(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate article.';
    // Revert the row we claimed at start time before the terminal
    // error closes the stream. Fresh claims get DELETEd so the slot
    // is clean; regen claims revert to READY (old content stays).
    await revertArticleRowStep(input);
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  try {
    await persistArticleStep({ ...input, ...generated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save article.';
    await revertArticleRowStep(input);
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  await emitTerminalEventStep({ type: 'done' });
}

import type { ArticleWorkflowInput, GeneratedArticle } from './steps';
import {
  emitTerminalEventStep,
  generateArticleStep,
  persistArticleStep,
  revertArticleRowStep,
} from './steps';

export type { ArticleStreamEvent, ArticleWorkflowInput } from './steps';

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
    // Also flips the route's UserRequest row (if any) to FAILED with
    // the same message — what the client sees in the stream.
    await revertArticleRowStep(input, message);
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  try {
    await persistArticleStep({ ...input, ...generated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save article.';
    await revertArticleRowStep(input, message);
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  await emitTerminalEventStep({ type: 'done' });
}

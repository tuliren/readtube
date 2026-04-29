import { emitTerminalEventStep, generateArticleStep, persistArticleStep } from './steps';
import type { ArticleWorkflowInput, GeneratedArticle } from './steps';

export type { ArticleStreamEvent, ArticleWorkflowInput } from './steps';

export const maxDuration = 300;

export async function articleWorkflow(input: ArticleWorkflowInput): Promise<void> {
  'use workflow';

  let generated: GeneratedArticle;
  try {
    generated = await generateArticleStep(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate article.';
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  try {
    await persistArticleStep({ ...input, ...generated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save article.';
    await emitTerminalEventStep({ error: message });
    throw err;
  }

  await emitTerminalEventStep({ type: 'done' });
}

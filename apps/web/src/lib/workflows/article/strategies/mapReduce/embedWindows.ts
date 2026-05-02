import { embedMany } from 'ai';

import { DEFAULT_EMBEDDING_MODEL, EMBED_BATCH_SIZE } from '@/constants';

/**
 * Embed each window's text. Sends in batches of {@link EMBED_BATCH_SIZE}
 * so very long videos (15hr → ~600 windows) don't all fly into one
 * request. The order of returned embeddings matches the order of
 * input texts.
 *
 * No retry layer here — embedding-model failures are rare and the
 * caller (mapReduce strategy) treats a failure as fatal for the
 * generation attempt; the workflow's own retry / surface-error path
 * gives the user a "Try again" affordance.
 */
export async function embedWindows(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: DEFAULT_EMBEDDING_MODEL,
      values: batch,
    });
    for (const emb of embeddings) {
      out.push(emb);
    }
  }
  return out;
}

/** Cosine distance ∈ [0, 2]; 0 = identical, 1 = orthogonal, 2 = opposite. */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) {
    return 1;
  }
  return 1 - dot / denom;
}

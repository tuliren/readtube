export const MAIN_COLOR = '#515ada';
export const MINOR_COLOR = '#76ABDF';

export const TITLE = 'ReadTube';
export const DESCRIPTION =
  'Turn YouTube subscriptions into a personal newsletter. Reclaim focus in a world engineered for distraction.';
export const DOMAIN = 'read.tube';
export const DOMAIN_URL = `https://${DOMAIN}`;
export const CONTACT_EMAIL = `contact@${DOMAIN}`;

// https://ai.google.dev/gemini-api/docs/pricing
// $0.25 / $1.5
export const DEFAULT_AI_MODEL = 'google/gemini-3.1-flash-lite-preview';

/**
 * Model for semantic embeddings. 1536 native dims matches the pgvector
 * column in the schema. We use OpenAI for embeddings even though
 * generation (summaries, articles, Ask-my-inbox answers) uses Google
 * Gemini — the Vercel AI Gateway routes them independently by provider
 * prefix, and no 1536-dim Google embedding model is available through
 * the gateway as a plain string identifier today. If you swap to a
 * model with a different output size, bump EMBEDDING_PROMPT_VERSION
 * AND alter the pgvector column + HNSW index together.
 *
 * https://developers.openai.com/api/docs/pricing
 * $0.02
 */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

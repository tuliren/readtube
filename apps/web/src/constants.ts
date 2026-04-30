export const MAIN_COLOR = '#515ada';
export const MINOR_COLOR = '#76ABDF';

export const TITLE = 'ReadTube';
export const DESCRIPTION =
  'Turn YouTube subscriptions into a personal newsletter. Reclaim focus in a world engineered for distraction.';
export const DOMAIN = 'read.tube';
export const DOMAIN_URL = `https://${DOMAIN}`;
export const CONTACT_EMAIL = `contact@${DOMAIN}`;

// https://vercel.com/liren/~/ai-gateway/models
// google/gemini-3.1-flash-lite-preview: $0.25 / $1.5 - tend to summarize for article too
// openai/gpt-5.4-nano: $0.20 / $1.25 - not much formatting for article
// openai/gpt-5.4-mini: $0.74 / $4.5
// openai/gpt-5.4: $2.5 / $15 - too expensive
// anthropic/claude-haiku-4.5: $1 / $5 - slow
export const DEFAULT_AI_MODEL = 'openai/gpt-5.4-mini';

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

/**
 * Function timeout (in seconds) shared by the summary/article generate
 * routes and their workflow steps. Both ends of the pipe need to live
 * long enough for the workflow to stream deltas, persist the row, and
 * emit the terminal `{type:'done'}` event — if the route times out
 * first the response closes mid-workflow and the client falls into the
 * "Generation ended unexpectedly — refresh" branch even though the
 * content lands in the database. 800 s is the Vercel Pro cap with
 * Fluid Compute (the default for new projects); plenty of headroom for
 * the longest transcripts the model has to chew through.
 */
export const GENERATION_MAX_DURATION_SECONDS = 800;

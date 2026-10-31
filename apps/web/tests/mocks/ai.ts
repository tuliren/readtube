/**
 * Jest stub for `ai`. Since v7 the package is ESM-only, which Jest's
 * CommonJS runtime can't parse. Unit tests only import it transitively
 * (strategy modules wrap `streamText` / `embedMany`), so every export
 * fails loudly if a test reaches it. Suites that exercise model calls
 * still `jest.mock` it.
 */
function unavailable(name: string): never {
  throw new Error(`ai.${name}() is not available in unit tests; mock it in the suite`);
}

export const Output = {
  object: (): never => unavailable('Output.object'),
};

export function streamText(): never {
  return unavailable('streamText');
}

export function generateText(): never {
  return unavailable('generateText');
}

export function generateObject(): never {
  return unavailable('generateObject');
}

export function embed(): never {
  return unavailable('embed');
}

export function embedMany(): never {
  return unavailable('embedMany');
}

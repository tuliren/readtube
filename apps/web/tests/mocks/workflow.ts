/**
 * Jest stub for `workflow`. Since v5 the package's Node entry is
 * ESM-only, which Jest's CommonJS runtime can't parse. Unit tests only
 * import it transitively (strategy modules throw `FatalError`), so the
 * stub mirrors the error class and fails loudly if a test reaches a
 * runtime-only API. Suites that exercise steps still `jest.mock` it.
 */
export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalError';
  }
}

function unavailable(name: string): never {
  throw new Error(`workflow.${name}() is not available in unit tests; mock it in the suite`);
}

export function getWritable(): never {
  return unavailable('getWritable');
}

export function getWorkflowMetadata(): never {
  return unavailable('getWorkflowMetadata');
}

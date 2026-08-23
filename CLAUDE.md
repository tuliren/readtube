# Read Tube

## Summary

Turn YouTube subscriptions into a personal substack. Consume videos efficiently by reading, searching, annotating them.

## Development preference

- After each change, run `yarn lint`, `yarn typecheck`, `yarn format:check`, `yarn test`, and `yarn integrationTest` to ensure no errors.
- DRY the code when appropriate.
- Always use curly braces after `if` statements.
- Always think about adding unit tests for new features and bug fixes. Aim for good coverage on critical parsing logic and workflows. But skip unit tests if it involves complicated mocking or stubs.
- When checking whether a value exists or is absent, use `if (x == null)` or `if (x != null)` instead of `if (!x)` or `if (!!x)`. This avoids implicit type coercion, which can mask bugs when `x` is a valid falsy value like `0`, `""`, or `false`.
- In unit tests, use `it.each` to group similar test cases together. Do not use "should" in test descriptions.
- When introducing a database schema change, follow the workflow in `packages/database/README.md`. The short version: edit `packages/database/prisma/schema.prisma`, run `yarn db:create-migration` (which creates both an up and a down migration via the custom `bin/create-migration.sh` wrapper), inspect the generated SQL — Prisma's diff doesn't fully understand the `Unsupported("tsvector")` generated column or the raw-SQL ANN/GIN indexes, so you may need to delete spurious DROP/RECREATE INDEX statements by hand — and then apply with `yarn db:deploy`.
- Never modify any existing migration files.
- Never put a specific video ID, URL, title, or any of its content into committed code, comments, tests, or PR/commit descriptions. Debug with such values only in throwaway scratch files or CLI args; use neutral placeholders in anything committed.
- When writing Prisma `upsert` statement, always ensure the unique fields have the same values in the `where` and `create` options. This enables Prisma to use native Postgres `upsert` statement.
- When a React component file is long, separate subcomponents into their own component files.
- When pushing new commits to a branch with an open PR, re-evaluate the PR title and description against the full change set and update them (`gh pr edit`) if they no longer cover it.
- After making a change, thinking about updating these docs, if applicable:
  - `CLAUDE.md` (this file)
  - `README.md` for different modules

## References

- [DEVELOPMENT.md](DEVELOPMENT.md): project setup and deployment
- [DESIGN.md](DESIGN.md): design choices and feature implementation details
- [MARKETING.md](MARKETING.md): marketing experiment plan, budget ledger, and UTM conventions — the source of truth for marketing work; per-experiment history in `marketing/diary/`

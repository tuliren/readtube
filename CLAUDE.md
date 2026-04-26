# Read Tube

## Summary

Turn YouTube subscriptions into a personal substack. Consume videos efficiently by reading, searching, annotating them.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).

## Development preference

- After each change, run `yarn lint`, `yarn typecheck`, `yarn format:check`, `yarn test`, and `yarn integrationTest` to ensure no errors.
- DRY the code when appropriate.
- Always use curly braces after `if` statements.
- Always think about adding unit tests for new features and bug fixes. Aim for good coverage on critical parsing logic and workflows. But skip unit tests if it involves complicated mocking or stubs.
- When checking whether a value exists or is absent, use `if (x == null)` or `if (x != null)` instead of `if (!x)` or `if (!!x)`. This avoids implicit type coercion, which can mask bugs when `x` is a valid falsy value like `0`, `""`, or `false`.
  - For review agent, it's fine to not always following this rule, especially for existing code.
- In unit tests, use `it.each` to group similar test cases together. Do not use "should" in test descriptions.
- When introducing a database schema change, follow the workflow in `packages/database/README.md`. The short version: edit `packages/database/prisma/schema.prisma`, run `yarn db:create-migration` (which creates both an up and a down migration via the custom `bin/create-migration.sh` wrapper), inspect the generated SQL — Prisma's diff doesn't fully understand the `Unsupported("tsvector")` generated column or the raw-SQL ANN/GIN indexes, so you may need to delete spurious DROP/RECREATE INDEX statements by hand — and then apply with `yarn db:deploy`.
  - For review agent, it is fine to see migration files in a PR. Those files are added by human engineer.
- Never modify any existing migration files.
- When writing Prisma `upsert` statement, always ensure the unique fields have the same values in the `where` and `create` options. This enables Prisma to use native Postgres `upsert` statement.
- When a React component file is long, separate subcomponents into their own component files.
- After making a change, thinking about updating these docs, if applicable:
  - `CLAUDE.md` (this file)
  - `README.md` for different modules

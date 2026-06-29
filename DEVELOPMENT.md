# Development

How to work on ReadTube locally.

## Repository layout

This is a [Turborepo](https://turbo.build/repo) monorepo managed with Yarn 4 workspaces.

### Apps

- `apps/web` — the main [Next.js](https://nextjs.org/) application (read.tube).

### Packages

- `packages/database` — Prisma schema, migrations, and the shared Prisma client.
- `packages/lib` — shared React component library used by app modules.
- `packages/eslint-config` — shared ESLint configs (includes `eslint-config-next` and `eslint-config-prettier`).
- `packages/typescript-config` — shared `tsconfig.json`s.
- `packages/jest-presets` — shared Jest presets.

Everything is TypeScript.

## Prerequisites

- Node.js `>= 22`
- Yarn `4.9.1` (pinned via `packageManager`)
- Docker (for integration tests — uses [Testcontainers](https://testcontainers.com/))
- A running Postgres instance for local development

## Getting started

```bash
# Install dependencies
yarn install

# Generate the Prisma client
yarn db:generate

# Run the full dev stack (all apps)
yarn dev
```

The web app runs at [http://localhost:3000](http://localhost:3000).

Per-app `README`s:

- [`apps/web/README.md`](./apps/web/README.md)
- [`packages/database/README.md`](./packages/database/README.md)

## Environment variables

`turbo.json` declares the env vars the pipeline is aware of. The ones that matter for local dev:

- `DATABASE_URL` — Postgres connection string.
- `INTEGRATION_DATABASE_URL` — only used by the integration test harness.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` — Clerk auth.
- `TRANSCRIPT_API_KEY`, `AI_GATEWAY_API_KEY`, `JUSTONEAPI_TOKEN` — transcript + AI providers.
- `CRON_SECRET` — protects scheduled routes.

Put local values in `.env.development.local` / `.env.*local` (Turbo watches these as global dependencies).

## Common commands

Run from the repo root.

```bash
yarn dev              # Start all apps in dev mode
yarn build            # Build everything
yarn lint             # Lint all workspaces
yarn typecheck        # Typecheck all workspaces
yarn test             # Run unit tests
yarn integrationTest  # Run integration tests (Postgres via Testcontainers)
yarn format:check     # Prettier check
yarn format:write     # Prettier write
```

After each change, run `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn integrationTest` to confirm nothing is broken.

## Database

Schema lives in `packages/database/prisma/schema.prisma`. The full workflow is in [`packages/database/README.md`](./packages/database/README.md); the short version:

```bash
# After editing schema.prisma
yarn db:create-migration   # Creates both up and down migrations
yarn db:deploy             # Applies migrations locally
yarn db:generate           # Regenerates the Prisma client
yarn db:status             # Inspect migration state
yarn db:rollback           # Revert the last migration
```

Notes:

- Never modify an existing migration file.
- Prisma's diff doesn't fully understand the `Unsupported("tsvector")` generated column or the raw-SQL ANN/GIN indexes — inspect generated SQL and remove spurious `DROP/RECREATE INDEX` statements before deploying.
- When writing `upsert`, keep the unique fields identical in `where` and `create` so Prisma emits a native Postgres `UPSERT`.

## Testing

### Unit tests

- Live under `__tests__/` next to the code they cover.
- The database is not available — mock Prisma calls manually. If mocking gets ugly, write an integration test instead.
- Group similar cases with `it.each`. Don't use "should" in test descriptions.

```bash
yarn test
```

### Integration tests

- Live under `__integrationTests__/` next to the code they cover.
- Backed by a real Postgres instance booted via Testcontainers.
- Import `@tests/integration-tests` and use `global.testPrisma` for a client against the test DB.
- `global.testPrisma` does not replace the shared Prisma client — functions under test should accept a Prisma client as an argument so the test can inject `global.testPrisma`.

```bash
yarn integrationTest
```

## Scripts

One-off scripts live in `apps/web/scripts`.

```bash
# Uses .env.development
yarn workspace web script scripts/<script-file>.ts -- <args>

# Uses .env.production — proceed with caution
yarn workspace web script:prod scripts/<script-file>.ts -- <args>
```

The script environment (`development` or `production`) is exposed as `SCRIPT_ENV`. If a script is intended for only one environment, it should check `SCRIPT_ENV` and exit otherwise.

## Deployment

- Web app deploys to [Vercel](https://vercel.com). The `production` branch is auto-deployed to production.
- Fast-forward `production` to `main` via the `deploy-main.yaml` GitHub Action.

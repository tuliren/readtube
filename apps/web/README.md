# Nextjs Web App

## Getting Started

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

The `production` branch is automatically deployed to the `production` environment on Vercel.

The `production` branch can be fast-forwarded to the `main` branch by running the `deploy-main.yaml` GitHub action.

## Testing

### Unit tests

- All unit tests should live under a `__tests__` subdirectory under the directory being tested.
- Unit tests are not backed by actual database. The database calls need to be mocked manually.
- To run tests with actual database, write integration tests instead.

```bash
# Run unit tests
npm run test
```

### Integration tests

- Integration tests are set up to run with Postgres database running in [Testcontainers](https://testcontainers.com/).
- All integration tests should live under a `__integrationTests__` subdirectory under the directory being tested.
- Import `@tests/integration-tests` and use `global.testPrisma` to get a Prisma client connected to a test database.

```bash
# Run integration tests
npm run integrationTest
```

> [!NOTE]
> `global.testPrisma` does not override the Prisma client defined in `packages/database`. To test a function with the testing database, the function should take in a Prisma client as an argument.

## Scripts

```bash
# Run with the .env.development file
npm run script scripts/<script-file>.ts -- <args>

# Run with the .env.production file, proceed with caution
npm run script:prod scripts/<script-file>.ts -- <args>
```

> [!NOTE]
> The script environment, `development` or `production` is exported to the `SCRIPT_ENV` variable. If a script is only meant to be run in one environment, it should check the `SCRIPT_ENV` variable and exit if it is not the correct environment.

import { PrismaClient } from '@readtube/database';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';

let container: StartedPostgreSqlContainer | null = null;
let prisma: PrismaClient;

beforeAll(async () => {
  let databaseUrl: string;

  if (process.env.INTEGRATION_DATABASE_URL != null) {
    // In CI, a single Postgres service container is shared across all test
    // files (see the `services:` block in .github/workflows/build.yaml).
    // Starting one container via GitHub Actions and running tests with
    // `--runInBand` is significantly faster than spinning up a fresh
    // testcontainer per-file.
    databaseUrl = process.env.INTEGRATION_DATABASE_URL;
  } else {
    // Local dev: pgvector/pgvector:pg17 is the official image with the
    // pgvector extension preinstalled on Postgres 17 — matches our Neon prod
    // version so migration syntax and query planner behavior stay consistent.
    container = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
    databaseUrl = container.getConnectionUri();
  }

  process.env.DATABASE_URL = databaseUrl;

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  global.testPrisma = prisma;

  // Apply migrations directly. We deliberately do NOT call `yarn db:deploy`
  // here: that script also runs `prisma migrate status` (noisy) and
  // `db:dump-schema` (mutates source-controlled `prisma/schema_dump.sql`
  // and races between parallel jest workers on a hard-coded temp file path).
  // When the DB is shared across files, `migrate deploy` is idempotent and
  // fast on subsequent calls (only checks `_prisma_migrations`).
  execSync('npx prisma migrate deploy', {
    cwd: '../../packages/database',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  if (container != null) {
    await container.stop();
  }
});

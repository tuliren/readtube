import { PrismaClient } from '@readtube/database';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  // pgvector/pgvector:pg17 is the official image with the pgvector extension
  // preinstalled on Postgres 17 — matches our Neon prod version so migration
  // syntax and query planner behavior stay consistent between CI and prod.
  container = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();

  const databaseUrl = container.getConnectionUri();
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
  execSync('npx prisma migrate deploy', {
    cwd: '../../packages/database',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    // Optional: only needed for `prisma migrate diff` against a migrations
    // directory (CI's "Verify schema is in sync" step). `prisma generate`/
    // `migrate deploy` (Docker build, prod deploy) never read this, but
    // env() throws eagerly on module load if the var is unset, so it must
    // stay a plain process.env lookup here, not env(), or every other
    // Prisma invocation breaks wherever SHADOW_DATABASE_URL isn't set.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

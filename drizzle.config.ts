import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});

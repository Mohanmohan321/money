import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

import * as schema from './schema';

export type AppDatabase = NeonHttpDatabase<typeof schema>;

export function createDatabase(databaseUrl: string): AppDatabase {
  const client: NeonQueryFunction<boolean, boolean> = neon(databaseUrl);
  return drizzle({ client, schema });
}

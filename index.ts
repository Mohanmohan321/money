import 'dotenv/config';

import { Router } from 'express';

import { DrizzleAggregateStore } from './server/aggregates/drizzle-aggregate-store';
import { createAggregateRouter } from './server/aggregates/routes';
import { createApp } from './server/app';
import { DrizzleSessionStore } from './server/auth/drizzle-session-store';
import { loadConfig } from './server/config';
import { createDatabase } from './server/db/client';
import { DrizzleRecordStore } from './server/records/drizzle-record-store';
import { createRecordsRouter } from './server/records/routes';

function createConfiguredApplication() {
  try {
    const config = loadConfig(process.env);
    const database = createDatabase(config.databaseUrl);
    const recordStore = new DrizzleRecordStore(database);
    const aggregateStore = new DrizzleAggregateStore(database);
    const protectedRouter = Router();
    protectedRouter.use(createRecordsRouter(recordStore, config.timezone));
    protectedRouter.use(createAggregateRouter(aggregateStore, config.timezone));

    return {
      config,
      app: createApp({
        config,
        sessionStore: new DrizzleSessionStore(database),
        protectedRouter,
      }),
    };
  } catch (error) {
    console.error('Startup configuration failed', {
      error: error instanceof Error ? error.message : 'Unknown startup error',
    });
    throw error;
  }
}

export const { app, config } = createConfiguredApplication();

export default app;

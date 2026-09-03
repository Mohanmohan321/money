import 'dotenv/config';

import { Router } from 'express';

import { DrizzleAggregateStore } from './server/aggregates/drizzle-aggregate-store';
import { createAggregateRouter } from './server/aggregates/routes';
import { createApp } from './server/app';
import { DrizzleSessionStore } from './server/auth/drizzle-session-store';
import { DrizzleBudgetStore } from './server/budgets/drizzle-budget-store';
import { createBudgetRouter } from './server/budgets/routes';
import { loadConfig } from './server/config';
import { createDatabase } from './server/db/client';
import { DrizzleNetWorthStore } from './server/net-worth/drizzle-net-worth-store';
import { createNetWorthRouter } from './server/net-worth/routes';
import { DrizzleRecordStore } from './server/records/drizzle-record-store';
import { createRecordsRouter } from './server/records/routes';
import { DrizzleVaultStore } from './server/vaults/drizzle-vault-store';
import { createVaultRouter } from './server/vaults/routes';

function createConfiguredApplication() {
  try {
    const config = loadConfig(process.env);
    const database = createDatabase(config.databaseUrl);
    const recordStore = new DrizzleRecordStore(database);
    const budgetStore = new DrizzleBudgetStore(database);
    const vaultStore = new DrizzleVaultStore(database);
    const netWorthStore = new DrizzleNetWorthStore(database);
    const aggregateStore = new DrizzleAggregateStore(database);
    const protectedRouter = Router();
    protectedRouter.use(createRecordsRouter(recordStore, config.timezone));
    protectedRouter.use(createBudgetRouter(budgetStore, config.timezone));
    protectedRouter.use(createVaultRouter(vaultStore));
    protectedRouter.use(createNetWorthRouter(netWorthStore));
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

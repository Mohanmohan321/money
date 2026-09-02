import { Router } from 'express';
import { z } from 'zod';

import {
  createPersonRecordSchema,
  createTransactionSchema,
  dateFilterSchema,
  type PersonRecord,
  type TransactionRecord,
} from '../../shared/contracts';
import { createBorrowingRouter } from '../borrowing/routes';
import { createLendingRouter } from '../lending/routes';
import { AppError } from '../middleware/errors';
import { createTransactionsRouter } from '../transactions/routes';
import { localDateBounds } from '../lib/time';
import type { RecordStore } from './store';

export interface ResourceOperations<TInput, TRecord> {
  create(input: TInput): Promise<TRecord>;
  list(filters: { from?: Date; toExclusive?: Date }): Promise<TRecord[]>;
  get(id: string): Promise<TRecord | undefined>;
  delete(id: string): Promise<boolean>;
}

export function createResourceRouter<TInput, TRecord extends TransactionRecord | PersonRecord>(
  inputSchema: z.ZodType<TInput>,
  operations: ResourceOperations<TInput, TRecord>,
  timezone: string,
  notFoundCode: string,
  notFoundMessage: string,
): Router {
  const router = Router();
  const idSchema = z.string().uuid('Record ID must be a UUID');

  router.post('/', async (request, response) => {
    const input = inputSchema.parse(request.body);
    const record = await operations.create(input);
    response.status(201).json({ success: true, data: record });
  });

  router.get('/', async (request, response) => {
    const query = dateFilterSchema.parse(request.query);
    let filters;
    try {
      filters = localDateBounds(query.from, query.to, timezone);
    } catch (error) {
      throw new AppError(
        400,
        'INVALID_DATE',
        error instanceof Error ? error.message : 'Invalid date filter',
      );
    }
    const records = await operations.list(filters);
    response.json({ success: true, data: { items: records } });
  });

  router.get('/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const record = await operations.get(id);
    if (!record) {
      throw new AppError(404, notFoundCode, notFoundMessage);
    }
    response.json({ success: true, data: record });
  });

  router.delete('/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    if (!(await operations.delete(id))) {
      throw new AppError(404, notFoundCode, notFoundMessage);
    }
    response.json({ success: true, data: { deleted: true } });
  });

  return router;
}

export function createRecordsRouter(store: RecordStore, timezone: string): Router {
  const router = Router();
  router.use('/transactions', createTransactionsRouter(store, timezone));
  router.use('/lent', createLendingRouter(store, timezone));
  router.use('/borrowed', createBorrowingRouter(store, timezone));
  return router;
}

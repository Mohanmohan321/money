import { Router } from 'express';
import { z } from 'zod';

import { createTransactionSchema, updateTransactionSchema } from '../../shared/contracts';
import { AppError } from '../middleware/errors';
import { createResourceRouter } from '../records/routes';
import type { RecordStore } from '../records/store';

export function createTransactionsRouter(store: RecordStore, timezone: string) {
  const router = Router();
  router.put('/:id', async (request, response) => {
    const id = z.string().uuid('Record ID must be a UUID').parse(request.params.id);
    const record = await store.updateTransaction(id, updateTransactionSchema.parse(request.body));
    if (!record) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    response.json({ success: true, data: record });
  });
  router.use('/', createResourceRouter(
    createTransactionSchema,
    {
      create: (input) => store.createTransaction(input),
      list: (filters) => store.listTransactions(filters),
      get: (id) => store.getTransaction(id),
      delete: (id) => store.deleteTransaction(id),
    },
    timezone,
    'TRANSACTION_NOT_FOUND',
    'Transaction not found',
  ));
  return router;
}

import { createTransactionSchema } from '../../shared/contracts';
import { createResourceRouter } from '../records/routes';
import type { RecordStore } from '../records/store';

export function createTransactionsRouter(store: RecordStore, timezone: string) {
  return createResourceRouter(
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
  );
}

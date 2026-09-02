import { createPersonRecordSchema } from '../../shared/contracts';
import { createResourceRouter } from '../records/routes';
import type { RecordStore } from '../records/store';

export function createBorrowingRouter(store: RecordStore, timezone: string) {
  return createResourceRouter(
    createPersonRecordSchema,
    {
      create: (input) => store.createBorrowed(input),
      list: (filters) => store.listBorrowed(filters),
      get: (id) => store.getBorrowed(id),
      delete: (id) => store.deleteBorrowed(id),
    },
    timezone,
    'BORROWING_RECORD_NOT_FOUND',
    'Borrowing record not found',
  );
}

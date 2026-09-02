import { createPersonRecordSchema } from '../../shared/contracts';
import { createResourceRouter } from '../records/routes';
import type { RecordStore } from '../records/store';

export function createLendingRouter(store: RecordStore, timezone: string) {
  return createResourceRouter(
    createPersonRecordSchema,
    {
      create: (input) => store.createLent(input),
      list: (filters) => store.listLent(filters),
      get: (id) => store.getLent(id),
      delete: (id) => store.deleteLent(id),
    },
    timezone,
    'LENDING_RECORD_NOT_FOUND',
    'Lending record not found',
  );
}

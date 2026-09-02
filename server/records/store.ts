import type {
  CreatePersonRecordInput,
  CreateTransactionInput,
  PersonRecord,
  TransactionRecord,
} from '../../shared/contracts';

export interface ListFilters {
  from?: Date;
  toExclusive?: Date;
}

export interface RecordStore {
  createTransaction(input: CreateTransactionInput): Promise<TransactionRecord>;
  listTransactions(filters: ListFilters): Promise<TransactionRecord[]>;
  getTransaction(id: string): Promise<TransactionRecord | undefined>;
  deleteTransaction(id: string): Promise<boolean>;
  createLent(input: CreatePersonRecordInput): Promise<PersonRecord>;
  listLent(filters: ListFilters): Promise<PersonRecord[]>;
  getLent(id: string): Promise<PersonRecord | undefined>;
  deleteLent(id: string): Promise<boolean>;
  createBorrowed(input: CreatePersonRecordInput): Promise<PersonRecord>;
  listBorrowed(filters: ListFilters): Promise<PersonRecord[]>;
  getBorrowed(id: string): Promise<PersonRecord | undefined>;
  deleteBorrowed(id: string): Promise<boolean>;
}

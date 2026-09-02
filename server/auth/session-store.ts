export interface SessionStore {
  create(tokenHash: string, expiresAt: Date): Promise<void>;
  isValid(tokenHash: string, now: Date): Promise<boolean>;
  delete(tokenHash: string): Promise<void>;
  deleteExpired?(now: Date): Promise<void>;
}

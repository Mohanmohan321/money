import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sessionCookieName = 'money_session';
export const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function passwordsMatch(submitted: string, expected: string): boolean {
  const submittedHash = createHash('sha256').update(submitted, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(submittedHash, expectedHash);
}

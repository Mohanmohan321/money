import { describe, expect, it } from 'vitest';

import { createSessionToken, hashSessionToken, passwordsMatch } from './session';

describe('session token security', () => {
  it('creates an opaque token and stores a deterministic SHA-256 digest', () => {
    const token = createSessionToken();
    const digest = hashSessionToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(token);
    expect(hashSessionToken(token)).toBe(digest);
  });

  it('compares passwords without depending on their length', () => {
    expect(passwordsMatch('2003', '2003')).toBe(true);
    expect(passwordsMatch('wrong', '2003')).toBe(false);
    expect(passwordsMatch('', 'a much longer password')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { CleanupRegistry, settleAndRegister } from './integration-cleanup';

describe('database integration cleanup support', () => {
  it('runs children before parents and continues after a cleanup failure', async () => {
    const events: string[] = [];
    const cleanup = new CleanupRegistry();
    cleanup.add(async () => { events.push('parent'); });
    cleanup.add(async () => {
      events.push('child');
      throw new Error('child cleanup failed');
    });

    await expect(cleanup.run()).rejects.toThrow('Disposable database integration cleanup failed');
    expect(events).toEqual(['child', 'parent']);
  });

  it('registers fulfilled concurrent work before reporting a sibling failure', async () => {
    const registered: string[] = [];

    await expect(settleAndRegister([
      Promise.resolve('created-row-id'),
      Promise.reject(new Error('sibling insert failed')),
    ], (id) => registered.push(id))).rejects.toThrow('Concurrent integration setup failed');

    expect(registered).toEqual(['created-row-id']);
  });
});

export type CleanupStep = () => Promise<unknown>;

export class CleanupRegistry {
  private readonly steps: CleanupStep[] = [];

  add(step: CleanupStep): void {
    this.steps.unshift(step);
  }

  async run(): Promise<void> {
    const errors: unknown[] = [];
    for (const step of this.steps.splice(0)) {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Disposable database integration cleanup failed');
    }
  }
}

export async function settleAndRegister<T>(
  pending: ReadonlyArray<Promise<T>>,
  register: (value: T) => void,
): Promise<T[]> {
  const settled = await Promise.allSettled(pending);
  const values: T[] = [];
  const errors: unknown[] = [];
  for (const result of settled) {
    if (result.status === 'rejected') {
      errors.push(result.reason);
      continue;
    }
    values.push(result.value);
    try {
      register(result.value);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Concurrent integration setup failed');
  }
  return values;
}

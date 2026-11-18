import { describe, expect, it } from 'vitest';
import { PacedRunner } from './rate';

describe('PacedRunner', () => {
  it('never exceeds the concurrency cap across many concurrent run() calls', async () => {
    const runner = new PacedRunner(3, 0, async () => {});
    let inFlight = 0;
    let maxInFlight = 0;

    const tasks = Array.from({ length: 30 }, () =>
      runner.run(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return 1;
      }),
    );

    const results = await Promise.all(tasks);
    expect(results.filter((value) => value === 1)).toHaveLength(30);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

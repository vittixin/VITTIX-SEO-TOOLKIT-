import { describe, expect, it } from 'vitest';
import { penaltyFor, computeScore } from './scoring';
import type { Finding } from '@vittix/shared';

describe('scoring — worst penalty per ruleId', () => {
  it('deducts the worst penalty when warn and error share a ruleId, in either order', () => {
    const warn: Finding = {
      ruleId: 'dup-rule',
      title: 'w',
      detail: '',
      category: 'metadata',
      severity: 'warn',
    };
    const error: Finding = {
      ruleId: 'dup-rule',
      title: 'e',
      detail: '',
      category: 'metadata',
      severity: 'error',
    };
    const a = computeScore([warn, error]);
    const b = computeScore([error, warn]);
    expect(a.categories.find((c) => c.category === 'metadata')?.score).toBe(75);
    expect(b.categories.find((c) => c.category === 'metadata')?.score).toBe(75);
    void penaltyFor;
  });
});

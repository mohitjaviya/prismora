import { describe, it, expect } from 'vitest';
import { shortId, expenseSource } from '../ids';

describe('shortId', () => {
  it('keeps short ids as they are', () => {
    expect(shortId('EXP-12')).toBe('EXP-12');
    expect(shortId('CN-1790000')).toBe('CN-1790000');
  });

  it('keeps the kind and the tail of a long one', () => {
    expect(shortId('EXP-INC-1789983894639-SCH-1789983814013')).toBe('EXP-INC…814013');
    expect(shortId('EXP-FLD-1789983207672')).toBe('EXP-FLD…207672');
    expect(shortId('INV-1790270306391')).toBe('INV…306391');
  });

  it('copes with nothing', () => {
    expect(shortId(null)).toBe('');
  });
});

describe('expenseSource', () => {
  it('names what an automatic expense came from', () => {
    expect(expenseSource('EXP-INC-1-SCH-2')).toBe('Incentive');
    expect(expenseSource('EXP-CLM-4')).toBe('Scheme claim');
    expect(expenseSource('EXP-FLD-9')).toBe('Field expense');
    expect(expenseSource('EXP-12')).toBeNull();
  });
});

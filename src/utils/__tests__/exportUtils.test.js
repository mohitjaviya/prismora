import { describe, it, expect } from 'vitest';
import { itemsText } from '../exportUtils';

describe('itemsText (H14)', () => {
  it('writes order lines readably instead of [object Object]', () => {
    expect(itemsText([
      { name: 'TEST Neem Face Wash 100ml', quantity: 10, unitPrice: 140, total: 1400 },
      { name: 'TEST Herbal Shampoo 200ml', quantity: 5, unitPrice: 232, total: 1160 },
    ])).toBe('TEST Neem Face Wash 100ml × 10 @ 140 = 1400; TEST Herbal Shampoo 200ml × 5 @ 232 = 1160');
  });
  it('reads purchase-return lines (product, unitCost)', () => {
    expect(itemsText([{ product: 'Aloe Gel', quantity: 3, unitCost: 50 }])).toBe('Aloe Gel × 3 @ 50 = 150');
  });
  it('is empty for no items', () => {
    expect(itemsText(null)).toBe('');
    expect(itemsText([])).toBe('');
  });
});

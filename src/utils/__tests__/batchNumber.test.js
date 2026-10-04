import { describe, it, expect } from 'vitest';
import { batchNumberProblem, grnBatchProblem, BATCH_NUMBER_REQUIRED_TEXT } from '../batchNumber';

const inv = [
  { id: 'A1', product: 'Aloevera Skin Gel 150g', batchNumber: 'abc123', warehouse: 'Main Warehouse' },
  { id: 'A2', product: 'Aloevera Skin Gel 150g', batchNumber: 'abc123', warehouse: 'Main Warehouse' },
  { id: 'N0', product: 'Neem Face Wash 100ml', batchNumber: '', warehouse: 'Main Warehouse' },
  { id: 'N1', product: 'Neem Face Wash 100ml', batchNumber: 'NFW-1', warehouse: 'Pune Depot' },
];

describe('Gap 18: batch number required and unique per product', () => {
  it('a new batch needs a number (blank or spaces refused)', () => {
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: '' }, inv)).toBe(BATCH_NUMBER_REQUIRED_TEXT);
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: '   ' }, inv)).toBe(BATCH_NUMBER_REQUIRED_TEXT);
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: 'NFW-2' }, inv)).toBe(null);
  });

  it('a number the product already has (any warehouse, case and spaces ignored) is refused', () => {
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: ' nfw-1 ' }, inv)).toMatch(/already used for Neem Face Wash 100ml \(Pune Depot\)/);
    expect(batchNumberProblem({ product: 'Aloevera Skin Gel 150g', batchNumber: 'ABC123' }, inv)).toMatch(/already used/);
  });

  it('the same number on another product is fine', () => {
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: 'abc123' }, inv)).toBe(null);
  });

  it('editing: an old batch without a number must be given one; keeping a shared old number is allowed', () => {
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: '' }, inv, inv[2])).toBe(BATCH_NUMBER_REQUIRED_TEXT);
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: 'NFW-0' }, inv, inv[2])).toBe(null);
    expect(batchNumberProblem({ product: 'Aloevera Skin Gel 150g', batchNumber: 'abc123' }, inv, inv[0])).toBe(null);
  });

  it('editing: renaming to a number the product has elsewhere is refused, its own number is not a clash', () => {
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: 'NFW-1' }, inv, inv[2])).toMatch(/already used/);
    expect(batchNumberProblem({ product: 'Neem Face Wash 100ml', batchNumber: 'NFW-1 ' }, inv, inv[3])).toBe(null);
  });

  it('goods receipt: every line receiving units needs a number', () => {
    expect(grnBatchProblem([{ product: 'Neem Face Wash 100ml', receivedQty: '5', batchNumber: '' }])).toMatch(/for Neem Face Wash 100ml/);
    expect(grnBatchProblem([{ product: 'Neem Face Wash 100ml', receivedQty: 0, batchNumber: '' }, { product: 'Tulsi', receivedQty: 2, batchNumber: 'T1' }])).toBe(null);
  });
});

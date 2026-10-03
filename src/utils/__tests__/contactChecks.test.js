import { describe, it, expect } from 'vitest';
import { gstinProblem, phoneProblem, pincodeProblem, contactProblem, normaliseGstin } from '../contactChecks';

describe('contactChecks', () => {
  it('accepts a valid GSTIN in any case, and blank', () => {
    expect(gstinProblem('24AAACJ1234K1Z5')).toBeNull();
    expect(gstinProblem(' 24aaacj1234k1z5 ')).toBeNull();
    expect(gstinProblem('')).toBeNull();
    expect(normaliseGstin(' 24aaacj1234k1z5 ')).toBe('24AAACJ1234K1Z5');
  });
  it('refuses short or malformed GSTINs', () => {
    for (const g of ['24AKSP2683K', '97678GHJ', '24AAACJ1234K1X5', '24AAACJ1234K0Z5']) expect(gstinProblem(g)).toMatch(/GSTIN/);
  });
  it('accepts mobiles and landlines', () => {
    for (const p of ['9876543210', '+91 98765 43210', '919876543210', '09876543210', '022-12345678', '07926543210']) expect(phoneProblem(p)).toBeNull();
  });
  it('refuses bad phones', () => {
    for (const p of ['1234567890', '567897567', '345678908765', '0987654321', 'abc']) expect(phoneProblem(p)).toMatch(/Phone/);
  });
  it('checks pincodes', () => {
    expect(pincodeProblem('388001')).toBeNull();
    expect(pincodeProblem('038800')).toMatch(/Pincode/);
    expect(pincodeProblem('38800')).toMatch(/Pincode/);
  });
  it('contactProblem returns the first problem, skips pincode when the form has none', () => {
    expect(contactProblem({ gstin: '', phone: '9876543210', pincode: '388001' })).toBeNull();
    expect(contactProblem({ phone: '123' })).toMatch(/Phone/);
    expect(contactProblem({ phone: '9876543210', pincode: '0' })).toMatch(/Pincode/);
  });
  it('with the row being edited, an unchanged old value is not checked', () => {
    const before = { gstin: '97678GHJ', phone: '1234567890', pincode: '388001' };
    expect(contactProblem({ ...before, name: 'x' }, before)).toBeNull();
    expect(contactProblem({ ...before, gstin: '97678ghj' }, { ...before, gstin: '97678ghj' })).toBeNull();
    expect(contactProblem({ ...before, gstin: '97678GHJ' }, { ...before, gstin: '97678ghj' })).toBeNull();
    expect(contactProblem({ ...before, phone: '12' }, before)).toMatch(/Phone/);
    expect(contactProblem({ ...before, gstin: '24AAACJ1234K1Z5' }, before)).toBeNull();
  });
});

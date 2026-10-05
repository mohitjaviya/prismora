import { describe, it, expect } from 'vitest';
import {
  normaliseMobile, mobileProblem, emailProblem, normaliseEmail, quantityProblem, amountProblem,
  percentProblem, requiredProblem, checkForm, cleanForm, checkLines, hasErrors, firstError, countProblem, lineFieldErrors,
  MOBILE_MESSAGE, EMAIL_MESSAGE, adjustmentProblem,
} from '../formRules';

describe('mobile numbers', () => {
  it('accepts a 10-digit mobile starting 6–9, with +91 or 0 in front or spaces', () => {
    for (const v of ['9876543210', '6000000000', '+919876543210', '09876543210', '+91 98765 43210', ' 98765 43210 ', '919876543210', '98765-43210']) {
      expect(mobileProblem(v)).toBeNull();
      expect(normaliseMobile(v)).toBe(v.includes('6000') ? '6000000000' : '9876543210');
    }
  });
  it('refuses wrong length, wrong first digit, letters and symbols', () => {
    for (const v of ['0654345678765', '1234567890', '5876543210', '987654321', '98765432101', '022-12345678',
      '98765a3210', '91 9876543', '+9198765432', '(987)6543210', '0987654321']) {
      expect(mobileProblem(v)).toBe(MOBILE_MESSAGE);
    }
  });
  it('blank is not a phone problem (required is separate)', () => {
    expect(mobileProblem('')).toBeNull();
    expect(mobileProblem('   ')).toBeNull();
    expect(normaliseMobile('  ')).toBe('');
  });
  it('leaves a bad number trimmed but otherwise as typed', () => {
    expect(normaliseMobile(' 12345 ')).toBe('12345');
  });
});

describe('limits and adjustments', () => {
  it('quantity at most 1,00,000, whole', () => {
    expect(quantityProblem('100000')).toBeNull();
    expect(quantityProblem('100001')).toMatch(/1,00,000/);
    expect(quantityProblem('2.5')).toMatch(/whole/);
    expect(quantityProblem('-1')).toMatch(/more than 0/);
  });
  it('amount at most 10 crore, 2 decimals', () => {
    expect(amountProblem('100000000')).toBeNull();
    expect(amountProblem('100000001')).toMatch(/10 crore/);
    expect(amountProblem('1.234')).toMatch(/2 decimals/);
    expect(amountProblem('-5')).toMatch(/negative/);
  });
  it('adjustment: whole, not 0, within 1,00,000 either way', () => {
    expect(adjustmentProblem('-5')).toBeNull();
    expect(adjustmentProblem('0')).toMatch(/0/);
    expect(adjustmentProblem('1.5')).toMatch(/whole/);
    expect(adjustmentProblem('-100001')).toMatch(/1,00,000/);
    expect(adjustmentProblem('')).toMatch(/required/);
  });
});

describe('email', () => {
  it('accepts name@domain.com style, trimmed and lowercased', () => {
    expect(emailProblem(' Name.Surname+x@Janki-Herbals.co.in ')).toBeNull();
    expect(normaliseEmail(' Name@Domain.COM ')).toBe('name@domain.com');
  });
  it('refuses broken addresses', () => {
    for (const v of ['name', 'name@', '@domain.com', 'name@domain', 'name@domain.c', 'na me@domain.com', 'a@b@c.com', 'name@.com']) {
      expect(emailProblem(v)).toBe(EMAIL_MESSAGE);
    }
  });
});

describe('quantity', () => {
  it('must be a whole number above 0', () => {
    expect(quantityProblem('5')).toBeNull();
    expect(quantityProblem(1)).toBeNull();
    expect(quantityProblem('0')).toBe('Quantity must be more than 0');
    expect(quantityProblem(-3)).toBe('Quantity must be more than 0');
    expect(quantityProblem('2.5')).toBe('Quantity must be a whole number');
    expect(quantityProblem('abc')).toBe('Quantity must be a number');
    expect(quantityProblem('', 'Free goods quantity')).toBe('Free goods quantity is required');
  });
});

describe('amount and percent', () => {
  it('amount: not negative, at most 2 decimals; positive refuses 0', () => {
    expect(amountProblem('')).toBeNull();
    expect(amountProblem('0')).toBeNull();
    expect(amountProblem('1499.99')).toBeNull();
    expect(amountProblem(0.1 + 0.2)).toBeNull(); // float noise, not a third decimal
    expect(amountProblem('-1', 'Price')).toBe('Price cannot be negative');
    expect(amountProblem('10.005')).toBe('Amount can have at most 2 decimals');
    expect(amountProblem('0', 'Amount', { positive: true })).toBe('Amount must be more than 0');
    expect(amountProblem('x')).toBe('Amount must be a number');
  });
  it('percent: 0–100', () => {
    expect(percentProblem('0')).toBeNull();
    expect(percentProblem('100')).toBeNull();
    expect(percentProblem('18', 'GST %')).toBeNull();
    expect(percentProblem('101', 'Discount')).toBe('Discount must be between 0 and 100');
    expect(percentProblem('-1')).toBe('Percentage must be between 0 and 100');
  });
});

describe('checkForm / cleanForm', () => {
  const SPEC = {
    name: { label: 'Name', required: true },
    phone: { label: 'Phone', kind: 'mobile', required: true },
    email: { label: 'Email', kind: 'email' },
    qty: { label: 'Quantity', kind: 'qty' },
    amount: { label: 'Amount', kind: 'positiveAmount', required: true },
  };
  it('a message per broken field', () => {
    const e = checkForm({ name: '   ', phone: '0654345678765', email: 'x@', qty: '0', amount: '' }, SPEC);
    expect(e).toEqual({
      name: 'Name is required',
      phone: MOBILE_MESSAGE,
      email: EMAIL_MESSAGE,
      qty: 'Quantity must be more than 0',
      amount: 'Amount is required',
    });
    expect(hasErrors(e)).toBe(true);
    expect(firstError(e)).toBe('Name is required');
  });
  it('optional quantity may be blank; required phone may not', () => {
    expect(checkForm({ name: 'A', phone: '', amount: '5' }, SPEC)).toEqual({ phone: 'Phone is required' });
    expect(checkForm({ name: 'A', phone: '+91 98765 43210', amount: '5' }, SPEC)).toEqual({});
  });
  it('trims every string and stores one phone/email format', () => {
    expect(cleanForm({ name: '  Ravi  ', phone: '+91 98765 43210', email: ' Ravi@Mail.COM ', n: 3, note: ' x ' }, SPEC))
      .toEqual({ name: 'Ravi', phone: '9876543210', email: 'ravi@mail.com', n: 3, note: 'x' });
  });
  it('requiredProblem treats an empty list as empty', () => {
    expect(requiredProblem([], 'Products')).toBe('Products is required');
  });
  it('checkLines reports by line', () => {
    const LINE = { quantity: { label: 'Quantity', kind: 'qty', required: true }, unitPrice: { label: 'Price', kind: 'amount' } };
    expect(checkLines([{ quantity: 2, unitPrice: 10 }, { quantity: 0, unitPrice: -1 }], LINE))
      .toEqual({ 1: { quantity: 'Quantity must be more than 0', unitPrice: 'Price cannot be negative' } });
  });
});

describe('count and flat line errors', () => {
  it('count allows 0 but not negatives or fractions', () => {
    expect(countProblem('0')).toBeNull();
    expect(countProblem('-1')).toBe('Quantity cannot be negative');
    expect(countProblem('1.5', 'Received')).toBe('Received must be a whole number');
  });
  it('lineFieldErrors flattens by prefix and index', () => {
    expect(lineFieldErrors([{ quantity: 1 }, { quantity: -2 }], { quantity: { label: 'Qty', kind: 'qty', required: true } }))
      .toEqual({ 'items.1.quantity': 'Qty must be more than 0' });
  });
});

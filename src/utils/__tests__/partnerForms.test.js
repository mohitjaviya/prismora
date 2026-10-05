import { describe, it, expect } from 'vitest';
import { partnerSpec, partnerExtra, PARTNER_PAYMENT_SPEC } from '../partnerForms';
import { checkForm } from '../formRules';
import { signupFieldErrors } from '../partnerSignup';

const GOOD = { name: 'Shree Traders', phone: '9876543210', email: 'a@b.com', state: 'Gujarat', pincode: '388001', address: 'Main road', creditLimit: 50000 };

describe('partner form rules', () => {
  it('a complete form has no errors', () => {
    expect(checkForm(GOOD, partnerSpec(null))).toEqual({});
  });
  it('asks for name, state, pincode and address, and the parent where there is one', () => {
    const e = checkForm({ ...GOOD, name: '', state: '', pincode: '', address: ' ' }, partnerSpec('parentDistributorId'));
    expect(Object.keys(e).sort()).toEqual(['address', 'name', 'parentDistributorId', 'pincode', 'state']);
  });
  it('phone: mobile only, landline refused', () => {
    expect(checkForm({ ...GOOD, phone: '02212345678' }, partnerSpec(null)).phone).toMatch(/mobile/);
    expect(checkForm({ ...GOOD, phone: '+91 98765 43210' }, partnerSpec(null)).phone).toBeUndefined();
  });
  it('email and credit limit', () => {
    const e = checkForm({ ...GOOD, email: 'nope', creditLimit: -5 }, partnerSpec(null));
    expect(e.email).toBeTruthy();
    expect(e.creditLimit).toMatch(/negative/);
  });
  it('gstin/pincode of an old row are not asked again unless changed', () => {
    const before = { gstin: '97678GHJ', pincode: '388001' };
    expect(partnerExtra(before)({ gstin: '97678GHJ', pincode: '388001' })).toEqual({});
    expect(partnerExtra(before)({ gstin: '12', pincode: '388001' }).gstin).toBeTruthy();
    expect(partnerExtra(null)({ gstin: '', pincode: '0' }).pincode).toBeTruthy();
  });
  it('payment amount: more than 0, 2 decimals, at most 10 crore', () => {
    for (const [v, ok] of [['100', true], ['0', false], ['-5', false], ['1.234', false], ['100000001', false], ['', false]]) {
      expect(Boolean(checkForm({ amount: v }, PARTNER_PAYMENT_SPEC).amount)).toBe(!ok);
    }
  });
});

describe('sign-up field messages', () => {
  const form = { name: 'A', contactPerson: 'B', phone: '9876543210', email: 'a@b.com', state: 'Gujarat', city: 'Anand', address: 'x', pincode: '388001', password: 'longenough' };
  it('none for a complete form', () => {
    expect(signupFieldErrors('distributor', form)).toEqual({});
  });
  it('one message per broken field', () => {
    const e = signupFieldErrors('dealer', { ...form, phone: '12345', email: 'bad', password: 'short', pincode: '0' });
    expect(Object.keys(e).sort()).toEqual(['email', 'parentDistributorId', 'password', 'phone', 'pincode']);
  });
});

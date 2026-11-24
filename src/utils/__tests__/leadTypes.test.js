import { describe, it, expect } from 'vitest';
import { canManageLeadTypes, leadTypeOptions, leadTypeProblem, leadsUsingType } from '../leadTypes';

const row = (key, active = true, sort = 0) => ({ id: key, list: 'lead_type', key, label: key, active, sort });

describe('lead types', () => {
  it('falls back to the four built-in types when the list is not saved', () => {
    expect(leadTypeOptions([]).map(o => o.key)).toEqual(['Distributor', 'Super Stockist', 'Dealer', 'Retailer']);
  });

  it('offers only active types, in order', () => {
    const m = [row('Dealer', true, 1), row('Wholesaler', false, 2), row('Distributor', true, 0)];
    expect(leadTypeOptions(m).map(o => o.key)).toEqual(['Distributor', 'Dealer']);
  });

  it('keeps a lead\'s switched-off type visible when editing', () => {
    const m = [row('Dealer'), row('Wholesaler', false)];
    const o = leadTypeOptions(m, 'Wholesaler');
    expect(o.map(x => x.key)).toEqual(['Dealer', 'Wholesaler']);
    expect(o[1].label).toMatch(/switched off/);
  });

  it('keeps an unknown stored value visible too', () => {
    expect(leadTypeOptions([row('Dealer')], 'Old Thing').map(o => o.key)).toContain('Old Thing');
  });

  it('allows a blank type', () => {
    expect(leadTypeProblem([row('Dealer')], '', '', true)).toBe('');
    expect(leadTypeProblem([row('Dealer')], '  ', 'Dealer', false)).toBe('');
  });

  it('refuses a new lead with a type that is off or unknown', () => {
    const m = [row('Dealer'), row('Wholesaler', false)];
    expect(leadTypeProblem(m, 'Wholesaler', '', true)).toMatch(/not an active/);
    expect(leadTypeProblem(m, 'Nope', '', true)).toMatch(/not an active/);
    expect(leadTypeProblem(m, 'Dealer', '', true)).toBe('');
  });

  it('never blocks an unchanged old value, even switched off', () => {
    const m = [row('Dealer'), row('Wholesaler', false)];
    expect(leadTypeProblem(m, 'Wholesaler', 'Wholesaler', false)).toBe('');
  });

  it('checks a changed value on an existing lead', () => {
    const m = [row('Dealer'), row('Wholesaler', false)];
    expect(leadTypeProblem(m, 'Wholesaler', 'Dealer', false)).toMatch(/not an active/);
    expect(leadTypeProblem(m, 'Dealer', 'Wholesaler', false)).toBe('');
  });

  it('only Admin and Super Admin manage the list', () => {
    expect(canManageLeadTypes('Admin')).toBe(true);
    expect(canManageLeadTypes('Super Admin')).toBe(true);
    expect(canManageLeadTypes('Sales Manager')).toBe(false);
    expect(canManageLeadTypes(undefined)).toBe(false);
  });

  it('counts leads using a type', () => {
    expect(leadsUsingType([{ leadType: 'Dealer' }, { leadType: 'Dealer' }, { leadType: 'X' }], 'Dealer')).toBe(2);
  });
});

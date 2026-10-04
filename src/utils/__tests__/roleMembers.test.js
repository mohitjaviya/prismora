import { describe, it, expect } from 'vitest';
import {
  linkedPartyOf, managersOf, duplicateFlags, roleMemberRows, memberSearchText, memberViewPath, memberStatus,
} from '../roleMembers';

const distributors = [
  { id: 'D1', name: 'Janki Traders', phone: '+91 98765 43210' },
  { id: 'D2', name: 'Shree Agencies', phone: '9876543210' },
  { id: 'D3', name: 'Other Firm', phone: '9000000001' },
];

describe('linkedPartyOf', () => {
  it('finds the firm a partner login is attached to', () => {
    expect(linkedPartyOf({ distributorId: 'D1' }, { distributors })).toMatchObject({
      kind: 'Distributor', name: 'Janki Traders', phone: '+91 98765 43210', path: '/distributors', found: true,
    });
  });
  it('keeps the link when the record is not readable', () => {
    expect(linkedPartyOf({ dealerId: 'X' }, {})).toMatchObject({ kind: 'Dealer', id: 'X', name: null, found: false });
  });
  it('is null for staff', () => {
    expect(linkedPartyOf({ id: 'U1' }, { distributors })).toBeNull();
  });
});

describe('managersOf', () => {
  it('lists whoever has the person in their team', () => {
    const users = [
      { id: 'M1', name: 'Asha', managedUsers: ['U1'] },
      { id: 'M2', name: 'Ravi', managedUsers: ['U2'] },
      { id: 'U1', name: 'Exec' },
    ];
    expect(managersOf({ id: 'U1' }, users)).toEqual(['Asha']);
    expect(managersOf({ id: 'U9' }, users)).toEqual([]);
  });
});

describe('duplicateFlags', () => {
  it('matches names ignoring case and spacing', () => {
    const f = duplicateFlags([
      { id: 'a', name: 'Mohit Javiya' }, { id: 'b', name: ' mohit  javiya ' }, { id: 'c', name: 'MOHIT JAVIYA' }, { id: 'd', name: 'Someone' },
    ]);
    expect(f).toEqual({ a: ['name'], b: ['name'], c: ['name'] });
  });
  it('matches phones by their last ten digits and e-mails ignoring case', () => {
    const f = duplicateFlags([
      { id: 'a', name: 'A', phone: '+91 98765 43210', email: 'x@y.com' },
      { id: 'b', name: 'B', phone: '9876543210', email: 'X@Y.com ' },
      { id: 'c', name: 'C', phone: '', email: '' },
      { id: 'd', name: 'D', phone: '123', email: '' },
      { id: 'e', name: 'E', phone: '123' },
    ]);
    expect(f).toEqual({ a: ['phone', 'email'], b: ['phone', 'email'] });
  });
  it('flags nothing in a list without repeats', () => {
    expect(duplicateFlags([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])).toEqual({});
    expect(duplicateFlags([])).toEqual({});
  });
});

describe('roleMemberRows', () => {
  const holders = [
    { id: 'U1', name: 'Mohit Javiya', email: 'm1@x.com', distributorId: 'D1', status: 'Active' },
    { id: 'U2', name: 'mohit javiya', email: 'm2@x.com', distributorId: 'D2', status: 'Inactive' },
    { id: 'U3', name: 'Priya', email: 'p@x.com', distributorId: 'D3' },
  ];
  const rows = roleMemberRows(holders, { users: holders, distributors });

  it('one row per holder, phone and party from the firm', () => {
    expect(rows.map(r => r.id)).toEqual(['U1', 'U2', 'U3']);
    expect(rows[0]).toMatchObject({ phone: '+91 98765 43210', party: { name: 'Janki Traders' }, status: 'Active' });
    expect(rows[2].status).toBe('Active');
  });
  it('flags the shared name and the shared phone', () => {
    expect(rows[0].duplicateOf).toEqual(['name', 'phone']);
    expect(rows[1].duplicateOf).toEqual(['name', 'phone']);
    expect(rows[2].duplicateOf).toEqual([]);
  });
  it('gives staff their managers instead of a party', () => {
    const users = [{ id: 'M', name: 'Boss', managedUsers: ['S'] }, { id: 'S', name: 'Exec', email: 's@x.com' }];
    const [r] = roleMemberRows([users[1]], { users });
    expect(r.party).toBeNull();
    expect(r.managers).toEqual(['Boss']);
    expect(r.phone).toBe('');
  });
  it('copes with nothing', () => {
    expect(roleMemberRows(undefined)).toEqual([]);
  });
});

describe('memberSearchText / memberViewPath / memberStatus', () => {
  const [r] = roleMemberRows([{ id: 'U1', name: 'A', email: 'a@x.com', distributorId: 'D1' }], { distributors });
  it('searches name, e-mail, phone and party', () => {
    const t = memberSearchText(r);
    ['A', 'a@x.com', '98765', 'Janki Traders'].forEach(s => expect(t).toContain(s));
  });
  it('opens the partner record, else the person on Team Members', () => {
    expect(memberViewPath(r, true)).toBe('/distributors?view=D1');
    expect(memberViewPath({ email: 'a b@x.com', party: null }, false)).toBe('/masters/team?q=a%20b%40x.com');
    expect(memberViewPath({ email: 'p@x.com', party: { found: false } }, true)).toBe('/masters/team?tab=partners&q=p%40x.com');
  });
  it('treats a missing status as Active', () => {
    expect(memberStatus({})).toBe('Active');
    expect(memberStatus({ status: 'Inactive' })).toBe('Inactive');
  });
});

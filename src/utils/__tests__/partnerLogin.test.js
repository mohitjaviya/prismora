import { describe, it, expect } from 'vitest';
import {
  PARTNER_LOGIN_KINDS, existingLogin, canCreateLogin, generatePassword, loginPayload,
} from '../partnerLogin';

const DIST = {
  id: 'DIST-1', name: 'Shree Ayur Agencies', contactPerson: 'Nilesh Shah',
  email: 'nilesh@shreeayur.com', status: 'Active',
};

describe('existingLogin', () => {
  it('finds the account by the link, not the email', () => {
    // A proprietor can run both a dealership and a retail counter from one
    // address. Matching on email would report the wrong one as already done.
    const users = [
      { id: 'U1', email: 'nilesh@shreeayur.com', dealerId: 'DEAL-9' },
      { id: 'U2', email: 'nilesh@shreeayur.com', distributorId: 'DIST-1' },
    ];
    expect(existingLogin('distributor', DIST, users).id).toBe('U2');
  });

  it('is nothing when no account points at this partner', () => {
    expect(existingLogin('distributor', DIST, [{ id: 'U1', distributorId: 'DIST-2' }])).toBeNull();
    expect(existingLogin('distributor', DIST, [])).toBeNull();
    expect(existingLogin('distributor', DIST)).toBeNull();
  });

  it('is nothing for a partner with no id or an unknown kind', () => {
    expect(existingLogin('distributor', {}, [])).toBeNull();
    expect(existingLogin('wholesaler', DIST, [])).toBeNull();
  });
});

describe('canCreateLogin', () => {
  it('allows it for an active partner with an email and no account yet', () => {
    expect(canCreateLogin('distributor', DIST, [])).toEqual({ ok: true, email: 'nilesh@shreeayur.com' });
  });

  it('refuses when one already exists, and hands back the account', () => {
    const users = [{ id: 'U2', email: 'nilesh@shreeayur.com', distributorId: 'DIST-1' }];
    const r = canCreateLogin('distributor', DIST, users);
    expect(r.ok).toBe(false);
    expect(r.already.id).toBe('U2');
    expect(r.reason).toMatch(/can already sign in/i);
  });

  it('refuses without an email, because that is what they sign in with', () => {
    const r = canCreateLogin('distributor', { ...DIST, email: '  ' }, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/add an email address/i);
  });

  it('refuses for a partner who has not been approved', () => {
    // 029 means a Pending account can read nothing, so the login would exist
    // and not work. Handing somebody a password that fails is worse than
    // telling the admin to approve first.
    ['Pending', 'Inactive', 'Rejected'].forEach(status => {
      const r = canCreateLogin('distributor', { ...DIST, status }, []);
      expect(r.ok, status).toBe(false);
      expect(r.reason).toMatch(/approve this distributor first/i);
    });
  });

  it('names the next action rather than the rule', () => {
    // "Add an email address to this distributor first" is something somebody
    // can do. "email is required" describes the form.
    expect(canCreateLogin('distributor', { ...DIST, email: '' }, []).reason).toMatch(/first/);
    expect(canCreateLogin('distributor', { ...DIST, status: 'Pending' }, []).reason).toMatch(/first/);
  });

  it('uses the right word for each kind', () => {
    Object.entries(PARTNER_LOGIN_KINDS).forEach(([kind, spec]) => {
      const r = canCreateLogin(kind, { id: 'X-1', email: '', status: 'Active' }, []);
      expect(r.reason, kind).toContain(spec.label);
    });
  });

  it('refuses a record that has not been saved', () => {
    expect(canCreateLogin('distributor', { email: 'a@b.com', status: 'Active' }, []).ok).toBe(false);
    expect(canCreateLogin('distributor', null, []).ok).toBe(false);
  });
});

describe('generatePassword', () => {
  it('is grouped so it can be read down a telephone', () => {
    const pw = generatePassword();
    expect(pw).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
  });

  it('always satisfies the account policy — a letter and a digit', () => {
    // Guaranteed, not hoped for. Random choice satisfies it almost always, and
    // "almost always" is not a policy.
    for (let i = 0; i < 200; i += 1) {
      const pw = generatePassword();
      expect(/[A-Za-z]/.test(pw), pw).toBe(true);
      expect(/[0-9]/.test(pw), pw).toBe(true);
      expect(pw.replace(/-/g, '').length).toBeGreaterThanOrEqual(8);
    }
  });

  it('leaves out the characters that get misheard', () => {
    // 0 and O, 1 and l and I. This gets delivered by voice.
    for (let i = 0; i < 200; i += 1) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('still satisfies the policy when the random source is degenerate', () => {
    // Every byte the same is the worst case a fixed-position guarantee has to
    // survive; without it this would be twelve identical letters.
    const pw = generatePassword(count => new Array(count).fill(0));
    expect(/[A-Za-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 300 }, () => generatePassword()));
    expect(seen.size).toBe(300);
  });
});

describe('loginPayload', () => {
  it('carries the link, which is the part that was always missing', () => {
    const p = loginPayload('distributor', DIST, 'abcd-efgh-2345');
    expect(p).toMatchObject({
      name: 'Nilesh Shah',
      email: 'nilesh@shreeayur.com',
      role: 'Distributor',
      distributorId: 'DIST-1',
    });
  });

  it('uses the right link column for each kind', () => {
    expect(loginPayload('dealer', { id: 'DEAL-1', email: 'a@b.com' }, 'x')).toHaveProperty('dealerId', 'DEAL-1');
    expect(loginPayload('retailer', { id: 'RTL-1', email: 'a@b.com' }, 'x')).toHaveProperty('retailerId', 'RTL-1');
    expect(loginPayload('dealer', { id: 'DEAL-1', email: 'a@b.com' }, 'x')).not.toHaveProperty('distributorId');
  });

  it('never sends a status — the function decides that', () => {
    expect(loginPayload('distributor', { ...DIST, status: 'Active' }, 'x')).not.toHaveProperty('status');
  });

  it('falls back to the business name when there is no contact person', () => {
    const p = loginPayload('distributor', { ...DIST, contactPerson: '  ' }, 'x');
    expect(p.name).toBe('Shree Ayur Agencies');
  });

  it('normalises the email it will be signed in with', () => {
    expect(loginPayload('distributor', { ...DIST, email: '  Nilesh@ShreeAyur.COM ' }, 'x').email)
      .toBe('nilesh@shreeayur.com');
  });

  it('gives back nothing it cannot build', () => {
    expect(loginPayload('wholesaler', DIST, 'x')).toBeNull();
    expect(loginPayload('distributor', {}, 'x')).toBeNull();
  });
});

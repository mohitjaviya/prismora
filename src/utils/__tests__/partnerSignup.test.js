import { describe, it, expect } from 'vitest';
import { validateSignup, signupPayload, signupOutcome, successMessage, SIGNUP_KINDS } from '../partnerSignup';

const FORM = {
  name: 'Shree Ayur Agencies',
  contactPerson: 'Nilesh Shah',
  phone: '9825011223',
  email: '  Nilesh@Example.CO.in ',
  password: 'a-long-enough-one',
  state: 'Gujarat',
  city: 'Ahmedabad',
  gstin: '24aabcs1429b1z5',
  territoryId: 'T-1',
  parentDistributorId: 'DIST-1',
  parentDealerId: 'DEAL-1',
};

describe('validateSignup', () => {
  it('accepts a completed form for each kind', () => {
    Object.keys(SIGNUP_KINDS).forEach(kind => {
      expect(validateSignup(kind, FORM)).toEqual({ ok: true });
    });
  });

  it('names the field that is missing, not just "invalid"', () => {
    expect(validateSignup('distributor', { ...FORM, name: '  ' }).error).toMatch(/business name/i);
    expect(validateSignup('distributor', { ...FORM, phone: '' }).error).toMatch(/phone/i);
    expect(validateSignup('distributor', { ...FORM, city: '' }).error).toMatch(/city/i);
  });

  it('refuses a password shorter than the function will accept', () => {
    // Eight is what the Edge Function enforces. Refusing seven here saves a
    // round-trip; the function refuses it again because the browser is not a gate.
    expect(validateSignup('distributor', { ...FORM, password: '1234567' }).ok).toBe(false);
    expect(validateSignup('distributor', { ...FORM, password: '12345678' }).ok).toBe(true);
  });

  it('refuses a half-typed email', () => {
    expect(validateSignup('distributor', { ...FORM, email: 'nilesh@' }).error).toMatch(/valid email/i);
  });

  it('requires a parent for the kinds that have one, and not for the one that does not', () => {
    expect(validateSignup('dealer', { ...FORM, parentDistributorId: '' }).error).toMatch(/distributor you buy through/i);
    expect(validateSignup('retailer', { ...FORM, parentDealerId: '' }).error).toMatch(/dealer you buy through/i);
    expect(validateSignup('distributor', { ...FORM, parentDistributorId: '', parentDealerId: '' }).ok).toBe(true);
  });

  it('refuses a kind it does not know', () => {
    expect(validateSignup('wholesaler', FORM).ok).toBe(false);
    expect(validateSignup(undefined, FORM).ok).toBe(false);
  });
});

describe('signupPayload', () => {
  it('normalises what it sends', () => {
    const p = signupPayload('distributor', FORM);
    expect(p.email).toBe('nilesh@example.co.in');
    expect(p.gstin).toBe('24AABCS1429B1Z5');
    expect(p.name).toBe('Shree Ayur Agencies');
  });

  it('never sends status, role, or a credit limit', () => {
    // The whole reason the writes moved to a function: a request is a claim,
    // and a stranger claiming status 'Active' is what this prevents.
    const p = signupPayload('distributor', { ...FORM, status: 'Active', role: 'Super Admin', creditLimit: 99999999 });
    expect(p).not.toHaveProperty('status');
    expect(p).not.toHaveProperty('role');
    expect(p).not.toHaveProperty('creditLimit');
    expect(p).not.toHaveProperty('outstandingAmount');
  });

  it('sends only the parent field its kind has', () => {
    expect(signupPayload('dealer', FORM)).toHaveProperty('parentDistributorId', 'DIST-1');
    expect(signupPayload('dealer', FORM)).not.toHaveProperty('parentDealerId');
    expect(signupPayload('retailer', FORM)).toHaveProperty('parentDealerId', 'DEAL-1');
    expect(signupPayload('distributor', FORM)).not.toHaveProperty('parentDistributorId');
  });

  it('sends null rather than an empty territory', () => {
    expect(signupPayload('distributor', { ...FORM, territoryId: '' }).territoryId).toBeNull();
    expect(signupPayload('distributor', { ...FORM, territoryId: undefined }).territoryId).toBeNull();
  });

  it('gives back nothing for a kind it does not know', () => {
    expect(signupPayload('wholesaler', FORM)).toBeNull();
  });

  it('always carries the honeypot, empty or not', () => {
    // The server decides what a filled one means. If the field were only sent
    // when filled, its absence would itself be the tell.
    expect(signupPayload('distributor', FORM)).toHaveProperty('website', '');
    expect(signupPayload('distributor', { ...FORM, website: 'http://spam.example' }))
      .toHaveProperty('website', 'http://spam.example');
  });
});

describe("the honeypot is not the browser's business", () => {
  it('does not refuse a filled one in the page', () => {
    // Refusing here would tell whatever filled it exactly which field to leave
    // alone next time, and the message would only ever be read by a person —
    // who never fills it. The function answers those with a success shape and
    // creates nothing.
    expect(validateSignup('distributor', { ...FORM, website: 'http://spam.example' }).ok).toBe(true);
  });
});

describe('signupOutcome', () => {
  it('is success only when the server said ok', () => {
    expect(signupOutcome({ data: { ok: true, partnerId: 'DIST-1' } }))
      .toMatchObject({ ok: true, partnerId: 'DIST-1' });
  });

  it('is NOT success for a 200 that does not say ok', () => {
    // This is the bug. The old page called setSubmitted(true) unconditionally,
    // so a refused write and a saved one looked identical to the person who
    // had just typed their business details in.
    expect(signupOutcome({ data: {} }).ok).toBe(false);
    expect(signupOutcome({ data: null }).ok).toBe(false);
    expect(signupOutcome({}).ok).toBe(false);
    expect(signupOutcome().ok).toBe(false);
  });

  it('is not success when the body carries an error', () => {
    const r = signupOutcome({ data: { error: 'That territory does not exist.' } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('That territory does not exist.');
  });

  it('prefers the unwrapped reason over the generic sentence', () => {
    // supabase-js reports every non-2xx as "Edge Function returned a non-2xx
    // status code" and hides the real answer on error.context.
    const r = signupOutcome({
      error: { message: 'Edge Function returned a non-2xx status code' },
      detail: 'An account with this email already exists. Sign in instead.',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/);
  });

  it('tells a missing deployment apart from a refusal', () => {
    const missing = signupOutcome({ error: { message: 'Failed to send a request to the Edge Function' } });
    expect(missing.needsDeploy).toBe(true);
    expect(missing.error).not.toMatch(/edge function/i);

    const refused = signupOutcome({ error: { message: 'boom' }, detail: 'The password must be at least 8 characters.' });
    expect(refused.needsDeploy).toBe(false);
  });

  it("passes the rate limit's own sentence through rather than rewriting it", () => {
    // A 429 arrives as an error with the reason on error.context, unwrapped
    // into `detail` by the caller. The function has already phrased it for
    // somebody who is probably not the person being throttled.
    const r = signupOutcome({
      error: { message: 'Edge Function returned a non-2xx status code' },
      detail: 'Too many registration attempts from here. Please wait an hour and try again, or contact us directly.',
    });
    expect(r.ok).toBe(false);
    expect(r.needsDeploy).toBe(false);
    expect(r.error).toMatch(/wait an hour/i);
  });

  it('assumes confirmation is needed unless told otherwise', () => {
    // Fails towards telling somebody to check their email. The opposite leaves
    // a confirmation link unopened and an approval that never seems to arrive.
    expect(signupOutcome({ data: { ok: true } }).emailConfirmationRequired).toBe(true);
    expect(signupOutcome({ data: { ok: true, emailConfirmationRequired: false } }).emailConfirmationRequired).toBe(false);
  });
});

describe('successMessage', () => {
  it('says to open the email when the address still has to be confirmed', () => {
    const m = successMessage('Shree Ayur Agencies', { emailConfirmationRequired: true });
    expect(m).toMatch(/Shree Ayur Agencies/);
    expect(m).toMatch(/confirmation link/i);
    expect(m).toMatch(/approv/i);
  });

  it('says only to wait for approval when it does not', () => {
    const m = successMessage('Shree Ayur Agencies', { emailConfirmationRequired: false });
    expect(m).not.toMatch(/confirmation link/i);
    expect(m).toMatch(/approv/i);
  });

  it('copes with no business name', () => {
    expect(successMessage('', {})).toMatch(/your business/);
    expect(successMessage(undefined, {})).toMatch(/your business/);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { normaliseEmail, looksLikeEmail, emailCheckVerdict, checkEmailTaken } from '../signupChecks';

const rpcClient = (data) => ({ rpc: vi.fn(async () => ({ data, error: null })) });
const rpcError = (message) => ({ rpc: async () => ({ data: null, error: { message } }) });
const rpcThrows = () => ({ rpc: async () => { throw new Error('Failed to fetch'); } });

describe('normaliseEmail', () => {
  it('is the form two spellings of one address share', () => {
    expect(normaliseEmail('  Nilesh.Shah@Example.COM ')).toBe('nilesh.shah@example.com');
  });

  it('copes with nothing', () => {
    expect(normaliseEmail(null)).toBe('');
    expect(normaliseEmail(undefined)).toBe('');
  });
});

describe('looksLikeEmail', () => {
  it('accepts an ordinary address', () => {
    expect(looksLikeEmail('nilesh@example.com')).toBe(true);
    expect(looksLikeEmail('  Shree.Ayur+billing@sub.example.co.in ')).toBe(true);
  });

  it('rejects what is still being typed', () => {
    ['', 'n', 'nilesh', 'nilesh@', 'nilesh@example', '@example.com', 'a@b'].forEach(v =>
      expect(looksLikeEmail(v)).toBe(false));
  });

  it('rejects two @ signs and stray whitespace', () => {
    expect(looksLikeEmail('a@b@example.com')).toBe(false);
    expect(looksLikeEmail('nilesh @example.com')).toBe(false);
  });

  it('rejects a domain whose dot is at an end', () => {
    expect(looksLikeEmail('nilesh@.com')).toBe(false);
    expect(looksLikeEmail('nilesh@example.')).toBe(false);
  });
});

describe('emailCheckVerdict', () => {
  it('blocks a taken address and says what to do about it', () => {
    const v = emailCheckVerdict({ taken: true, failed: false });
    expect(v.block).toBe(true);
    expect(v.error).toMatch(/already exists/i);
    expect(v.error).toMatch(/sign in/i);
  });

  it('lets a free address through', () => {
    expect(emailCheckVerdict({ taken: false, failed: false })).toEqual({ block: false, error: '' });
  });

  it('does not block when the check itself failed', () => {
    // signUp refuses a duplicate anyway. Blocking on a dropped connection --
    // or on 028 not having been run -- would make a signup form nobody can
    // get past, which is worse than the message this was meant to improve.
    expect(emailCheckVerdict({ taken: false, failed: true }).block).toBe(false);
    expect(emailCheckVerdict({ taken: true, failed: true }).block).toBe(false);
  });

  it('does not block on no answer at all', () => {
    expect(emailCheckVerdict().block).toBe(false);
    expect(emailCheckVerdict({}).block).toBe(false);
  });
});

describe('checkEmailTaken', () => {
  it('reports an address that is taken', async () => {
    expect(await checkEmailTaken(rpcClient(true), 'nilesh@example.com'))
      .toMatchObject({ taken: true, failed: false });
  });

  it('reports one that is free', async () => {
    expect(await checkEmailTaken(rpcClient(false), 'nilesh@example.com'))
      .toMatchObject({ taken: false, failed: false });
  });

  it('sends the normalised address, so case and spacing cannot miss a match', async () => {
    const client = rpcClient(false);
    await checkEmailTaken(client, '  Nilesh@Example.COM ');
    expect(client.rpc).toHaveBeenCalledWith('email_taken', { p_email: 'nilesh@example.com' });
  });

  it('does not ask about something that is not an address yet', async () => {
    const client = rpcClient(true);
    const r = await checkEmailTaken(client, 'nilesh@');
    expect(r.failed).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('treats the RPC not existing as a failure, not as "free"', async () => {
    // Which is what 028 not having been run looks like: PostgREST 404s.
    const r = await checkEmailTaken(rpcError('Could not find the function public.email_taken'), 'a@example.com');
    expect(r).toMatchObject({ taken: false, failed: true });
    expect(r.reason).toMatch(/email_taken/);
  });

  it('survives the fetch throwing', async () => {
    const r = await checkEmailTaken(rpcThrows(), 'a@example.com');
    expect(r).toMatchObject({ taken: false, failed: true });
    expect(r.reason).toMatch(/failed to fetch/i);
  });

  it('refuses to work without a client rather than throwing', async () => {
    expect((await checkEmailTaken(null, 'a@example.com')).failed).toBe(true);
    expect((await checkEmailTaken({}, 'a@example.com')).failed).toBe(true);
  });

  it('only counts an exact true as taken', async () => {
    // A shape this does not recognise must not block a legitimate signup.
    for (const data of ['true', 1, {}, [true], null, undefined]) {
      expect((await checkEmailTaken(rpcClient(data), 'a@example.com')).taken).toBe(false);
    }
  });
});

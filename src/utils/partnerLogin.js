/**
 * Giving a channel partner a way into their own portal.
 *
 * Adding a distributor from the Distributors screen writes one row, to the
 * distributors table. It does not create a login, has never asked for a
 * password, and nothing else in the application fills that in afterwards --
 * so a partner onboarded the ordinary way could not sign in at all. The same
 * was true of dealers and retailers.
 *
 * Settings can create a user whose role is 'Distributor', which looks like the
 * answer and is not: the profile it writes has no `distributorId`, and every
 * portal screen finds its partner with
 *
 *     distributors.find(d => d.id === user.distributorId)
 *
 * so the portal comes up empty. In the database `my_distributor_id()` returns
 * NULL too, and the row-level policies show them nothing. The link is the whole
 * thing, and until now only the public signup form ever created one.
 *
 * What is here is the part with decisions in it: whether a partner can be given
 * a login at all, what that login is made of, and what the password is.
 */

/** Which partner is which, and what the profile has to say to point at it. */
export const PARTNER_LOGIN_KINDS = {
  distributor: { role: 'Distributor', linkColumn: 'distributorId', label: 'distributor' },
  dealer: { role: 'Dealer', linkColumn: 'dealerId', label: 'dealer' },
  retailer: { role: 'Retailer', linkColumn: 'retailerId', label: 'retailer' },
};

/**
 * The account that already lets this partner in, if there is one.
 *
 * Found by the link rather than by the email address. Two partners can share a
 * contact's address -- a proprietor who runs both a dealership and a retail
 * counter -- and matching on email would report the wrong one as already done.
 */
export function existingLogin(kind, partner, users = []) {
  const spec = PARTNER_LOGIN_KINDS[kind];
  if (!spec || !partner?.id) return null;
  return (users || []).find(u => u?.[spec.linkColumn] === partner.id) || null;
}

/**
 * Whether a login can be created, and if not, what to do about it.
 *
 * Each refusal names the next action rather than the rule it broke. "Add an
 * email address to this distributor first" is something somebody can act on;
 * "email is required" is a description of the form.
 */
export function canCreateLogin(kind, partner, users = []) {
  const spec = PARTNER_LOGIN_KINDS[kind];
  if (!spec) return { ok: false, reason: 'Unknown partner type.' };
  if (!partner?.id) return { ok: false, reason: 'Save this record before creating a login for it.' };

  const already = existingLogin(kind, partner, users);
  if (already) {
    return { ok: false, already, reason: `${already.email} can already sign in for this ${spec.label}.` };
  }

  const email = String(partner.email ?? '').trim();
  if (!email) {
    return { ok: false, reason: `Add an email address to this ${spec.label} first — it is what they sign in with.` };
  }

  if (partner.status !== 'Active') {
    // A login made now would be created Pending to match, and 029 means a
    // Pending account can read nothing. Handing somebody a password that does
    // not work is worse than telling the admin to approve first.
    return { ok: false, reason: `Approve this ${spec.label} first — a login made now could not sign in.` };
  }

  return { ok: true, email };
}

/**
 * A password nobody has to invent.
 *
 * Admins onboarding twenty partners reuse one password across all of them, and
 * a password typed into a form over a phone call is chosen to be easy to say.
 * This is generated, shown once, and passed on.
 *
 * The alphabet leaves out the characters that are read back wrongly down a
 * telephone -- 0 and O, 1 and l and I -- because that is exactly how this will
 * be delivered. Grouped with dashes for the same reason: "seven em kay, dash,
 * cue arr four tee" is a thing a person can say to another person.
 *
 * At least one letter and one digit, which is what the account policy requires,
 * is guaranteed rather than hoped for: the groups are long enough that random
 * choice almost always satisfies it, and "almost always" is not a policy.
 */
const LETTERS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

export function generatePassword(randomInts = cryptoRandomInts, groups = 3, size = 4) {
  const total = groups * size;
  const values = randomInts(total);

  const chars = [];
  for (let i = 0; i < total; i += 1) {
    chars.push(ALPHABET[values[i] % ALPHABET.length]);
  }

  // Guarantee the policy rather than rely on the odds. Two fixed positions,
  // chosen from the ends so the two guarantees cannot land on each other.
  chars[0] = LETTERS[values[0] % LETTERS.length];
  chars[total - 1] = DIGITS[values[total - 1] % DIGITS.length];

  const out = [];
  for (let g = 0; g < groups; g += 1) out.push(chars.slice(g * size, (g + 1) * size).join(''));
  return out.join('-');
}

/** Random bytes from the platform, not Math.random — this is a credential. */
function cryptoRandomInts(count) {
  const out = new Uint32Array(count);
  globalThis.crypto.getRandomValues(out);
  return Array.from(out);
}

/**
 * What to send when creating the login.
 *
 * `status` is absent on purpose, as is `role`'s freedom: the Edge Function sets
 * both, because a request is a claim. What travels is who the partner is and
 * which record the profile must point at.
 */
export function loginPayload(kind, partner, password) {
  const spec = PARTNER_LOGIN_KINDS[kind];
  if (!spec || !partner?.id) return null;

  return {
    name: String(partner.contactPerson ?? '').trim() || String(partner.name ?? '').trim(),
    email: String(partner.email ?? '').trim().toLowerCase(),
    password: String(password ?? ''),
    role: spec.role,
    [spec.linkColumn]: partner.id,
  };
}

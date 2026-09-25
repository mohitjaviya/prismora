// One sign-in per role for testing, named "TEST …" with @prismora.test emails.
//
//   node scripts/create-test-accounts.mjs
//
// Passwords are generated here and written only to .env.test-accounts.local
// (git-ignored). The SQL that sets them is written to a temp file, run, and
// deleted. Re-running replaces the accounts with new passwords.
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REF = 'qvckvvckkfvelhnxmmvp';
const TERRITORY = 'T-1790057083440'; // Demo Gujarat

const ACCOUNTS = [
  { key: 'SUPER_ADMIN', role: 'Super Admin' },
  { key: 'ADMIN', role: 'Admin' },
  { key: 'DIRECTOR', role: 'Director' },
  { key: 'SALES_MANAGER', role: 'Sales Manager', team: ['SALES_EXEC_1', 'SALES_EXEC_2'] },
  { key: 'SALES_EXEC_1', role: 'Sales Executive' },
  { key: 'SALES_EXEC_2', role: 'Sales Executive' },
  { key: 'SALES', role: 'Sales' },
  { key: 'ACCOUNTS', role: 'Accounts' },
  { key: 'DISPATCH', role: 'Dispatch Team' },
  { key: 'WAREHOUSE', role: 'Warehouse Manager' },
  { key: 'PURCHASE_MANAGER', role: 'Purchase Manager' },
  { key: 'CUSTOMER_SUPPORT', role: 'Customer Support' },
  { key: 'DISTRIBUTOR', role: 'Distributor', link: ['distributorId', 'D-TEST-1'] },
  { key: 'DEALER', role: 'Dealer', link: ['dealerId', 'DL-TEST-1'] },
  { key: 'RETAILER', role: 'Retailer', link: ['retailerId', 'R-TEST-1'] },
];

const lit = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const pw = () => `${randomBytes(9).toString('base64url')}#7a`;
const slug = (k) => k.toLowerCase().replace(/_/g, '.');
const idOf = (k) => `U-TEST-${k.replace(/_/g, '-')}`;
const nameOf = (a) => `TEST ${a.role}${/_\d$/.test(a.key) ? ` ${a.key.slice(-1)}` : ''}`;

const rows = ACCOUNTS.map(a => ({ ...a, id: idOf(a.key), email: `test.${slug(a.key)}@prismora.test`, password: pw(), authId: randomUUID() }));

const sql = [`begin;`,
  // Partner records the partner logins sign in to.
  `insert into distributors (id, name, state, city, phone, email, "contactPerson", "outstandingAmount", "creditLimit", status, "createdAt", address, pincode, "territoryId")
   values ('D-TEST-1', 'TEST Distributor Pvt Ltd', 'Gujarat', 'Surat', '9000000001', 'test.distributor@prismora.test', 'TEST Distributor', 0, 500000, 'Active', now(), 'TEST 1 Ring Road', '395003', ${lit(TERRITORY)})
   on conflict (id) do nothing;`,
  `insert into dealers (id, name, "parentDistributorId", state, city, phone, email, "contactPerson", "outstandingAmount", "creditLimit", status, "createdAt", address, pincode, "territoryId")
   values ('DL-TEST-1', 'TEST Dealer Traders', 'D-TEST-1', 'Gujarat', 'Surat', '9000000002', 'test.dealer@prismora.test', 'TEST Dealer', 0, 200000, 'Active', now(), 'TEST 2 Station Road', '395002', ${lit(TERRITORY)})
   on conflict (id) do nothing;`,
  `insert into retailers (id, name, "parentDealerId", state, city, phone, email, "contactPerson", "outstandingAmount", "creditLimit", status, "createdAt", address, pincode, "territoryId")
   values ('R-TEST-1', 'TEST Retail Pharmacy', 'DL-TEST-1', 'Gujarat', 'Surat', '9000000003', 'test.retailer@prismora.test', 'TEST Retailer', 0, 50000, 'Active', now(), 'TEST 3 Market Lane', '395001', ${lit(TERRITORY)})
   on conflict (id) do nothing;`,
  // Replace any earlier run's accounts.
  `delete from auth.users where email like 'test.%@prismora.test';`,
  `delete from public.users where id like 'U-TEST-%';`,
];

for (const a of rows) {
  sql.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, is_sso_user)
    values ('00000000-0000-0000-0000-000000000000', ${lit(a.authId)}, 'authenticated', 'authenticated', ${lit(a.email)},
      extensions.crypt(${lit(a.password)}, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', false);`);
  sql.push(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (${lit(a.authId)}, ${lit(a.authId)}, jsonb_build_object('sub', ${lit(a.authId)}, 'email', ${lit(a.email)}, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now());`);
  const team = (a.team || []).map(idOf);
  const [linkCol, linkId] = a.link || [];
  sql.push(`insert into public.users (id, name, email, role, "managedUsers", status${linkCol ? `, "${linkCol}"` : ''})
    values (${lit(a.id)}, ${lit(nameOf(a))}, ${lit(a.email)}, ${lit(a.role)}, array[${team.map(lit).join(',')}]::text[], 'Active'${linkCol ? `, ${lit(linkId)}` : ''});`);
}
sql.push(`select count(*) as n from public.users where id like 'U-TEST-%';`, `commit;`);

const file = join(mkdtempSync(join(tmpdir(), 'acc-')), 'accounts.sql');
writeFileSync(file, sql.join('\n'));
try {
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['-y', 'supabase@2.117.0', 'db', 'query', '--linked', '--project-ref', REF, '--output-format', 'json', '-f', file],
    { encoding: 'utf8', shell: process.platform === 'win32' });
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (json.error) throw new Error(JSON.stringify(json.error));
  console.log(`created ${json.rows?.[0]?.n} test accounts`);
} finally {
  unlinkSync(file);
}

const env = ['# Test sign-ins, one per role. Local only — never commit, never paste.', `# Created ${new Date().toISOString()}`, ''];
for (const a of rows) env.push(`TEST_${a.key}_EMAIL=${a.email}`, `TEST_${a.key}_PASSWORD=${a.password}`, `TEST_${a.key}_ROLE=${a.role}`, '');
writeFileSync('.env.test-accounts.local', env.join('\n'));
console.log('passwords written to .env.test-accounts.local');

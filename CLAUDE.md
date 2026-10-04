# PRISMORA (ERP/CRM for Janki Herbals)

## Stack
- React 19, Vite 8, react-router 7, Tailwind 4, recharts, @hello-pangea/dnd, lucide-react
- Supabase (Postgres + RLS + Auth + Storage + Edge Functions); `@supabase/supabase-js` 2.x
- Tests: Vitest 3. Lint: ESLint 10 (react-hooks 7)
- Hosting: Vercel, deploys `main`. Live: https://prismora-henna.vercel.app
- Supabase project ref: `qvckvvckkfvelhnxmmvp`. All data is demo/TEST.

## Folders
- `src/pages` screens; `src/components` shared UI; `src/context` Auth/Data/Dialog providers
- `src/context/DataContext.jsx` data layer (all reads/writes)
- `src/utils` pure logic + `__tests__`
- `migrations/` numbered SQL (`NNN_name.sql`) + `README.md` ledger; next is `085`
- `supabase/functions` Edge Functions (`create-user`, `partner-signup`)
- `scripts/` backup, restore, test-account scripts
- `test-results/full-test/` test programme docs (gitignored; hand-over docs force-added)

## Run / test / build
- `npm run dev` (port 5174 used locally), `npm test`, `npm run build`, `npm run lint`
- Apply a migration: `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/0NN_x.sql`
- Backup: `node scripts/make-backup.mjs`; restore: `scripts/restore.mjs`
- Deploy: commit on `fix/erp-session-2026-09`, push, ff-merge into `main`, push; check `npx vercel ls prismora`
- Test logins: `.env.test-accounts.local` (`TEST_<ROLE>_EMAIL/_PASSWORD`). Never print or commit.

## Conventions
- Every DB change = new numbered migration + README entry. Never edit old ones.
- Rules live in the database (RLS/triggers), not just the screen. Screen mirrors them (`utils/orderFlow.js`).
- Balances (partner and vendor) move only in DB triggers; never write `outstandingAmount` from the app.
- Saves go through `journaled()`/`persist()` (`utils/writeJournal.js`); reload rows after DB-side changes.
- Edits use `updatedAt` stamps for stale-form warnings (`utils/staleEdit.js`).
- Test records are named `TEST…`. Confirm every save in the DB, not the screen.

## Gotchas
- `partner_balance_drift()` / `vendor_balance_drift()` answer only a signed-in Accounting viewer; the SQL role always sees empty.
- Partners cannot write `distributor_incentives` (RLS), but incentives are generated in the browser.
- `supabase db query` sometimes returns empty: retry.
- Windows: Git Bash heredocs choke on long quoted text; write files instead.
- DataContext lint has 28 old problems; don't add new ones.
- Order stages: Pending → Processing → Ready for Dispatch → Shipped → Delivered, one step, by owner role; invoiced orders are locked.
- Scheme/option lists in partner forms are valued by id, labelled "name — ₹price".

## Token-saving rules
- Keep context small. Only read files I mention or that are clearly needed; ask before exploring the whole project.
- When context gets large (around 80k tokens), remind me to run /compact or /clear.
- Before I clear a session, write a short NOTES.md with: the bug/task, root cause, files changed, what was tried, and next steps.
- At the start of a new session, read NOTES.md first if it exists.
- For bigger changes, show a short plan and wait for my approval before editing code.
- Keep responses short. Don't repeat code or explanations I've already seen.
- One task per session. If I switch to an unrelated task, remind me to /clear first.

## Working rules
- Check /usage and /context periodically; flag me if context is approaching 80-100k tokens so we can wrap up and /clear instead of continuing.
- When resuming after /clear, always start by reading NOTES.md and CLAUDE.md first before doing anything else.
- Prefer being pointed at specific files over searching broadly.
- For any migration or deploy, briefly state the plan before running commands, not after.
- Stop rules stay as before: blocked/denied commands, failing writes, same script failing 3 times in a row.

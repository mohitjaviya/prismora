# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Supabase keep-alive

A free Supabase project is paused after 7 days without activity. Jobs inside the database (such as `invoice-status-nightly`) don't count, so a GitHub Actions workflow keeps it awake.

**What it does.** `.github/workflows/supabase-keepalive.yml` runs every 2 days (03:17 UTC) and has a manual **Run workflow** button. It calls two REST functions from migration `085_system_heartbeat.sql`:
- `heartbeat_ping()` stamps `last_ping_at` on the one row of `system_heartbeat`.
- `heartbeat_status()` reads the row back.

The run fails (red, and GitHub e-mails the repo owner) if either call fails, the two values differ, or the stamp is more than 5 minutes off. The table has RLS on and no policies, and anon has no table rights. The anon key can only run these two functions. No business table is touched, and the ERP never loads this table.

**Secrets needed** (repo → Settings → Secrets and variables → Actions → New repository secret):
- `SUPABASE_URL`: `https://qvckvvckkfvelhnxmmvp.supabase.co`
- `SUPABASE_ANON_KEY`: the anon (or publishable) key, the same one the app uses as `VITE_SUPABASE_ANON_KEY`. Never use the service_role key.

**Checking it works.**
- GitHub → Actions → *Supabase keep-alive*: every run should be green, ending in "OK: heartbeat stamped at …".
- In the Supabase SQL editor: `select * from public.system_heartbeat;`. `last_ping_at` should be less than 2 days old, with `source` = `github-actions run <id>`.

**If the project pauses anyway.** Open the Supabase dashboard → the project → **Restore project** (restoring takes a few minutes; data is kept). Then run the workflow by hand and check why the schedule stopped.

**Note:** GitHub disables scheduled workflows in a repository with no activity for about 60 days and sends a warning e-mail first. If that happens, re-enable it under Actions → *Supabase keep-alive* → **Enable workflow**, or push any commit.

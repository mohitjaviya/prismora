import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// These are read at build time, not run time. A deployment built without them
// produces a bundle with `undefined` baked in, and createClient throws as the
// module loads — before React renders anything, so the screen stays blank and
// the reason never reaches the console in a form anyone can act on.
//
// `isConfigured` lets the app say which variable is missing instead, and gives
// the sign-in screen something truthful to show rather than blaming the
// password for a build that was never given its keys.
export const missingEnvVars = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean);

export const isConfigured = missingEnvVars.length === 0;

if (!isConfigured) {
  console.error(
    '[Prismora] Missing environment variable(s): ' + missingEnvVars.join(', ') +
    '. In Vercel these are set under Settings → Environment Variables, and the ' +
    'project must be redeployed afterwards — they are baked in at build time.'
  );
}

// Placeholders keep createClient from throwing at module load. Every request
// made through it fails, which is correct and now visible, rather than taking
// the whole app down before it can explain itself.
export const supabase = createClient(
  supabaseUrl || 'https://unconfigured.invalid',
  supabaseAnonKey || 'unconfigured'
);

// Which project this build points at. Two deployments pointing at different
// Supabase projects look identical until you compare this — the accounts exist
// in one and not the other, and every sign-in reads as a wrong password.
export const supabaseProjectUrl = supabaseUrl || null;

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase, isConfigured, missingEnvVars } from '../supabaseClient';

export const USER_ROLES = [
  'Super Admin',
  'Director',
  'Sales Manager',
  'Sales Executive',
  'Purchase Manager',
  'Warehouse Manager',
  'Accounts',
  'Dispatch Team',
  'Customer Support',
  'Distributor',
  'Dealer',
  'Retailer'
];

export const isAdminRole = (role) => ['Super Admin', 'Director', 'Admin'].includes(role);
export const isManagerRole = (role) => ['Sales Manager', 'Purchase Manager', 'Manager'].includes(role);
export const isSalesRole = (role) => ['Sales Executive', 'Sales'].includes(role);

// Full permission matrix — 'full' | 'view' | 'none'
export const PERMISSIONS = {
  'Super Admin': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'full', inventory:'full', purchases:'full', distributors:'full', dealers:'full', retailers:'full',
    accounting:'full', schemes:'full', complaints:'full', reports:'full', settings:'full',
    ledger:'full', claims:'full', incentives:'full', stock:'full', priceList:'full'
  },
  'Director': {
    dashboard:'full', leads:'view', sfa:'view', customers:'view', geography:'view',
    orders:'view', inventory:'view', purchases:'view', distributors:'view', dealers:'view', retailers:'view',
    accounting:'full', schemes:'view', complaints:'view', reports:'full', settings:'none',
    ledger:'none', claims:'view', incentives:'view', stock:'none', priceList:'none'
  },
  'Sales Manager': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'view', inventory:'view', purchases:'none', distributors:'view', dealers:'view', retailers:'view',
    accounting:'none', schemes:'view', complaints:'view', reports:'full', settings:'none',
    ledger:'none', claims:'view', incentives:'view', stock:'none', priceList:'none'
  },
  'Sales Executive': {
    dashboard:'full', leads:'full', sfa:'full', customers:'view', geography:'view',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Purchase Manager': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'full', purchases:'full', distributors:'full', dealers:'full', retailers:'full',
    accounting:'view', schemes:'none', complaints:'none', reports:'view', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Warehouse Manager': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'full', inventory:'full', purchases:'view', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'none', complaints:'none', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Accounts': {
    dashboard:'full', leads:'none', sfa:'none', customers:'view', geography:'none',
    orders:'view', inventory:'none', purchases:'view', distributors:'view', dealers:'view', retailers:'view',
    accounting:'full', schemes:'view', complaints:'none', reports:'full', settings:'none',
    ledger:'none', claims:'full', incentives:'full', stock:'none', priceList:'none'
  },
  'Dispatch Team': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'full', inventory:'view', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'none', complaints:'none', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Customer Support': {
    dashboard:'full', leads:'view', sfa:'none', customers:'full', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Distributor': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'view', claims:'full', incentives:'view', stock:'view', priceList:'view'
  },
  'Dealer': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'view', claims:'full', incentives:'view', stock:'view', priceList:'view'
  },
  'Retailer': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'view', claims:'full', incentives:'view', stock:'view', priceList:'view'
  },
  // Legacy roles for backwards compatibility
  'Admin': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'full', inventory:'full', purchases:'full', distributors:'full', dealers:'full', retailers:'full',
    accounting:'full', schemes:'full', complaints:'full', reports:'full', settings:'full',
    ledger:'full', claims:'full', incentives:'full', stock:'full', priceList:'full'
  },
  'Manager': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'view', inventory:'view', purchases:'none', distributors:'view', dealers:'view', retailers:'view',
    accounting:'none', schemes:'view', complaints:'view', reports:'full', settings:'none',
    ledger:'none', claims:'view', incentives:'view', stock:'none', priceList:'none'
  },
  'Sales': {
    dashboard:'full', leads:'full', sfa:'full', customers:'view', geography:'view',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  }
};

const AuthContext = createContext();

// Password never travels further than the sign-in check.
const withoutPassword = (u) => {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
};

export const AuthProvider = ({ children }) => {
  // Initialize directly from localStorage so refresh never logs user out
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('prismora_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState([]);


  // False until the Supabase session has been read once, so the app can tell
  // "not signed in" apart from "not checked yet" and stop bouncing a refresh
  // to the login page before the session comes back.
  const [authReady, setAuthReady] = useState(false);

  /**
   * The profile row behind a signed-in email.
   *
   * Supabase Auth owns the password and nothing else. Identity stays with the
   * `users` table, because the whole app keys off its ids — an order carries
   * assignedTo '3', not a Supabase UUID, and every ownership check compares
   * against that. Auth confirms who you are; this says what you are.
   *
   * Matched case-insensitively: Auth lowercases the email it stores, and the
   * users table holds whatever was typed.
   */
  const loadProfile = async (email) => {
    if (!email) return { profile: null, failed: true };
    const { data, error } = await supabase
      .from('users').select('*').ilike('email', email).maybeSingle();
    // "The read failed" and "there is genuinely no such person" have to be told
    // apart. Row-level security answers an unauthenticated read with zero rows
    // rather than an error, so a query that goes out a moment before the new
    // token is attached looks exactly like an account that does not exist.
    if (error) return { profile: null, failed: true };
    return { profile: data ? withoutPassword(data) : null, failed: false };
  };

  /**
   * The profile, given a session that has only just been created.
   *
   * signInWithPassword resolves before the client has necessarily attached the
   * new token to outgoing requests. The very next query can therefore go out
   * unauthenticated, and against an RLS-protected table that comes back empty —
   * indistinguishable from having no account. That is what made the first
   * sign-in attempt report a wrong password and the second, with the identical
   * password, succeed: the first was signed straight back out again.
   */
  const loadProfileAfterSignIn = async (email) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { profile, failed } = await loadProfile(email);
      if (profile) return profile;
      if (!failed && attempt >= 2) return null;   // twice empty, no error: really absent
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
    return null;
  };

  // Set the moment a sign-in succeeds. The session check below starts when the
  // page loads and can still be in flight when someone signs in — it would then
  // come back "no session", because it asked before they did, and clear the
  // session they just created. On a fast connection it resolves before anyone
  // can click; on a slower one the dashboard opened and was immediately thrown
  // back to the login page.
  const signedIn = useRef(false);

  const applySession = (profile) => {
    signedIn.current = true;
    setUser(profile);
    try { localStorage.setItem('prismora_user', JSON.stringify(profile)); } catch { /* storage blocked */ }
  };

  const clearSession = () => {
    signedIn.current = false;
    setUser(null);
    try { localStorage.removeItem('prismora_user'); } catch { /* storage blocked */ }
  };

  // The Supabase session is the source of truth for whether someone is signed
  // in. localStorage still seeds `user` above so a refresh does not flash the
  // login page, but if the session has expired this corrects it a moment later
  // — a copy in localStorage is no longer proof of anything.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Bounded. getSession usually answers from local storage in a moment,
      // but it refreshes an expired token over the network first, and a request
      // that never comes back would leave authReady false and the whole app
      // sitting on "Loading…" for ever — the exact failure this guard exists to
      // prevent. Past the deadline we treat it as "no session" and let the
      // login page do its job.
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise(resolve => setTimeout(() => resolve({ data: null }), 8000)),
      ]);
      if (cancelled) return;
      const email = data?.session?.user?.email;
      if (!email) {
        // Only clear if nobody has signed in while this was in flight. This
        // answer describes the moment the page loaded, and signing in since
        // then makes it stale — acting on it logged the person straight back
        // out of the dashboard they had just reached.
        if (!signedIn.current) clearSession();
        setAuthReady(true);
        return;
      }
      const { profile, failed } = await loadProfile(email);
      if (cancelled) return;
      // A read that failed says nothing about whether the account exists, so it
      // must not end a session Supabase considers valid. Keeping the cached
      // profile is the safe answer; the next load corrects it.
      if (profile) applySession(profile);
      else if (!failed) clearSession();
      setAuthReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') { clearSession(); return; }
      const email = session?.user?.email;
      if (!email) return;
      // Runs immediately after sign-in too, so it needs the same patience: the
      // token may not be attached to outgoing requests for another moment.
      const profile = await loadProfileAfterSignIn(email);
      if (cancelled) return;
      if (profile) applySession(profile);
    });

    return () => { cancelled = true; sub?.subscription?.unsubscribe(); };
  }, []);

  const fetchUsers = async () => {
    // Accounts come from Supabase and nowhere else. There used to be a
    // DEFAULT_USERS list merged in here and used as a login fallback, which
    // shipped a working Super Admin password inside the JavaScript bundle —
    // anyone who opened the deployed site could sign in as admin@prismora.com.
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      const fetched = data || [];
      setUsers(fetched);

      // Refresh the signed-in user's own record so a role or permission change
      // takes effect without them signing out.
      //
      // This no longer ends the session when the row is missing. Whether
      // someone is signed in is the Supabase session's business now, and this
      // runs on mount alongside the session restore — racing it would sign
      // people out mid-refresh for no reason. A row that has genuinely gone is
      // caught by the restore, which signs out on a missing profile.
      const savedUser = localStorage.getItem('prismora_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const fresh = fetched.find(u => u.id === parsed.id);
        if (fresh) applySession(withoutPassword(fresh));
      }
    } catch (err) {
      console.error('[Prismora] Could not load user accounts from Supabase.', err?.message || err);
    }
  };

  // Declared after fetchUsers deliberately. An effect runs after the component
  // body, so calling it from above worked — but it read as using a value before
  // it exists, and the linter was right to say so.
  useEffect(() => {
    fetchUsers();
  }, []);

  // Returns true (success) | false (invalid credentials) | 'pending' | 'rejected'
  const login = async (email, password) => {
    try {
      // Checked by Supabase Auth against a hash it alone holds. This used to be
      // `.eq('password', password)` against the users table — a table the
      // browser's own key can read, so every password in the company was
      // readable by anyone who opened the deployed site and pressed F12.
      if (!isConfigured) return 'unconfigured';

      const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
        email: String(email || '').trim(),
        password,
      });

      // Only a genuine credential rejection may be reported as a wrong
      // password. Everything else — an unreachable project, a bad key, a
      // confirmation still pending — used to come back as `false` and be shown
      // as "invalid email or password", which sent people hunting for a typo
      // in a password that was correct all along.
      if (authError) {
        const msg = String(authError.message || authError);
        if (/invalid login credentials/i.test(msg)) return false;
        if (/email not confirmed/i.test(msg)) return 'unconfirmed';
        console.error('[Prismora] Sign-in failed:', msg);
        return 'error:' + msg;
      }
      if (!auth?.user) return false;

      const profile = await loadProfileAfterSignIn(auth.user.email);
      if (!profile) {
        // What the read actually returned, so a failure can be told apart from
        // an account that is genuinely absent without opening the console.
        const probe = await loadProfile(auth.user.email);
        console.error('[Prismora] Profile lookup came back empty for', auth.user.email,
          '— read failed:', probe.failed);
        await supabase.auth.signOut();
        return 'no-profile:' + (probe.failed ? 'read-blocked' : 'not-found') + ':' + auth.user.email;
      }
      if (profile.status === 'Pending') { await supabase.auth.signOut(); return 'pending'; }
      if (profile.status === 'Rejected') { await supabase.auth.signOut(); return 'rejected'; }

      applySession(profile);
      return true;
    } catch (err) {
      // No offline fallback: a browser that cannot reach Supabase cannot verify
      // a password, and guessing is how the demo-account hole worked.
      console.error('[Prismora] Sign-in failed — could not reach the account service.', err?.message || err);
      return 'error:' + (err?.message || 'could not reach the account service');
    }
  };

  const logout = async () => {
    // Ends the session at Supabase, not just in this tab. Clearing localStorage
    // alone left a valid token behind that any later request would still use.
    try { await supabase.auth.signOut(); } catch { /* already gone */ }
    clearSession();
  };

  const addUser = async (userData) => {
    const newId = `U${Date.now()}`;
    // No default password. Every caller (Settings, and the three signup forms)
    // collects one and Settings enforces a policy on it, so falling back to a
    // known string here only ever created an account anyone could guess into.
    if (!userData.password) {
      console.error('[Prismora] Refusing to create an account with no password.');
      return null;
    }
    // The sign-in credential lives in Supabase Auth, so create it there too.
    // signUp both creates the account and signs in as it, which is right for
    // the three partner self-signup forms. An administrator adding someone
    // from Settings would be thrown out of their own session by it — so that
    // case is handled by `createAuthAccount: false`, and the account is made in
    // the Supabase dashboard instead.
    if (userData.createAuthAccount !== false) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: String(userData.email || '').trim(),
        password: userData.password,
      });
      if (signUpError) {
        console.error('[Prismora] Could not create the sign-in account:', signUpError.message || signUpError);
        return null;
      }
    }

    // The password is deliberately not written to `users`. Auth holds it now,
    // hashed; a copy here would put it back in a table the browser can read.
    const profileFields = { ...userData };
    delete profileFields.password;
    delete profileFields.createAuthAccount;
    const newUser = {
      ...profileFields,
      id: newId,
      managedUsers: userData.managedUsers || [],
      status: userData.status || 'Active'
    };
    setUsers(prev => {
      const next = [...prev, newUser];
      localStorage.setItem('prismora_users', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('users').insert([newUser]); } catch { /* ok */ }
    return newId;
  };

  const updateUser = async (id, updatedData) => {
    // A password change goes to Auth, never into `users`. Profile and Settings
    // both call this with { password }, which used to write the new password
    // straight back into the readable table it was just moved out of.
    if (Object.prototype.hasOwnProperty.call(updatedData, 'password')) {
      const { password, ...rest } = updatedData;
      if (user && user.id === id) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          console.error('[Prismora] Could not change the password:', error.message || error);
          return false;
        }
      } else {
        // Auth can only change the password of whoever is signed in. Resetting
        // someone else's is a dashboard job, or a password-reset email.
        console.error('[Prismora] A password can only be changed by its own account holder.');
        return false;
      }
      updatedData = rest;
      if (Object.keys(updatedData).length === 0) return true;
    }

    setUsers(prev => {
      const next = prev.map(u => u.id === id ? { ...u, ...updatedData } : u);
      localStorage.setItem('prismora_users', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('users').update(updatedData).eq('id', id); } catch { /* ok */ }

    if (user && user.id === id) {
      applySession({ ...user, ...updatedData });
    }
    return true;
  };

  const deleteUser = async (id) => {
    setUsers(prev => {
      const next = prev.filter(u => u.id !== id);
      localStorage.setItem('prismora_users', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('users').delete().eq('id', id); } catch { /* ok */ }
  };

  // RBAC Helper: Check if current user can see data assigned to `ownerId`
  const canAccessData = (ownerId) => {
    if (!user) return false;
    if (isAdminRole(user.role)) return true;
    if (isManagerRole(user.role)) {
      return user.id === ownerId || (user.managedUsers && user.managedUsers.includes(ownerId));
    }
    return user.id === ownerId; // Sales and other roles can only see their own
  };

  // RBAC Helper: Returns list of users current user can assign data to
  const getAssignableUsers = () => {
    if (!user) return [];
    if (isAdminRole(user.role)) return users.filter(u => isSalesRole(u.role));
    if (isManagerRole(user.role)) {
      return users.filter(u => user.managedUsers && user.managedUsers.includes(u.id));
    }
    return [];
  };

  // RBAC Helper: Check if user can access a module
  // level = 'view' (default) | 'full'
  const canAccess = (module, level = 'view') => {
    if (!user) return false;
    const rolePerms = PERMISSIONS[user.role];
    if (!rolePerms) return isAdminRole(user.role); // unknown role: grant if admin-tier
    const access = rolePerms[module] || 'none';
    if (access === 'none') return false;
    if (level === 'full') return access === 'full';
    return true; // 'view' or 'full' both satisfy a 'view' check
  };

  const isAdmin = user ? isAdminRole(user.role) : false;
  const isManager = user ? isManagerRole(user.role) : false;
  const isSales = user ? isSalesRole(user.role) : false;

  return (
    <AuthContext.Provider value={{ user, users, authReady, isConfigured, missingEnvVars, login, logout, addUser, updateUser, deleteUser, canAccessData, getAssignableUsers, canAccess, isAdmin, isManager, isSales }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

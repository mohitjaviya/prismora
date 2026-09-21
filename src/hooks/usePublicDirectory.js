import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchPublicDirectory } from '../utils/publicDirectory';

/**
 * One of the public views from 026, loaded for a page nobody is signed in to.
 *
 * The signup pages cannot use DataContext for this. That provider fetches the
 * base tables, which return zero rows to an anonymous visitor -- which is the
 * bug these views exist to fix, so reading it here would reintroduce it.
 *
 * `failed` is kept apart from an empty list on purpose: the placeholder says
 * something different for each, and telling a visitor to check their
 * connection when the real answer is "nobody has set up a territory yet" sends
 * them to the wrong place.
 */
export function usePublicDirectory(view) {
  const [state, setState] = useState({ rows: [], loading: true, failed: false });

  useEffect(() => {
    let live = true;
    // No setState here to re-raise `loading` -- it starts true, and each call
    // site passes a constant view, so the only way back to loading would be a
    // view that never changes. Setting it synchronously in an effect costs a
    // second render on every mount for a case that cannot happen.
    fetchPublicDirectory(supabase, view).then(({ rows, failed }) => {
      // The visitor may have navigated on. Setting state on an unmounted
      // component is a warning in the console and a leak in a long session.
      if (live) setState({ rows, loading: false, failed });
    });
    return () => { live = false; };
  }, [view]);

  return state;
}

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { buildGeo } from '../utils/geo';

/**
 * The State and City lists for a page nobody is signed in to (the three sign-up
 * pages). Reads the two public views from migration 100 (active names only).
 * Before 100 is applied, or if the read fails, the lists in the code are used,
 * so the page works either way. Nobody signed out can add a city.
 */
export function usePublicGeo() {
  const [rows, setRows] = useState({ states: [], cities: [] });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await supabase.from('public_geo_states').select('id, name').limit(1000);
        if (s.error || !s.data?.length) return;
        const cities = [];
        for (let from = 0; from < 20000; from += 1000) {
          const c = await supabase.from('public_geo_cities').select('id, stateId, name').order('id').range(from, from + 999);
          if (c.error) return;
          cities.push(...(c.data || []));
          if ((c.data || []).length < 1000) break;
        }
        if (live) setRows({ states: s.data, cities });
      } catch { /* not applied or unreachable: the code lists stay */ }
    })();
    return () => { live = false; };
  }, []);

  return useMemo(() => buildGeo(rows.states, rows.cities), [rows]);
}

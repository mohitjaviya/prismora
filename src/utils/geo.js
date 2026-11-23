import { STATE_DISTRICTS } from './indianStatesDistricts';

/**
 * State and city lists (migration 100: geo_states / geo_cities).
 *
 * Every State and City dropdown reads one `geo` object built here. With the
 * masters (migration applied) it is the active rows of the two tables; without
 * them it is the lists that used to be in the code, so every screen keeps
 * working whether or not 100 is applied.
 *
 * Stored rows keep the TEXT of the state and city, so an old value that is not
 * (or no longer) in the list still has to show: `withCurrent` adds it.
 * The rules below mirror the database (geo_key, geo_name_ok in 100) so the
 * screen can say no before saving; the database decides.
 */

/** Same text whatever the capitals, spaces or "&" / "and" (database: geo_key). */
export const geoKey = (s) => String(s ?? '').replace(/&/g, 'and').replace(/\s+/g, '').toLowerCase();

export const tidyName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// 2-60 characters, starts with a letter; letters, digits, space . ' & ( ) - (database: geo_name_ok).
const NAME_RE = /^\p{L}[\p{L}\p{N} .'&()-]{1,59}$/u;

/** '' when the name is acceptable, otherwise the sentence to show. */
export const nameProblem = (raw, kind = 'city') => {
  const n = tidyName(raw);
  if (!n) return `Enter the ${kind} name.`;
  if (!NAME_RE.test(n)) {
    return `Not a valid ${kind} name: use 2 to 60 characters (letters, numbers, spaces and . ' & ( ) - only), starting with a letter.`;
  }
  return '';
};

/** "navi mumbai" / "NAVI MUMBAI" -> "Navi Mumbai"; mixed case is left as typed (database: initcap in add_city). */
export const cleanCityName = (raw) => {
  const n = tidyName(raw);
  if (n && (n === n.toLowerCase() || n === n.toUpperCase())) {
    return n.toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }
  return n;
};

/** The entry of `names` that is the same place as `value` (any capitals/spaces), or ''. */
export const matchName = (names = [], value) => {
  const k = geoKey(value);
  return k ? (names.find(n => geoKey(n) === k) || '') : '';
};

/** `names` plus `value` when it is not in there (an old stored value must still show). */
export const withCurrent = (names = [], value) => {
  const v = tidyName(value);
  return v && !matchName(names, v) ? [...names, v] : names;
};

const byName = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });

/** Roles allowed to add a city from a dropdown / to manage the lists (enforced by the database too). */
export const ADD_CITY_ROLES = ['Super Admin', 'Admin', 'Sales Manager', 'Sales Executive'];
export const MANAGE_GEO_ROLES = ['Super Admin', 'Admin'];
export const canAddCity = (role) => ADD_CITY_ROLES.includes(role);
export const canManageGeo = (role) => MANAGE_GEO_ROLES.includes(role);

/** The lists that were in the code, as a geo object (used until 100 is applied). */
const codeGeo = () => {
  const stateNames = Object.keys(STATE_DISTRICTS).sort(byName);
  return {
    source: 'code',
    stateNames,
    citiesOf: (state) => {
      const key = Object.keys(STATE_DISTRICTS).find(s => geoKey(s) === geoKey(state));
      return key ? [...STATE_DISTRICTS[key]].sort(byName) : [];
    },
    canAdd: false,
    addCity: null,
  };
};
export const CODE_GEO = codeGeo();

/**
 * The lists for the dropdowns. `states` / `cities` are the table rows (any
 * `active`); without a usable state list the code lists are returned.
 * `extra` carries `canAdd` and `addCity(stateName, cityName)` for signed-in screens.
 */
export const buildGeo = (states, cities, extra = {}) => {
  const activeStates = (Array.isArray(states) ? states : []).filter(s => s && s.active !== false);
  if (!activeStates.length) return { ...CODE_GEO, ...extra, source: 'code', canAdd: false, addCity: null };
  const stateNames = activeStates.map(s => s.name).sort(byName);
  const byStateId = new Map();
  for (const c of Array.isArray(cities) ? cities : []) {
    if (c.active === false) continue;
    if (!byStateId.has(c.stateId)) byStateId.set(c.stateId, []);
    byStateId.get(c.stateId).push(c.name);
  }
  const stateByKey = new Map(activeStates.map(s => [geoKey(s.name), s]));
  return {
    source: 'masters',
    stateNames,
    stateId: (name) => stateByKey.get(geoKey(name))?.id || null,
    citiesOf: (state) => {
      const s = stateByKey.get(geoKey(state));
      return s ? [...(byStateId.get(s.id) || [])].sort(byName) : [];
    },
    canAdd: false,
    addCity: null,
    ...extra,
  };
};

/** Options for a State select: the list plus the current value if it is missing. */
export const stateOptions = (geo, current) => withCurrent(geo?.stateNames || [], current);

/** Options for a City select: the state's cities plus the current value if it is missing. */
export const cityOptions = (geo, state, current) => withCurrent(state ? (geo?.citiesOf(state) || []) : [], current);

/**
 * "Is this city already there" for a state, ignoring capitals and spaces;
 * returns the stored spelling or ''. (Used before calling add_city.)
 */
export const existingCity = (geo, state, name) => matchName(geo?.citiesOf(state) || [], name);

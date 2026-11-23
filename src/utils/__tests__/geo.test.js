import { describe, it, expect } from 'vitest';
import {
  geoKey, tidyName, nameProblem, cleanCityName, matchName, withCurrent,
  canAddCity, canManageGeo, buildGeo, CODE_GEO, stateOptions, cityOptions, existingCity,
} from '../geo';

const states = [
  { id: 'S1', name: 'Gujarat', active: true },
  { id: 'S2', name: 'Maharashtra', active: true },
  { id: 'S3', name: 'Goa', active: false },
];
const cities = [
  { id: 'C1', stateId: 'S1', name: 'Surat', active: true },
  { id: 'C2', stateId: 'S1', name: 'Ahmedabad', active: true },
  { id: 'C3', stateId: 'S1', name: 'Old Town', active: false },
  { id: 'C4', stateId: 'S2', name: 'Pune', active: true },
];

describe('geo names', () => {
  it('geoKey ignores capitals, spaces and & / and', () => {
    expect(geoKey(' Navi  Mumbai ')).toBe(geoKey('navimumbai'));
    expect(geoKey('Jammu & Kashmir')).toBe(geoKey('Jammu and Kashmir'));
    expect(geoKey('')).toBe('');
  });
  it('tidyName collapses spaces', () => expect(tidyName('  Navi   Mumbai ')).toBe('Navi Mumbai'));
  it('name rule: letters first, 2-60 characters, only . \' & ( ) - besides letters/digits', () => {
    expect(nameProblem('Pune')).toBe('');
    expect(nameProblem('Chümoukedima')).toBe('');
    expect(nameProblem('North 24 Parganas')).toBe('');
    expect(nameProblem("St. John's (East)")).toBe('');
    expect(nameProblem('')).toMatch(/Enter the city name/);
    expect(nameProblem('A')).toMatch(/Not a valid city name/);
    expect(nameProblem('12 Town')).toMatch(/Not a valid city name/);
    expect(nameProblem('Pune<script>')).toMatch(/Not a valid city name/);
    expect(nameProblem('A' + 'b'.repeat(60))).toMatch(/Not a valid city name/);
    expect(nameProblem('', 'state')).toMatch(/Enter the state name/);
  });
  it('cleanCityName capitalises an all-lower or all-capitals entry only', () => {
    expect(cleanCityName('navi  mumbai')).toBe('Navi Mumbai');
    expect(cleanCityName('NAVI MUMBAI')).toBe('Navi Mumbai');
    expect(cleanCityName('NTR')).toBe('Ntr');
    expect(cleanCityName('McLeod Ganj')).toBe('McLeod Ganj');
  });
  it('matchName / withCurrent keep an old value visible without duplicating', () => {
    expect(matchName(['Pune', 'Surat'], ' PUNE ')).toBe('Pune');
    expect(matchName(['Pune'], 'Nashik')).toBe('');
    expect(withCurrent(['Pune'], 'pune')).toEqual(['Pune']);
    expect(withCurrent(['Pune'], 'Nashik')).toEqual(['Pune', 'Nashik']);
    expect(withCurrent(['Pune'], '')).toEqual(['Pune']);
  });
  it('who may add a city / manage the lists', () => {
    for (const r of ['Super Admin', 'Admin', 'Sales Manager', 'Sales Executive']) expect(canAddCity(r)).toBe(true);
    for (const r of ['Accounts', 'Warehouse Manager', 'Distributor', 'Director', undefined]) expect(canAddCity(r)).toBe(false);
    expect(canManageGeo('Admin')).toBe(true);
    expect(canManageGeo('Super Admin')).toBe(true);
    expect(canManageGeo('Sales Manager')).toBe(false);
  });
});

describe('buildGeo', () => {
  it('uses the masters: active states and cities only, sorted', () => {
    const g = buildGeo(states, cities);
    expect(g.source).toBe('masters');
    expect(g.stateNames).toEqual(['Gujarat', 'Maharashtra']);
    expect(g.citiesOf('Gujarat')).toEqual(['Ahmedabad', 'Surat']);
    expect(g.citiesOf('gujarat ')).toEqual(['Ahmedabad', 'Surat']);
    expect(g.citiesOf('Goa')).toEqual([]);
    expect(g.stateId('Maharashtra')).toBe('S2');
  });
  it('falls back to the lists in the code when there are no masters', () => {
    for (const none of [undefined, [], null]) {
      const g = buildGeo(none, none, { canAdd: true, addCity: () => {} });
      expect(g.source).toBe('code');
      expect(g.canAdd).toBe(false);
      expect(g.addCity).toBeNull();
      expect(g.stateNames).toHaveLength(36);
      expect(g.citiesOf('Gujarat')).toContain('Surat');
    }
    expect(CODE_GEO.citiesOf('Jammu and Kashmir').length).toBeGreaterThan(0); // key match across "&" / "and"
  });
  it('passes the add-city hook through only with masters', () => {
    const add = () => {};
    const g = buildGeo(states, cities, { canAdd: true, addCity: add });
    expect(g.canAdd).toBe(true);
    expect(g.addCity).toBe(add);
  });
  it('an old value that is not in the list still shows in the options', () => {
    const g = buildGeo(states, cities);
    expect(stateOptions(g, 'Atlantis')).toEqual(['Gujarat', 'Maharashtra', 'Atlantis']);
    expect(stateOptions(g, 'gujarat')).toEqual(['Gujarat', 'Maharashtra']);
    expect(cityOptions(g, 'Gujarat', 'Mundra')).toEqual(['Ahmedabad', 'Surat', 'Mundra']);
    expect(cityOptions(g, '', 'Mundra')).toEqual(['Mundra']);
    expect(cityOptions(g, 'Gujarat', '')).toEqual(['Ahmedabad', 'Surat']);
  });
  it('existingCity finds a duplicate ignoring capitals and spaces', () => {
    const g = buildGeo(states, cities);
    expect(existingCity(g, 'Gujarat', ' su rat ')).toBe('Surat');
    expect(existingCity(g, 'Gujarat', 'Pune')).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import {
  territoryFor, territoryName, hasDanglingTerritory, territoryFields, recordsInTerritory,
} from '../territory';

const TERRITORIES = [
  { id: 'TER-1', name: 'Gujarat North Hub', state: 'Gujarat' },
  { id: 'TER-2', name: 'Maharashtra Mega Zone', state: 'Maharashtra' },
];

describe('territoryFor', () => {
  it('prefers the id, which is the real link', () => {
    expect(territoryFor(TERRITORIES, { territoryId: 'TER-1' }).name).toBe('Gujarat North Hub');
  });

  it('falls back to the name for records written before the id existed', () => {
    expect(territoryFor(TERRITORIES, { territory: 'Maharashtra Mega Zone' }).id).toBe('TER-2');
  });

  it('prefers the id even when the name disagrees — a rename must not detach it', () => {
    // Exactly what the id is for: the territory was renamed, the row still
    // carries the old spelling, and the link survives anyway.
    const row = { territoryId: 'TER-1', territory: 'Gujrat North Hub' };
    expect(territoryFor(TERRITORIES, row).name).toBe('Gujarat North Hub');
  });

  it('matches a name without regard to case or space', () => {
    expect(territoryFor(TERRITORIES, { territory: '  gujarat north hub ' }).id).toBe('TER-1');
  });

  it('is null for a name that matches nothing — the state three distributors were in', () => {
    expect(territoryFor(TERRITORIES, { territory: 'Gujarat North' })).toBeNull();
    expect(territoryFor(TERRITORIES, { territory: 'Karnataka South' })).toBeNull();
  });

  it('is null for an id that no longer exists', () => {
    expect(territoryFor(TERRITORIES, { territoryId: 'TER-99' })).toBeNull();
  });

  it('is null for nothing at all', () => {
    expect(territoryFor(TERRITORIES, {})).toBeNull();
    expect(territoryFor(TERRITORIES, null)).toBeNull();
    expect(territoryFor([], { territoryId: 'TER-1' })).toBeNull();
    expect(territoryFor(undefined, { territory: 'X' })).toBeNull();
  });
});

describe('territoryName', () => {
  it('gives the current name, not the stored one', () => {
    expect(territoryName(TERRITORIES, { territoryId: 'TER-1', territory: 'Gujrat North Hub' }))
      .toBe('Gujarat North Hub');
  });

  it('shows what was typed when it matches nothing, rather than hiding the problem', () => {
    expect(territoryName(TERRITORIES, { territory: 'Karnataka South' })).toBe('Karnataka South');
  });

  it('is a dash when nothing is assigned', () => {
    expect(territoryName(TERRITORIES, {})).toBe('—');
    expect(territoryName(TERRITORIES, { territory: '   ' })).toBe('—');
    expect(territoryName(TERRITORIES, null)).toBe('—');
  });
});

describe('hasDanglingTerritory', () => {
  it('is true for a name pointing at nothing', () => {
    expect(hasDanglingTerritory(TERRITORIES, { territory: 'Gujarat North' })).toBe(true);
  });

  it('is true for an id pointing at nothing', () => {
    expect(hasDanglingTerritory(TERRITORIES, { territoryId: 'TER-99' })).toBe(true);
  });

  it('is false when it resolves either way', () => {
    expect(hasDanglingTerritory(TERRITORIES, { territoryId: 'TER-1' })).toBe(false);
    expect(hasDanglingTerritory(TERRITORIES, { territory: 'Gujarat North Hub' })).toBe(false);
  });

  it('is false when nothing is assigned — unassigned is not dangling', () => {
    expect(hasDanglingTerritory(TERRITORIES, {})).toBe(false);
    expect(hasDanglingTerritory(TERRITORIES, { territory: '' })).toBe(false);
    expect(hasDanglingTerritory(TERRITORIES, null)).toBe(false);
  });
});

describe('territoryFields', () => {
  it('writes the id and nothing else', () => {
    // It used to write the name beside it, which is what kept the old column
    // fed during the expand phase. 027 dropped that column, and a payload
    // naming a column the table does not have is refused whole by PostgREST —
    // so still writing it would refuse every partner, order, lead and beat.
    expect(territoryFields(TERRITORIES, 'TER-1')).toEqual({ territoryId: 'TER-1' });
  });

  it('clears the link when nothing is chosen', () => {
    expect(territoryFields(TERRITORIES, '')).toEqual({ territoryId: null });
    expect(territoryFields(TERRITORIES, null)).toEqual({ territoryId: null });
    expect(territoryFields(TERRITORIES, undefined)).toEqual({ territoryId: null });
  });

  it('refuses an id it does not know rather than storing it', () => {
    // A foreign key would refuse it anyway, and refusing the whole row for one
    // bad id loses the rest of what somebody typed.
    expect(territoryFields(TERRITORIES, 'TER-99')).toEqual({ territoryId: null });
  });

  it('never names a column the table no longer has', () => {
    const shapes = [territoryFields(TERRITORIES, 'TER-1'), territoryFields([], 'TER-1'), territoryFields(null, null)];
    shapes.forEach(shape => expect(Object.keys(shape)).toEqual(['territoryId']));
  });
});

describe('recordsInTerritory', () => {
  const PARTNERS = [
    { id: 'D1', territoryId: 'TER-1' },
    { id: 'D2', territory: 'Gujarat North Hub' },
    { id: 'D3', territoryId: 'TER-2' },
    { id: 'D4', territory: 'Somewhere Else' },
    { id: 'D5' },
  ];

  it('finds records linked by either id or name', () => {
    expect(recordsInTerritory(PARTNERS, TERRITORIES[0]).map(r => r.id)).toEqual(['D1', 'D2']);
  });

  it('does not double-count a record carrying both', () => {
    const rows = [{ id: 'X', territoryId: 'TER-1', territory: 'Gujarat North Hub' }];
    expect(recordsInTerritory(rows, TERRITORIES[0])).toHaveLength(1);
  });

  it('ignores a record whose id points elsewhere even if the name matches', () => {
    const rows = [{ id: 'Y', territoryId: 'TER-2', territory: 'Gujarat North Hub' }];
    expect(recordsInTerritory(rows, TERRITORIES[0])).toHaveLength(0);
  });

  it('is empty for no territory or no records', () => {
    expect(recordsInTerritory(PARTNERS, null)).toEqual([]);
    expect(recordsInTerritory([], TERRITORIES[0])).toEqual([]);
    expect(recordsInTerritory(undefined, TERRITORIES[0])).toEqual([]);
  });
});

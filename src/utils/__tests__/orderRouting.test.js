import { describe, it, expect } from 'vitest';
import { assigneeForPortalOrder, isUnassigned } from '../orderRouting';

const TERRITORIES = [
  { id: 'T-1', name: 'Gujarat North', state: 'Gujarat', districts: ['Ahmedabad'], executiveId: 'U-surbhi' },
  { id: 'T-2', name: 'Maharashtra Mega', state: 'Maharashtra', districts: ['Pune'], executiveId: 'U-rohit' },
  { id: 'T-3', name: 'Unstaffed Zone', state: 'Gujarat', districts: ['Rajkot'], executiveId: '' },
];

const retailer = { id: 'RTL-1', territoryId: 'T-3' };   // territory with no executive
const dealer = { id: 'DEAL-1', territoryId: 'T-1' };    // Surbhi
const distributor = { id: 'DIST-1', territoryId: 'T-2' }; // Rohit

describe('assigneeForPortalOrder', () => {
  it('gives it to the territory executive when there is one', () => {
    expect(assigneeForPortalOrder([distributor], TERRITORIES))
      .toEqual({ assignedTo: 'U-rohit', via: 'territory' });
  });

  it('falls to whoever they buy through when their own territory has nobody', () => {
    // A territory row with executiveId '' is the case that produced orders
    // nobody could see.
    expect(assigneeForPortalOrder([retailer, dealer], TERRITORIES))
      .toEqual({ assignedTo: 'U-surbhi', via: 'parent' });
  });

  it('walks the whole chain rather than stopping at the first parent', () => {
    const unstaffedDealer = { id: 'DEAL-2', territoryId: 'T-3' };
    expect(assigneeForPortalOrder([retailer, unstaffedDealer, distributor], TERRITORIES))
      .toEqual({ assignedTo: 'U-rohit', via: 'parent' });
  });

  it('reports unassigned rather than inventing an owner', () => {
    // Deliberately not a nominated catch-all: one person's list filling up
    // with accounts they do not know is its own problem.
    expect(assigneeForPortalOrder([retailer], TERRITORIES))
      .toEqual({ assignedTo: '', via: 'unassigned' });
    expect(assigneeForPortalOrder([{ id: 'X' }], TERRITORIES))
      .toEqual({ assignedTo: '', via: 'unassigned' });
  });

  it('says how it got there, not just where', () => {
    // A screen can then explain an order assigned to somebody whose territory
    // it plainly is not.
    expect(assigneeForPortalOrder([distributor], TERRITORIES).via).toBe('territory');
    expect(assigneeForPortalOrder([retailer, dealer], TERRITORIES).via).toBe('parent');
  });

  it('treats a whitespace-only executive id as nobody', () => {
    const sloppy = [{ id: 'T-9', executiveId: '   ' }];
    expect(assigneeForPortalOrder([{ id: 'D', territoryId: 'T-9' }], sloppy).via).toBe('unassigned');
  });

  it('copes with nothing at all', () => {
    expect(assigneeForPortalOrder([], TERRITORIES).via).toBe('unassigned');
    expect(assigneeForPortalOrder(undefined, undefined).via).toBe('unassigned');
    expect(assigneeForPortalOrder([null, undefined], TERRITORIES).via).toBe('unassigned');
  });
});

describe('isUnassigned', () => {
  it('is true for the empty string that canAccessData hides from everybody', () => {
    expect(isUnassigned({ assignedTo: '' })).toBe(true);
    expect(isUnassigned({ assignedTo: '   ' })).toBe(true);
    expect(isUnassigned({})).toBe(true);
    expect(isUnassigned(null)).toBe(true);
  });

  it('is false once somebody owns it', () => {
    expect(isUnassigned({ assignedTo: 'U-rohit' })).toBe(false);
  });
});

describe('assigneeForPortalOrder falling back to where the partner is', () => {
  const TERRITORIES = [
    { id: 'T-2', name: 'Maharashtra Mega', state: 'Maharashtra', districts: ['Pune'], executiveId: 'U-rohit' },
  ];

  it('works the territory out from the city when there is no link', () => {
    // A partner registered before territories existed, or one whose territory
    // was deleted. Their city still says which zone they are in, exactly.
    const stranded = { id: 'DIST-9', state: 'Maharashtra', city: 'Pune' };
    expect(assigneeForPortalOrder([stranded], TERRITORIES))
      .toEqual({ assignedTo: 'U-rohit', via: 'territory' });
  });

  it('does not reach for any territory in the same state', () => {
    // The old fallback matched on state alone and took whichever territory it
    // found first, which is how an order got credited to the wrong zone.
    const elsewhere = { id: 'DIST-8', state: 'Maharashtra', city: 'Nashik' };
    expect(assigneeForPortalOrder([elsewhere], TERRITORIES).via).toBe('unassigned');
  });
});

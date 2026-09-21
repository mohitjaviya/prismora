/**
 * Who owns an order that nobody raised.
 *
 * An order keyed in by a rep is assigned to that rep, and an order raised from
 * a field visit to the executive who made the visit. Both are already right,
 * and territory does not override either -- if a rep from another zone brings
 * business back from Pune, it is theirs.
 *
 * The case with nobody in it is the partner portal: a distributor placing their
 * own order at eleven at night. That one fell to `territory?.executiveId || ''`,
 * and the empty string is the problem. canAccessData('') is false for every
 * sales role and every manager, so an order from a partner with no territory --
 * or a territory with nobody assigned to it -- was visible to administrators
 * and to nobody else. It sat in the list unworked.
 *
 * So: the territory's executive, then the executive of whoever they buy
 * through, and only then unassigned. A retailer's order falls to their dealer's
 * rep, and a dealer's to their distributor's rep, because that is the person
 * most likely to know the account.
 */

import { territoryFor, territoryForPlace } from './territory';

/**
 * The executive who owns a party's territory, or null.
 *
 * By the link first, then worked out from where they are. The second half
 * matters for a partner registered before territories existed, or one whose
 * territory was deleted: their city still says which zone they are in, and it
 * says it exactly. The previous fallback was any territory in the same state,
 * which is whichever one happened to be found first.
 */
function executiveFor(party, territories) {
  const territory = territoryFor(territories, party)
    || territoryForPlace(territories, party).territory;
  const id = String(territory?.executiveId ?? '').trim();
  return id || null;
}

/**
 * Who a self-service order should be assigned to, and why.
 *
 * Returns { assignedTo, via } -- `via` is 'territory', 'parent' or 'unassigned',
 * so a screen can say how an order got where it did rather than leaving
 * somebody to work it out from a name.
 *
 * `chain` is the party, then whoever they buy through, in order. A retailer
 * passes [retailer, dealer, distributor]; a distributor passes [distributor].
 * Built by the caller, which is the only place that knows the links.
 */
export function assigneeForPortalOrder(chain = [], territories = []) {
  const parties = (chain || []).filter(Boolean);

  for (let i = 0; i < parties.length; i += 1) {
    const executive = executiveFor(parties[i], territories);
    if (executive) {
      return { assignedTo: executive, via: i === 0 ? 'territory' : 'parent' };
    }
  }

  // Nobody. Deliberately the empty string rather than a nominated catch-all:
  // one person's list filling up with accounts they do not know is its own
  // problem. It is surfaced on the Orders screen instead, where it can be
  // picked up by whoever should have it.
  return { assignedTo: '', via: 'unassigned' };
}

/**
 * An order nobody is working.
 *
 * Asked of the order rather than of a status, because there is no status for
 * it -- an unassigned order looks exactly like an assigned one until you notice
 * the salesperson column is empty.
 */
export const isUnassigned = (order) => !String(order?.assignedTo ?? '').trim();

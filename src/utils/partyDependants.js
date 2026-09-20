/**
 * What is attached to a partner, before you delete them.
 *
 * Foreign keys now refuse to delete a distributor, dealer or retailer that
 * still holds orders, invoices, payments, incentives or claims. That is the
 * right behaviour -- a refused delete is recoverable, a silently orphaned
 * ledger is not -- but the application shows it as "could not be saved" and
 * nothing more, because deleteDistributor does not inspect the error.
 *
 * So the screen should not offer the button and then fail. It should say what
 * is in the way, and be specific about it: "3 orders and 7 incentives" is
 * something somebody can act on, where "could not be saved" is a dead end.
 */

/** Rows of one kind belonging to a party, across whichever id column fits. */
const countFor = (rows, party, fields) =>
  (rows || []).filter(row => fields.some(f => row?.[f] && row[f] === party?.id)).length;

const PARTY_FIELDS = ['distributorId', 'dealerId', 'retailerId'];

/**
 * Everything that would block, or be orphaned by, deleting this party.
 *
 * `blocking` counts what a foreign key will actually refuse. `orphaning` counts
 * what would survive with its link cleared -- complaints are SET NULL, so they
 * outlive the retailer they were raised against, which is worth mentioning but
 * is not a reason to stop.
 */
export function partyDependants(party, data = {}) {
  if (!party) return { blocking: [], orphaning: [], total: 0, canDelete: true };

  const {
    orders = [], invoices = [], distributorPayments = [], distributorIncentives = [],
    schemeClaims = [], complaints = [], dealers = [], retailers = [],
  } = data;

  const blocking = [];
  const add = (list, count, noun) => {
    if (count > 0) list.push({ count, noun: count === 1 ? noun : `${noun}s` });
  };

  add(blocking, countFor(orders, party, PARTY_FIELDS), 'order');
  add(blocking, countFor(distributorPayments, party, PARTY_FIELDS), 'payment');
  add(blocking, countFor(distributorIncentives, party, PARTY_FIELDS), 'incentive');
  add(blocking, countFor(schemeClaims, party, PARTY_FIELDS), 'claim');

  // Invoices carry no party id. They are matched the way the rest of the
  // application matches them: by customer name.
  const named = String(party.name || '').trim().toLowerCase();
  if (named) {
    add(blocking, (invoices || []).filter(i =>
      String(i?.customerName || '').trim().toLowerCase() === named).length, 'invoice');
  }

  // The hierarchy beneath them. A distributor with dealers under it cannot go
  // while they are there, and neither can a dealer with retailers.
  add(blocking, (dealers || []).filter(d => d?.parentDistributorId === party.id).length, 'dealer');
  add(blocking, (retailers || []).filter(r => r?.parentDealerId === party.id).length, 'retailer');

  const orphaning = [];
  add(orphaning, countFor(complaints, party, PARTY_FIELDS), 'complaint');

  return {
    blocking,
    orphaning,
    total: blocking.reduce((sum, b) => sum + b.count, 0),
    canDelete: blocking.length === 0,
  };
}

/** "3 orders, 7 incentives and 1 invoice" — for putting in a sentence. */
export function describeDependants(entries = []) {
  const parts = entries.map(e => `${e.count} ${e.noun}`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * What to put in front of somebody about to press Delete.
 *
 * Returns null when there is nothing attached, so the caller can ask the plain
 * question instead of manufacturing a warning about nothing.
 */
export function deleteWarning(party, data) {
  const { blocking, orphaning, canDelete } = partyDependants(party, data);

  if (!canDelete) {
    const also = orphaning.length ? ` It would also unlink ${describeDependants(orphaning)}.` : '';
    return {
      canDelete: false,
      title: `${party.name} cannot be deleted`,
      body: `They still have ${describeDependants(blocking)} on file, and the database will refuse to `
        + `remove a party that money or orders point at.${also} Move or delete those first.`,
    };
  }

  if (orphaning.length) {
    return {
      canDelete: true,
      title: `Delete ${party.name}?`,
      body: `Nothing blocks this, but ${describeDependants(orphaning)} will be kept with the link to `
        + 'them cleared, so those records will no longer say who they were about.',
    };
  }

  return null;
}

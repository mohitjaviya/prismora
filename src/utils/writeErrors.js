/**
 * Saying which value the database actually refused.
 *
 * PostgreSQL normally names it:
 *
 *     Key (territoryId)=(T-123) is not present in table "territories".
 *
 * Through PostgREST, under a role that cannot read the referenced table, it
 * redacts the value instead:
 *
 *     Key is not present in table "territories".
 *
 * That is the message this application has been showing people — a foreign key
 * complaint with the one useful fact removed. It is not recoverable from the
 * error, so it has to come from the payload that was sent.
 *
 * Every constraint here is named `fk_<table>_<column>`, lower-cased, by 021.
 * The older three predate that and use PostgreSQL's own `<table>_<column>_fkey`.
 * Both are handled by looking for a column name inside the constraint name
 * rather than trying to parse either shape.
 */

import { isIdColumn } from './dbRow';

/**
 * Which column of `row` a constraint is about, or null if it cannot be told.
 *
 * Compared case-insensitively because the constraint name is lower-case and
 * the column is camelCase. The longest match wins, so `fk_orders_dealerid`
 * picks `dealerId` and not some shorter column whose name is a substring of it.
 */
export function columnFromConstraint(constraintName, row = {}) {
  const name = String(constraintName ?? '').toLowerCase();
  if (!name) return null;

  const candidates = Object.keys(row || {})
    .filter(isIdColumn)
    .filter(key => name.includes(key.toLowerCase()))
    .sort((a, b) => b.length - a.length);

  return candidates[0] || null;
}

/** The constraint name out of a Postgres foreign-key message. */
export function constraintFromMessage(message) {
  const match = String(message ?? '').match(/violates foreign key constraint "([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * A sentence naming the column and the value that was refused.
 *
 * Returns null when this is not a foreign-key failure, or when the payload does
 * not explain it — in which case the caller keeps the message it already had.
 * Inventing a column would be worse than saying nothing.
 */
export function explainForeignKey(error, row) {
  if (error?.code !== '23503') return null;

  const constraint = constraintFromMessage(error?.message);
  if (!constraint) return null;

  const column = columnFromConstraint(constraint, row);
  if (!column) return null;

  const value = row[column];
  if (value === null || value === undefined) {
    // Worth saying plainly, because it should be impossible: a NULL reference
    // is not checked by a foreign key at all. Seeing this means the row that
    // reached the database was not the row being looked at here.
    return { column, value, text: `${column} was empty, which a foreign key does not check — so the value the database refused is not the one this browser sent.` };
  }

  return {
    column,
    value,
    text: `${column} was "${String(value)}", and there is no such record. Choose it again from the list — the one that was picked has probably been deleted.`,
  };
}

/**
 * A database refusal as one plain sentence for the person who clicked.
 *
 * The delivery and invoicing functions (039) raise their refusals already
 * written for people — "Not enough stock to deliver order O6. Tulsi Cough
 * Syrup 100ml: this order needs 100, 0 in stock." — with code P0001, so those
 * pass through as they are. Everything else is translated rather than shown as
 * raw SQL.
 */
const ORDER_RULE = /^(Order \S+ (is |has been |was |needs )|Only .+ can move an order to |A new order starts at Pending|A backorder can only|Purchase order \S+ has goods received)/;

// The invoice and purchase-return guards (075) refuse with 42501 and a
// sentence that says what to do instead.
const MONEY_RULE = /^(Invoice \S+ is an issued GST tax invoice|Proforma \S+ (has a payment|becomes a GST)|Purchase returns are recorded and withdrawn only)/;

// The value rules (075): which amount may not be zero or negative.
const VALUE_RULES = {
  expenses_amount_positive: 'An expense must be more than zero.',
  distributor_payments_amount_positive: 'A payment must be more than zero.',
  vendor_payments_amount_positive: 'A payment must be more than zero.',
  credit_notes_amount_positive: 'A credit note must be more than zero.',
  invoices_amounts_not_negative: 'An invoice amount and its tax cannot be negative.',
  purchase_returns_value_not_negative: 'A return cannot have a negative value.',
  products_prices_not_negative: 'Prices and the GST rate cannot be negative.',
  // 078
  products_partner_prices_within_mrp: 'A distributor, dealer or retailer price cannot be above the MRP.',
  schemes_discount_0_100: 'A scheme discount must be between 0 and 100%.',
  schemes_dates_in_order: 'A scheme cannot end before it starts.',
  schemes_amounts_not_negative: 'Free goods quantity and minimum order value cannot be negative.',
  distributors_credit_limit_not_negative: 'Credit limit cannot be negative.',
  dealers_credit_limit_not_negative: 'Credit limit cannot be negative.',
  retailers_credit_limit_not_negative: 'Credit limit cannot be negative.',
};

export function plainDatabaseError(error, action = 'save this') {
  if (!error) return `Could not ${action}.`;
  const code = error.code;
  const message = String(error.message || '');
  if (code === 'P0001') return message;
  // The order rules (054, 061, 062) refuse with a sentence meant for the
  // person at the screen — which stage comes next, which invoice locks it.
  if (ORDER_RULE.test(message) || MONEY_RULE.test(message)) return message;
  if (code === '23514') {
    const rule = Object.keys(VALUE_RULES).find(name => message.includes(name));
    if (rule) return VALUE_RULES[rule];
  }
  if (code === '42501' || /row-level security/i.test(message)) {
    return /needs full Accounting access|cannot (raise|convert) invoices/i.test(message)
      ? message
      : `Your role is not allowed to ${action}.`;
  }
  if (code === '23505' && /invoices_one_per_order/.test(message)) {
    return 'That order already has an invoice. An order can have only one.';
  }
  // A delete refused because other records still point at the row: name them.
  const fk = code === '23503' && message.match(/is still referenced from table "([^"]+)"|violates foreign key constraint "[^"]+" on table "([^"]+)"/);
  if (fk && /^delete/.test(action)) {
    const table = (fk[1] || fk[2] || 'other records').replace(/_/g, ' ');
    return `Cannot ${action}: it still has ${table} recorded against it. Remove or move those first${/vendor/.test(action) ? ', or set the vendor to Inactive instead' : ''}.`;
  }
  if (code === '23505' && /masters_list_(key|label)_ci/.test(message)) {
    return 'That list already has this option (ignoring capitals). Use the existing one.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return `Could not reach the database to ${action}. Check the connection and try again.`;
  }
  return `Could not ${action}: ${message || 'the database refused it.'}`;
}

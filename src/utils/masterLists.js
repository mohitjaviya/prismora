/**
 * The lists a administrator can edit, and the ones the code depends on.
 *
 * Every dropdown in the app used to be a const in whichever file happened to
 * need it — twenty of them across fifteen files, with the list of Indian states
 * copied into six. Changing "add one more lead status" meant a developer and a
 * deployment.
 *
 * The distinction that matters is between a label and a key.
 *
 * Some of these lists are only ever shown to people. A lead source, an expense
 * category, a unit of measure — nothing in the code looks at the text, so it can
 * be renamed, reordered, added to or retired freely.
 *
 * Others are read by the code. `CONVERSION_STATUSES` decides when a lead raises
 * an order. 'Delivered' is what deducts stock and generates the invoice.
 * 'GRN Done' moves a purchase order along. Rename one of those in a settings
 * screen and the business quietly stops working: no error, no warning, just
 * deliveries that never bill.
 *
 * So a workflow option carries two values. `key` is what the code compares
 * against and can never change. `label` is what staff see and can be anything.
 * An administrator can call 'Delivered' whatever they like; the code still sees
 * 'Delivered'.
 */

// An option may be given as a bare string, or as [label, colour] where the
// colour matters — a status badge has to be drawn in something.
const opt = (entry, i, locked) => {
  const [label, color] = Array.isArray(entry) ? entry : [entry, null];
  return { key: label, label, color, description: '', sort: i, locked };
};

// A list whose values the code never branches on.
const free = (id, name, description, defaults) => ({
  id, name, description, locked: false,
  defaults: defaults.map((d, i) => opt(d, i, false)),
});

// A list the code reads. `built` keys cannot be renamed or removed; anything
// added later is a plain option and behaves like a free one.
const workflow = (id, name, description, defaults) => ({
  id, name, description, locked: true,
  defaults: defaults.map((d, i) => opt(d, i, true)),
});

export const MASTER_LISTS = [
  free('lead_source', 'Lead Sources', 'Where a lead came from.',
    ['Exhibition', 'Reference', 'Website', 'WhatsApp', 'IndiaMart', 'Cold Call',
      'Instagram', 'LinkedIn', 'Trade Show', 'Walk-in', 'Other']),

  free('complaint_type', 'Complaint Types', 'What a customer is complaining about.',
    ['Quality Issue', 'Wrong Product', 'Damaged Packaging', 'Short Expiry',
      'Missing Item', 'Billing Error', 'Delivery Issue', 'Other']),

  free('expense_category', 'Expense Categories', 'What a field expense was spent on.',
    ['Travel', 'Food & Meals', 'Accommodation', 'Client Entertainment', 'Fuel', 'Miscellaneous']),

  free('product_category', 'Product Categories', 'How the catalogue is grouped.',
    ['Hair Care', 'Skin Care', 'Wellness', 'Personal Care', 'Other']),

  free('uom', 'Units of Measure', 'How a product is counted.',
    ['BOX', 'BOTTLE', 'TUBE', 'STRIP', 'PIECE', 'KG']),

  free('warehouse', 'Warehouses', 'Where stock is held.',
    ['Main Warehouse', 'Secondary Warehouse', 'Cold Storage']),

  free('product_status', 'Product Statuses', 'Whether a product is being sold.',
    ['Active', 'Seasonal', 'Coming Soon', 'Discontinued']),

  free('scheme_type', 'Scheme Types', 'The kind of discount a scheme gives.',
    ['Flat Discount', 'Cash Discount', 'Free Goods', 'Slab Discount', 'Seasonal Offer', 'Buy X Get Y']),

  workflow('lead_status', 'Lead Statuses', 'The stages a lead moves through. Converted, First Order and Active each raise an order.',
    [['Lead Created', '#38bdf8'], ['Call', '#818cf8'], ['Sample Sent', '#a78bfa'],
      ['Meeting', '#f472b6'], ['Negotiation', '#fbbf24'], ['Distributor Approved', '#34d399'],
      ['First Order', '#22c55e'], ['Active', '#10b981'], ['Lost', '#f87171']]),

  workflow('order_status', 'Order Statuses', 'Delivered deducts stock and raises the invoice. Ready for Dispatch and Shipped check stock first.',
    [['Pending', '#eab308'], ['Processing', '#3b82f6'], ['Ready for Dispatch', '#06b6d4'],
      ['Shipped', '#a855f7'], ['Delivered', '#22c55e'], ['Cancelled', '#ef4444']]),

  workflow('po_status', 'Purchase Order Statuses', 'GRN Done and Closed drive the goods-receipt flow.',
    [['Draft', '#64748b'], ['Confirmed', '#3b82f6'], ['GRN Done', '#10b981'],
      ['Closed', '#a855f7'], ['Cancelled', '#f43f5e']]),

  workflow('complaint_status', 'Complaint Statuses', 'The stages a complaint moves through.',
    [['Registered', '#f43f5e'], ['Under Review', '#f59e0b'],
      ['Resolved', '#10b981'], ['Closed', '#64748b']]),
];

export const listById = (id) => MASTER_LISTS.find(l => l.id === id) || null;

/**
 * The options for a list, from the database where it has them and from the
 * defaults above where it does not.
 *
 * The fallback is the point. A master list that has not been seeded, or a
 * database that cannot be reached, must not empty a dropdown the business
 * depends on — a lead form with no statuses is worse than one that cannot be
 * customised. Nothing breaks if this table never gets created at all.
 */
export const optionsFor = (masters, listId, { includeInactive = false } = {}) => {
  const rows = (masters || []).filter(m => m.list === listId);
  if (rows.length === 0) {
    const def = listById(listId);
    return def ? def.defaults.map(d => ({ ...d, active: true })) : [];
  }
  return rows
    .filter(r => includeInactive || r.active !== false)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.label).localeCompare(String(b.label)));
};

/** Just the values a <select> needs — the keys the rest of the app stores. */
export const keysFor = (masters, listId) => optionsFor(masters, listId).map(o => o.key);

/** What to show for a stored key, falling back to the key when it is unknown. */
export const labelForKey = (masters, listId, key) => {
  const hit = optionsFor(masters, listId, { includeInactive: true }).find(o => o.key === key);
  return hit ? hit.label : key;
};

/**
 * The colour stored against an option, if it has one.
 *
 * Badge colours used to live in a hardcoded map per screen — statusConfig in
 * Purchases and Complaints, a switch in Orders. Those maps only know the
 * statuses that existed when they were written, so a status added through
 * Master Lists came out grey with no way to change it. The colour travels with
 * the option now.
 */
export const colorForKey = (masters, listId, key) => {
  const hit = optionsFor(masters, listId, { includeInactive: true }).find(o => o.key === key);
  return hit?.color || null;
};

/**
 * Inline styles for a tinted badge, matching the look the Tailwind classes give.
 *
 * Inline rather than class names because the colour is data: Tailwind only ships
 * the classes it can see in the source, so a hex chosen by an administrator at
 * runtime could never become `bg-[#abc123]/10`.
 */
export const badgeStyle = (color) => color
  ? { backgroundColor: color + '1a', color, borderColor: color + '40' }
  : null;

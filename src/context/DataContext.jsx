import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { isSchemeEligible, getSchemeMatchValue } from '../utils/schemeUtils';

const DataContext = createContext();

// Bumping this string clears every cached table in the browser on the next load.
//
// The caches are not a passive copy: fetchData() merges anything the server does
// not return on top of what it does. After a deliberate data reset, a browser
// still holding the old rows puts them back on screen as though nothing had been
// deleted. Clearing the caches once, keyed on this version, is what stops that.
const DATA_VERSION = '2026-09-16-no-demo-seed';

// Theme and session are user preferences rather than cached tables, so they
// survive; the version marker itself has to survive or every load would wipe.
const KEEP_ON_RESET = new Set(['prismora_theme', 'prismora_user', 'prismora_data_version']);

const clearStaleCaches = () => {
  try {
    if (localStorage.getItem('prismora_data_version') === DATA_VERSION) return;
    Object.keys(localStorage)
      .filter(k => k.startsWith('prismora_') && !KEEP_ON_RESET.has(k))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem('prismora_data_version', DATA_VERSION);
    console.info('[Prismora] Local cache cleared to match the reset database.');
  } catch { /* storage blocked (private mode) — nothing cached to clear */ }
};

// Runs at module load, before any component reads the cache below.
clearStaleCaches();

// Synchronously hydrate state from the browser's cached copy so the UI renders
// instantly on load; fetchData() then refreshes from Supabase in the background.
const CACHE_KEYS_BY_TABLE = {
  attendance: 'prismora_attendance',
  beat_plans: 'prismora_beat_plans',
  complaints: 'prismora_complaints',
  credit_notes: 'prismora_credit_notes',
  dealers: 'prismora_dealers',
  distributor_incentives: 'prismora_distributor_incentives',
  distributor_payments: 'prismora_distributor_payments',
  distributors: 'prismora_distributors',
  expenses: 'prismora_expenses',
  grn: 'prismora_grn',
  inventory: 'prismora_inventory',
  invoices: 'prismora_invoices',
  leads: 'prismora_leads',
  orders: 'prismora_orders',
  product_catalog: 'prismora_product_catalog',
  purchase_orders: 'prismora_purchase_orders',
  purchase_returns: 'prismora_purchase_returns',
  retailers: 'prismora_retailers',
  scheme_claims: 'prismora_scheme_claims',
  schemes: 'prismora_schemes',
  territories: 'prismora_territories',
  vendor_payments: 'prismora_vendor_payments',
  vendors: 'prismora_vendors',
  masters: 'prismora_masters',
  visit_reports: 'prismora_visit_reports',
};

const lsInit = (key) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
};

/**
 * Persist a Supabase mutation, surfacing failures instead of hiding them.
 *
 * supabase-js resolves with `{ error }` rather than throwing when a query is
 * rejected, so wrapping a call in a bare try/catch catches almost nothing: a
 * missing column, a type mismatch or an RLS denial all come back as a resolved
 * promise carrying an error, and get discarded. The write silently doesn't
 * happen while local state reports success — which is exactly how the missing
 * `deliveredQty` column went unnoticed. This checks both failure modes.
 *
 * Returns true on success so callers can branch on it; existing callers that
 * ignore the result still get the console error.
 */
// Schema drift is the failure this app keeps hitting: PostgREST rejects an
// entire statement when the payload names a column the table lacks, the
// optimistic UI shows the change anyway, and it quietly reverts on the next
// load. Left in the console it reads as "the app is broken" rather than "a
// migration has not been run", so it gets reported as a bug and costs a round
// trip every time. This carries it to the screen instead.
let reportSchemaError = () => {};
const setSchemaErrorReporter = (fn) => { reportSchemaError = fn; };

// Anything the database refuses is worth showing. It was limited to missing
// columns, which missed the case that actually bit: a foreign key violation —
// a beat assigned to a user id that no longer exists — is rejected just as
// hard, is just as invisible, and leaves exactly the same ghost row that
// disappears on the next load.
const writeComplaint = (err) => {
  const code = err?.code;
  const message = err?.message || '';
  const detail = err?.details ? ` ${err.details}` : '';
  if (!code && !message) return null;

  if (code === '42703' || code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(message)) {
    return { text: message, cause: 'A pending database migration is the usual cause.' };
  }
  if (code === '23503') {
    return { text: message + detail, cause: 'It refers to a record that no longer exists — often a user who has been removed.' };
  }
  if (code === '23505') {
    return { text: message + detail, cause: 'Something with that id already exists.' };
  }
  return { text: message + detail, cause: '' };
};

const persist = async (label, query) => {
  try {
    const { error } = await query;
    if (error) {
      console.error(`[Prismora] Could not save ${label} — this change will be lost on refresh:`, error.message || error);
      const complaint = writeComplaint(error);
      if (complaint) reportSchemaError({ label, detail: complaint.text, cause: complaint.cause });
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Prismora] Could not save ${label} (network or unexpected error):`, err?.message || err);
    return false;
  }
};

/**
 * The columns that actually exist on `orders`.
 *
 * PostgREST aborts an entire INSERT/UPDATE with error 42703 the moment the
 * payload names one column the table doesn't have — it does not skip the
 * unknown key and write the rest. The order form always carries `phone` and
 * `email`, so a single missing column silently rejected every order write:
 * local state and localStorage showed the change, Supabase never received it,
 * and the next refresh served the stale row back (partial-delivery progress
 * resetting to "nothing delivered" is exactly this).
 *
 * Filtering the payload through this list keeps a schema that has drifted from
 * `complete_database_schema.sql` from voiding the whole write — the known
 * columns still persist. Keep it in step with the orders table.
 */
const ORDER_COLUMNS = [
  'id', 'customerName', 'companyName', 'product', 'quantity', 'value',
  'state', 'city', 'territory', 'deliveryAddress', 'deliveryPincode',
  'status', 'assignedTo', 'date', 'createdAt',
  'phone', 'email',
  'distributorId', 'dealerId', 'retailerId', 'items',
  'receivedByDistributor', 'receivedAt',
  'splitFromOrderId', 'splitIntoOrderId',
  'deliveredQty', 'fulfilledAt',
  'leadId',
];

// Narrows an order object to just the persistable columns. Form-only fields
// stay in React state and localStorage; only real columns go over the wire.
const orderRow = (order) => {
  const row = {};
  for (const key of ORDER_COLUMNS) {
    if (order[key] !== undefined) row[key] = order[key];
  }
  return row;
};


/**
 * Insert a record whose id was generated client-side as `max + 1`.
 *
 * Every browser computes that number from the rows it happens to know about, so
 * two people creating an order in the same moment both land on O47. The first
 * insert wins; the second fails on the primary key and — because supabase-js
 * resolves with an `{ error }` rather than throwing — used to be dropped in
 * silence, leaving that person's order only in their own browser.
 *
 * This walks to the next free number and retries, then reports the id that was
 * actually stored so local state can be written with the right one. Sequential,
 * human-quotable ids are kept, because staff read them out over the phone.
 *
 * Anything that isn't a duplicate-key error (offline, a missing column) keeps
 * the first id and reports `saved: false`, so offline creation behaves exactly
 * as it did before.
 */
// Highest number currently in use for `prefix` in `table`. Ids are text columns,
// so the database sorts them lexicographically — "O9" lands after "O47" — which
// makes ORDER BY useless here. The numeric part has to be parsed instead.
const maxSequentialId = async (table, prefix) => {
  try {
    const { data, error } = await supabase.from(table).select('id');
    if (error || !data) return 0;
    return data.reduce((highest, row) => {
      const id = String(row.id || '');
      if (!id.startsWith(prefix)) return highest;
      const num = parseInt(id.slice(prefix.length), 10);
      return !isNaN(num) && num > highest ? num : highest;
    }, 0);
  } catch {
    return 0;
  }
};

const insertWithFreeId = async (label, table, prefix, firstNumber, record, shape = (r) => r, attempts = 8) => {
  let number = firstNumber;
  let askedDatabase = false;

  for (let i = 0; i < attempts; i++) {
    const id = `${prefix}${number}`;
    try {
      const { error } = await supabase.from(table).insert([shape({ ...record, id })]);
      if (!error) return { id, saved: true };
      if (error.code !== '23505') {
        console.error(`[Prismora] Could not save ${label} — this change will be lost on refresh:`, error.message || error);
        const complaint = writeComplaint(error);
        if (complaint) reportSchemaError({ label, detail: complaint.text, cause: complaint.cause });
        return { id, saved: false };
      }

      // 23505 = that id is already taken. `firstNumber` was worked out from the
      // rows this browser happens to hold, so when an earlier fetch failed it
      // can sit far behind the real table — stepping one at a time would burn
      // every attempt and still land on a taken id. Ask the database where it
      // has actually reached and jump past that, once.
      if (!askedDatabase) {
        askedDatabase = true;
        const highest = await maxSequentialId(table, prefix);
        if (highest >= number) { number = highest + 1; continue; }
      }
      number += 1;
    } catch (err) {
      console.error(`[Prismora] Could not save ${label} (network or unexpected error):`, err?.message || err);
      return { id, saved: false };
    }
  }
  console.error(`[Prismora] Gave up finding a free id for ${label} after ${attempts} tries.`);
  return { id: `${prefix}${number}`, saved: false };
};

/**
 * The columns that exist on `leads`.
 *
 * Same hazard as ORDER_COLUMNS: PostgREST rejects an entire INSERT or UPDATE
 * when the payload names a column the table lacks. `orderCreated` was being
 * written without existing, so every lead conversion failed to save its new
 * status while still creating the order — and the next conversion of the same
 * lead raised a duplicate.
 *
 * The list has to match the table exactly, in both directions:
 *
 *   · `leadSource` was missing from here while existing on the table, so the
 *     answer to "where did this lead come from" was dropped on every write.
 *   · `state` and `city` were listed here while missing from the table, which
 *     is worse — naming them was enough to have the whole statement refused.
 *     FIX_LEADS_NOW.sql adds those two plus district, territory and leadType.
 *
 * `attachments` is deliberately absent. The form offers a file picker with no
 * file storage behind it, so it only ever holds an empty array; listing it
 * would refuse every write for the sake of nothing.
 */
const LEAD_COLUMNS = [
  'id', 'name', 'company', 'phone', 'email', 'productInterest', 'dealValue',
  'leadSource', 'state', 'city', 'district', 'territory', 'leadType',
  'status', 'assignedTo', 'followUpDate', 'notes', 'orderCreated', 'createdAt',
];

const leadRow = (lead) => {
  const row = {};
  for (const key of LEAD_COLUMNS) {
    if (lead[key] !== undefined) row[key] = lead[key];
  }
  return row;
};

/**
 * The columns that exist on `attendance`.
 *
 * Checking in sends the GPS fix that proves the salesperson was at the outlet,
 * and approving sends who approved it. None of those columns existed, so the
 * database refused every check-in and every approval this app has ever made —
 * silently, because the record was put on screen either way.
 * FIX_LEADS_AND_ATTENDANCE.sql adds them.
 */
const ATTENDANCE_COLUMNS = [
  'id', 'userId', 'date', 'status', 'checkInTime', 'checkOutTime', 'notes',
  'punchInLat', 'punchInLng', 'punchInAccuracy',
  'punchOutLat', 'punchOutLng', 'punchOutAccuracy',
  'approved', 'approvedBy', 'createdAt',
];

const attendanceRow = (record) => {
  const row = {};
  for (const key of ATTENDANCE_COLUMNS) {
    if (record[key] !== undefined) row[key] = record[key];
  }
  return row;
};

/**
 * Build a shaper for a table's columns.
 *
 * Same job as leadRow and attendanceRow above, which were each written out by
 * hand before there were enough of them to be worth a factory. The purchase
 * side needs four more and they are all identical, so they share this.
 */
const shapeFor = (columns) => (record) => {
  const row = {};
  for (const key of columns) {
    if (record[key] !== undefined) row[key] = record[key];
  }
  return row;
};

// The purchase tables. None of these had a shaper: they happen to match their
// forms today, so nothing is broken by it yet — but this is the fault that
// silently destroyed every lead and every check-in, and it only takes one new
// field on a form to repeat it here, where the records are money owed.
const purchaseOrderRow = shapeFor([
  'id', 'vendorId', 'vendorName', 'items', 'total', 'status',
  'expectedDate', 'notes', 'assignedTo', 'createdAt',
]);

const grnRow = shapeFor([
  'id', 'poId', 'vendorName', 'items', 'receivedDate', 'notes',
  'receivedBy', 'createdAt',
]);

const vendorPaymentRow = shapeFor([
  'id', 'vendorId', 'amount', 'method', 'reference', 'date', 'notes',
  'recordedBy', 'createdAt',
]);

const purchaseReturnRow = shapeFor([
  'id', 'vendorId', 'vendorName', 'reason', 'items', 'value', 'notes',
  'date', 'recordedBy', 'createdAt',
]);

const inventoryRow = shapeFor([
  'id', 'product', 'batchNumber', 'expiryDate', 'quantity', 'unitCost',
  'warehouse', 'reorderLevel', 'reserved', 'transit', 'damaged', 'createdAt',
]);

// Batch numbers are typed, so they are compared without case or stray spaces.
const sameBatch = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const DataProvider = ({ children }) => {
  // ── Original CRM State (hydrated from cache for instant load) ────────────
  // Surfaced by the app shell so a rejected write is visible, not just logged.
  const [schemaError, setSchemaError] = useState(null);
  useEffect(() => { setSchemaErrorReporter(setSchemaError); }, []);

  const [leads, setLeads] = useState(() => lsInit('prismora_leads'));
  const [orders, setOrders] = useState(() => lsInit('prismora_orders'));
  const [eventLog, setEventLog] = useState([]);
  const [productCatalog, setProductCatalog] = useState(() => lsInit('prismora_product_catalog'));
  const [products, setProducts] = useState(() => lsInit('prismora_product_catalog').map(p => p.name).filter(Boolean));
  const [invoices, setInvoices] = useState(() => lsInit('prismora_invoices'));
  const [creditNotes, setCreditNotes] = useState(() => lsInit('prismora_credit_notes'));
  const [expenses, setExpenses] = useState(() => lsInit('prismora_expenses'));

  // ── Phase 1 Enterprise State ────────────────────────────────────────────
  const [inventory, setInventory] = useState(() => lsInit('prismora_inventory'));
  const [vendors, setVendors] = useState(() => lsInit('prismora_vendors'));
  const [purchaseOrders, setPurchaseOrders] = useState(() => lsInit('prismora_purchase_orders'));
  const [grn, setGrn] = useState(() => lsInit('prismora_grn'));
  const [purchaseReturns, setPurchaseReturns] = useState(() => lsInit('prismora_purchase_returns'));
  const [distributors, setDistributors] = useState(() => lsInit('prismora_distributors'));
  const [dealers, setDealers] = useState(() => lsInit('prismora_dealers'));
  const [retailers, setRetailers] = useState(() => lsInit('prismora_retailers'));
  const [schemes, setSchemes] = useState(() => lsInit('prismora_schemes'));
  const [complaints, setComplaints] = useState(() => lsInit('prismora_complaints'));
  const [territories, setTerritories] = useState(() => lsInit('prismora_territories'));
  const [beatPlans, setBeatPlans] = useState(() => lsInit('prismora_beat_plans'));
  const [attendance, setAttendance] = useState(() => lsInit('prismora_attendance'));
  const [visitReports, setVisitReports] = useState(() => lsInit('prismora_visit_reports'));
  const [masters, setMasters] = useState(() => lsInit('prismora_masters'));
  const [sfaExpenses, setSfaExpenses] = useState(() => lsInit('prismora_sfa_expenses'));
  const [vendorPayments, setVendorPayments] = useState(() => lsInit('prismora_vendor_payments'));

  // ── Distributor Portal State ────────────────────────────────────────────
  const [distributorPayments, setDistributorPayments] = useState(() => lsInit('prismora_distributor_payments'));
  const [schemeClaims, setSchemeClaims] = useState(() => lsInit('prismora_scheme_claims'));
  const [distributorIncentives, setDistributorIncentives] = useState(() => lsInit('prismora_distributor_incentives'));


















  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // A load must not undo something the user did while it was still running.
    // StrictMode runs this effect twice in development, and the walk through
    // ~20 tables takes many seconds either way — so a pass that began before
    // the user acted can still be resolving afterwards, and would put the row
    // it read earlier back on screen. That looks exactly like a save being
    // rejected, which is how it was reported.
    //
    // Every mutation writes its cache key synchronously, so a key that changed
    // since this pass started marks a table the user has touched: leave it be.
    const startedWith = {};
    Object.values(CACHE_KEYS_BY_TABLE).forEach(k => {
      try { startedWith[k] = localStorage.getItem(k); } catch { startedWith[k] = null; }
    });
    const applyFetched = (key, setter, value) => {
      try {
        if (localStorage.getItem(key) !== startedWith[key]) return;
      } catch { /* storage blocked — nothing could have been written either */ }
      setter(value);
      // The cache has to be brought in line with what the server returned, or a
      // row the server does not have is re-hydrated on the very next load,
      // shown for a few seconds, and replaced again — forever. That is what a
      // rejected write leaves behind: a ghost that reappears on every refresh
      // because state was corrected and the cache it came from never was.
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch { /* storage full or blocked — state is still correct */ }
    };

    // Every table is asked for at once, not one after another.
    //
    // A Supabase query builder does nothing until it is awaited, so 25
    // `await supabase.from(...)` in a row meant 25 round trips end to end:
    // 9.3 seconds measured on a wired connection, and far worse on mobile,
    // with the dashboard unusable until the last one landed. Starting them
    // here fires all 25 together and the awaits below just collect them —
    // the same 25 requests, about 1.9 seconds.
    //
    // `begin` also turns a rejection into { data, error } so a single
    // unreachable table cannot reject a promise nobody is awaiting yet.
    const begin = (builder) => builder.then(r => r, err => ({ data: null, error: err }));
    const inflight = {
      leads: begin(supabase.from('leads').select('*').order('createdAt', { ascending: false })),
      orders: begin(supabase.from('orders').select('*').order('createdAt', { ascending: false })),
      events: begin(supabase.from('events').select('*').order('timestamp', { ascending: false })),
      products: begin(supabase.from('products').select('*')),
      invoices: begin(supabase.from('invoices').select('*').order('createdAt', { ascending: false })),
      credit_notes: begin(supabase.from('credit_notes').select('*').order('createdAt', { ascending: false })),
      expenses: begin(supabase.from('expenses').select('*').order('date', { ascending: false })),
      inventory: begin(supabase.from('inventory').select('*').order('createdAt', { ascending: false })),
      vendors: begin(supabase.from('vendors').select('*').order('createdAt', { ascending: false })),
      vendor_payments: begin(supabase.from('vendor_payments').select('*').order('createdAt', { ascending: false })),
      purchase_returns: begin(supabase.from('purchase_returns').select('*').order('createdAt', { ascending: false })),
      purchase_orders: begin(supabase.from('purchase_orders').select('*').order('createdAt', { ascending: false })),
      grn: begin(supabase.from('grn').select('*').order('createdAt', { ascending: false })),
      distributors: begin(supabase.from('distributors').select('*').order('createdAt', { ascending: false })),
      dealers: begin(supabase.from('dealers').select('*').order('createdAt', { ascending: false })),
      retailers: begin(supabase.from('retailers').select('*').order('createdAt', { ascending: false })),
      schemes: begin(supabase.from('schemes').select('*').order('createdAt', { ascending: false })),
      complaints: begin(supabase.from('complaints').select('*').order('createdAt', { ascending: false })),
      territories: begin(supabase.from('territories').select('*')),
      beat_plans: begin(supabase.from('beat_plans').select('*').order('date', { ascending: false })),
      attendance: begin(supabase.from('attendance').select('*').order('date', { ascending: false })),
      visit_reports: begin(supabase.from('visit_reports').select('*').order('visitDate', { ascending: false })),
      distributor_payments: begin(supabase.from('distributor_payments').select('*').order('createdAt', { ascending: false })),
      scheme_claims: begin(supabase.from('scheme_claims').select('*').order('createdAt', { ascending: false })),
      distributor_incentives: begin(supabase.from('distributor_incentives').select('*').order('createdAt', { ascending: false })),
      masters: begin(supabase.from('masters').select('*').order('sort', { ascending: true })),
    };
    // ── Original fetches ──────────────────────────────────────────────────
    // Fetch Leads with local merge fallback
    let fetchedLeads = [];
    // Tracked separately from the row count: a failed read and a genuinely
    // empty table both leave the array at [], but only the second one should
    // ever seed the demo rows below.
    let fetchedLeadsOk = false;
    try {
      const { data, error } = await inflight.leads;
      if (error) throw error;
      fetchedLeads = data || [];
      fetchedLeadsOk = true;
    } catch (err) {
      console.warn("Supabase fetch leads failed, using local fallback.", err);
    }
    const localLeadsStr = localStorage.getItem('prismora_leads');
    if (localLeadsStr) {
      const localLeads = JSON.parse(localLeadsStr);
      const remoteIds = new Set(fetchedLeads.map(l => l.id));
      const localOnly = localLeads.filter(l => !remoteIds.has(l.id));
      fetchedLeads = [...localOnly, ...fetchedLeads];
    }
    applyFetched('prismora_leads', setLeads, fetchedLeads);

    // Fetch Orders with local merge fallback
    let fetchedOrders = [];
    // Tracked separately from the row count: a failed read and a genuinely
    // empty table both leave the array at [], but only the second one should
    // ever seed the demo rows below.
    let fetchedOrdersOk = false;
    try {
      const { data, error } = await inflight.orders;
      if (error) throw error;
      fetchedOrders = data || [];
      fetchedOrdersOk = true;
    } catch (err) {
      console.warn("Supabase fetch orders failed, using local fallback.", err);
    }
    const localOrdersStr = localStorage.getItem('prismora_orders');
    if (localOrdersStr) {
      const localOrders = JSON.parse(localOrdersStr);
      const remoteIds = new Set(fetchedOrders.map(o => o.id));
      const localOnly = localOrders.filter(o => !remoteIds.has(o.id));
      fetchedOrders = [...localOnly, ...fetchedOrders];
    }
    applyFetched('prismora_orders', setOrders, fetchedOrders);

    const { data: eventsData } = await inflight.events;
    if (eventsData) setEventLog(eventsData);

    let fetchedCatalog = [];
    try {
      const { data, error } = await inflight.products;
      if (error) throw error;
      fetchedCatalog = data || [];
      if (fetchedCatalog.length === 0) {
        const local = localStorage.getItem('prismora_product_catalog');
        fetchedCatalog = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_product_catalog', JSON.stringify(fetchedCatalog));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_product_catalog');
      fetchedCatalog = local ? JSON.parse(local) : [];
    }
    const normalizedCatalog = fetchedCatalog.map((p, idx) => ({
      id: p.id || `P-${idx}-${(p.name || '').replace(/\s+/g, '')}`,
      name: p.name || 'Unnamed Product',
      category: p.category || 'Wellness',
      hsnCode: p.hsnCode || '30049011',
      gstPct: Number(p.gstPct !== undefined ? p.gstPct : 12),
      mrp: Number(p.mrp !== undefined ? p.mrp : 200),
      distributorPrice: Number(p.distributorPrice !== undefined ? p.distributorPrice : 100),
      dealerPrice: Number(p.dealerPrice !== undefined ? p.dealerPrice : 120),
      retailerPrice: Number(p.retailerPrice !== undefined ? p.retailerPrice : 140),
      uom: p.uom || 'BOTTLE',
      sku: p.sku || '',
      status: p.status || 'Active',
      createdAt: p.createdAt || new Date().toISOString()
    }));
    // Both come from the one cache key, so they are applied together: two calls
    // would write the name list over the catalogue, and the second would then
    // see its own write and skip itself.
    applyFetched('prismora_product_catalog', (rows) => {
      setProductCatalog(rows);
      setProducts(rows.map(p => p.name));
    }, normalizedCatalog);
    localStorage.setItem('prismora_product_catalog', JSON.stringify(normalizedCatalog));

    // Fetch Invoices with fallback
    let fetchedInvoices = [];
    try {
      const { data, error } = await inflight.invoices;
      if (error) throw error;
      fetchedInvoices = data || [];
      if (fetchedInvoices.length === 0) {
        const local = localStorage.getItem('prismora_invoices');
        fetchedInvoices = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_invoices', JSON.stringify(fetchedInvoices));
      }
    } catch (err) {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      console.warn(`Supabase fetch invoices failed, using local cache.`, err);
      const local = localStorage.getItem('prismora_invoices');
      fetchedInvoices = local ? JSON.parse(local) : [];
    }
    
    // Automatically transition unpaid invoices to overdue if past due date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const processedInvoices = fetchedInvoices.map(inv => {
      if (inv.status === 'Unpaid' && inv.dueDate) {
        const due = new Date(inv.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due < today) {
          return { ...inv, status: 'Overdue' };
        }
      }
      return inv;
    });

    applyFetched('prismora_invoices', setInvoices, processedInvoices);
    localStorage.setItem('prismora_invoices', JSON.stringify(processedInvoices));

    // ── Credit Notes ──
    let fetchedCreditNotes = [];
    try {
      const { data, error } = await inflight.credit_notes;
      if (error) throw error;
      fetchedCreditNotes = data || [];
      if (fetchedCreditNotes.length === 0) {
        const local = localStorage.getItem('prismora_credit_notes');
        fetchedCreditNotes = local ? JSON.parse(local) : [];
      }
    } catch {
      const local = localStorage.getItem('prismora_credit_notes');
      fetchedCreditNotes = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_credit_notes', setCreditNotes, fetchedCreditNotes);

    // Async update transitioned invoices back to Supabase
    processedInvoices.forEach(async (inv) => {
      const original = fetchedInvoices.find(orig => orig.id === inv.id);
      if (original && original.status === 'Unpaid' && inv.status === 'Overdue') {
        await persist('invoices update', supabase.from('invoices').update({ status: 'Overdue' }).eq('id', inv.id));
      }
    });

    // Fetch Expenses with fallback
    let fetchedExpenses = [];
    try {
      const { data, error } = await inflight.expenses;
      if (error) throw error;
      fetchedExpenses = data || [];
      if (fetchedExpenses.length === 0) {
        const local = localStorage.getItem('prismora_expenses');
        fetchedExpenses = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_expenses', JSON.stringify(fetchedExpenses));
      }
    } catch (err) {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      console.warn(`Supabase fetch expenses failed, using local cache.`, err);
      const local = localStorage.getItem('prismora_expenses');
      fetchedExpenses = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_expenses', setExpenses, fetchedExpenses);

    // ── Phase 1 fetches — localStorage-backed fallbacks ──────────────────

    // Default seed data for when tables don't exist yet

    // ── Inventory ──
    let fetchedInventory = [];
    try {
      const { data, error } = await inflight.inventory;
      if (error) throw error;
      fetchedInventory = data || [];
      if (fetchedInventory.length === 0) {
        const local = localStorage.getItem('prismora_inventory');
        fetchedInventory = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_inventory', JSON.stringify(fetchedInventory));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_inventory');
      fetchedInventory = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_inventory', setInventory, fetchedInventory);

    // ── Vendors ──
    let fetchedVendors = [];
    try {
      const { data, error } = await inflight.vendors;
      if (error) throw error;
      fetchedVendors = data || [];
      if (fetchedVendors.length === 0) {
        const local = localStorage.getItem('prismora_vendors');
        fetchedVendors = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_vendors', JSON.stringify(fetchedVendors));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_vendors');
      fetchedVendors = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_vendors', setVendors, fetchedVendors);

    // ── Vendor Payments ──
    let fetchedVendorPayments = [];
    try {
      const { data, error } = await inflight.vendor_payments;
      if (error) throw error;
      fetchedVendorPayments = data || [];
      if (fetchedVendorPayments.length === 0) {
        const local = localStorage.getItem('prismora_vendor_payments');
        fetchedVendorPayments = local ? JSON.parse(local) : [];
      }
    } catch {
      const local = localStorage.getItem('prismora_vendor_payments');
      fetchedVendorPayments = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_vendor_payments', setVendorPayments, fetchedVendorPayments);

    // ── Purchase Returns ──
    let fetchedReturns = [];
    try {
      const { data, error } = await inflight.purchase_returns;
      if (error) throw error;
      fetchedReturns = data || [];
      if (fetchedReturns.length === 0) {
        const local = localStorage.getItem('prismora_purchase_returns');
        fetchedReturns = local ? JSON.parse(local) : [];
      }
    } catch {
      const local = localStorage.getItem('prismora_purchase_returns');
      fetchedReturns = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_purchase_returns', setPurchaseReturns, fetchedReturns);

    // ── Purchase Orders ──
    let fetchedPOs = [];
    try {
      const { data, error } = await inflight.purchase_orders;
      if (error) throw error;
      fetchedPOs = data || [];
      if (fetchedPOs.length === 0) {
        const local = localStorage.getItem('prismora_purchase_orders');
        fetchedPOs = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_purchase_orders', JSON.stringify(fetchedPOs));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_purchase_orders');
      fetchedPOs = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_purchase_orders', setPurchaseOrders, fetchedPOs);

    // ── GRN ──
    let fetchedGRN = [];
    try {
      const { data, error } = await inflight.grn;
      if (error) throw error;
      fetchedGRN = data || [];
      if (fetchedGRN.length === 0) {
        const local = localStorage.getItem('prismora_grn');
        fetchedGRN = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_grn', JSON.stringify(fetchedGRN));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_grn');
      fetchedGRN = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_grn', setGrn, fetchedGRN);

    // ── Distributors ──
    let fetchedDist = [];
    try {
      const { data, error } = await inflight.distributors;
      if (error) throw error;
      fetchedDist = data || [];
      if (fetchedDist.length === 0) {
        const local = localStorage.getItem('prismora_distributors');
        fetchedDist = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_distributors', JSON.stringify(fetchedDist));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_distributors');
      fetchedDist = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_distributors', setDistributors, fetchedDist);

    // ── Dealers ──
    let fetchedDealers = [];
    try {
      const { data, error } = await inflight.dealers;
      if (error) throw error;
      fetchedDealers = data || [];
      if (fetchedDealers.length === 0) {
        const local = localStorage.getItem('prismora_dealers');
        fetchedDealers = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_dealers', JSON.stringify(fetchedDealers));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_dealers');
      fetchedDealers = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_dealers', setDealers, fetchedDealers);

    // ── Retailers ──
    let fetchedRetailers = [];
    try {
      const { data, error } = await inflight.retailers;
      if (error) throw error;
      fetchedRetailers = data || [];
      if (fetchedRetailers.length === 0) {
        const local = localStorage.getItem('prismora_retailers');
        fetchedRetailers = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_retailers', JSON.stringify(fetchedRetailers));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_retailers');
      fetchedRetailers = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_retailers', setRetailers, fetchedRetailers);

    // ── Schemes ──
    let fetchedSchemes = [];
    try {
      const { data, error } = await inflight.schemes;
      if (error) throw error;
      fetchedSchemes = data || [];
      if (fetchedSchemes.length === 0) {
        const local = localStorage.getItem('prismora_schemes');
        fetchedSchemes = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_schemes', JSON.stringify(fetchedSchemes));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_schemes');
      fetchedSchemes = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_schemes', setSchemes, fetchedSchemes);

    try {
      const { data, error } = await inflight.complaints;
      if (error) throw error;
      const fetchedComplaints = data || [];
      if (fetchedComplaints.length === 0) {
        const local = localStorage.getItem('prismora_complaints');
        const finalComplaints = local ? JSON.parse(local) : [];
        applyFetched('prismora_complaints', setComplaints, finalComplaints);
        localStorage.setItem('prismora_complaints', JSON.stringify(finalComplaints));
      } else {
        applyFetched('prismora_complaints', setComplaints, fetchedComplaints);
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_complaints');
      applyFetched('prismora_complaints', setComplaints, local ? JSON.parse(local) : []);
    }

    // ── Territories ──
    let fetchedTerritories = [];
    try {
      const { data, error } = await inflight.territories;
      if (error) throw error;
      fetchedTerritories = data || [];
      if (fetchedTerritories.length === 0) {
        const local = localStorage.getItem('prismora_territories');
        fetchedTerritories = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_territories', JSON.stringify(fetchedTerritories));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_territories');
      fetchedTerritories = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_territories', setTerritories, fetchedTerritories);

    // ── SFA Beat Plans ──
    let fetchedBeats = [];
    try {
      const { data, error } = await inflight.beat_plans;
      if (error) throw error;
      fetchedBeats = data || [];
      if (fetchedBeats.length === 0) {
        const local = localStorage.getItem('prismora_beat_plans');
        fetchedBeats = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_beat_plans', JSON.stringify(fetchedBeats));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_beat_plans');
      fetchedBeats = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_beat_plans', setBeatPlans, fetchedBeats);

    // ── SFA Attendance ──
    let fetchedAttendance = [];
    try {
      const { data, error } = await inflight.attendance;
      if (error) throw error;
      fetchedAttendance = data || [];
      if (fetchedAttendance.length === 0) {
        const local = localStorage.getItem('prismora_attendance');
        fetchedAttendance = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_attendance', JSON.stringify(fetchedAttendance));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_attendance');
      fetchedAttendance = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_attendance', setAttendance, fetchedAttendance);

    // ── SFA Visit Reports ──
    let fetchedVisits = [];
    try {
      const { data, error } = await inflight.visit_reports;
      if (error) throw error;
      fetchedVisits = data || [];
      if (fetchedVisits.length === 0) {
        const local = localStorage.getItem('prismora_visit_reports');
        fetchedVisits = local ? JSON.parse(local) : [];
        localStorage.setItem('prismora_visit_reports', JSON.stringify(fetchedVisits));
      }
    } catch {
      // A failed read is not an empty table — fall back to what this browser
      // cached, and to nothing else. Sample rows used to be seeded here, which
      // put invented records on screen as though they were real.
      const local = localStorage.getItem('prismora_visit_reports');
      fetchedVisits = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_visit_reports', setVisitReports, fetchedVisits);

    // ── Distributor Payments ──
    let fetchedPayments = [];
    try {
      const { data, error } = await inflight.distributor_payments;
      if (error) throw error;
      fetchedPayments = data || [];
      if (fetchedPayments.length === 0) {
        const local = localStorage.getItem('prismora_distributor_payments');
        fetchedPayments = local ? JSON.parse(local) : [];
      }
    } catch {
      const local = localStorage.getItem('prismora_distributor_payments');
      fetchedPayments = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_distributor_payments', setDistributorPayments, fetchedPayments);

    // ── Scheme Claims ──
    let fetchedClaims = [];
    try {
      const { data, error } = await inflight.scheme_claims;
      if (error) throw error;
      fetchedClaims = data || [];
      if (fetchedClaims.length === 0) {
        const local = localStorage.getItem('prismora_scheme_claims');
        fetchedClaims = local ? JSON.parse(local) : [];
      }
    } catch {
      const local = localStorage.getItem('prismora_scheme_claims');
      fetchedClaims = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_scheme_claims', setSchemeClaims, fetchedClaims);

    // ── Distributor Incentives ──
    let fetchedIncentives = [];
    try {
      const { data, error } = await inflight.distributor_incentives;
      if (error) throw error;
      fetchedIncentives = data || [];
      if (fetchedIncentives.length === 0) {
        const local = localStorage.getItem('prismora_distributor_incentives');
        fetchedIncentives = local ? JSON.parse(local) : [];
      }
    } catch {
      const local = localStorage.getItem('prismora_distributor_incentives');
      fetchedIncentives = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_distributor_incentives', setDistributorIncentives, fetchedIncentives);

    // ── Masters (the configurable dropdown lists) ──
    // A failed read falls back to the cache, and an empty table falls back to
    // the defaults compiled into masterLists.js. Either way no dropdown in the
    // app is ever left with nothing in it.
    let fetchedMasters = [];
    try {
      const { data, error } = await inflight.masters;
      if (error) throw error;
      fetchedMasters = data || [];
    } catch {
      const local = localStorage.getItem('prismora_masters');
      fetchedMasters = local ? JSON.parse(local) : [];
    }
    applyFetched('prismora_masters', setMasters, fetchedMasters);
  };

  // A backfill used to run here, uploading records that existed only in this
  // browser. It was written for a specific situation: the database was missing
  // tables and columns, so writes were being rejected and records were stranded
  // in localStorage. That schema is repaired and writes now succeed, so the
  // rescue has no job left — and it actively caused harm, because a browser
  // holding stale rows would re-upload records that had been deliberately
  // deleted, quietly undoing a data reset. localStorage is a cache again.

  // ── Audit Log ────────────────────────────────────────────────────────────
  const logEvent = async (type, message, assignedTo, dataId) => {
    const newEvent = {
      id: `EV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type, message, assignedTo, dataId,
      timestamp: new Date().toISOString()
    };
    setEventLog(prev => [newEvent, ...prev]);
    await supabase.from('events').insert([newEvent]);
  };

  // ── Leads ────────────────────────────────────────────────────────────────
  const addLead = async (lead) => {
    const maxId = leads.reduce((max, l) => {
      const num = parseInt(l.id.replace('L', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const draft = { ...lead, createdAt: new Date().toISOString() };
    // Shaped by leadRow, the way orders are shaped by orderRow. This was the
    // one add function that sent the raw form straight to the database, and
    // the form carries five fields no column matched — so PostgREST refused
    // every statement and not one lead was ever stored.
    const { id: newId, saved } = await insertWithFreeId('leads insert', 'leads', 'L', maxId + 1, draft, leadRow);
    if (!saved) {
      // insertWithFreeId has already raised the banner explaining why. Putting
      // the lead on screen regardless is what hid this for so long: it looked
      // saved, it survived in this one browser, it was invisible to everybody
      // else, and it vanished for good the next time the cache was cleared.
      return null;
    }
    // Held in the same shape the table holds it, so nothing on screen changes
    // under the user when the next fetch replaces this row with the server's.
    const newLead = { ...leadRow(draft), id: newId };
    const next = [newLead, ...leads];
    setLeads(next);
    localStorage.setItem('prismora_leads', JSON.stringify(next));
    logEvent('lead_new', `New Lead added: ${lead.name}`, lead.assignedTo, newId);
    return newId;
  };

  const updateLead = async (id, updatedData) => {
    const oldLead = leads.find(l => l.id === id);
    let next = leads.map(l => l.id === id ? { ...l, ...updatedData } : l);

    let shouldCancelOrder = false;

    if (oldLead && oldLead.status !== updatedData.status) {
      const isConversionStatus = (s) => ['Converted', 'First Order', 'Active'].includes(s);
      const wasConverted = isConversionStatus(oldLead.status);
      const isConvertedNow = isConversionStatus(updatedData.status);

      // Converting no longer raises the order from here. A lead records which
      // products a customer is interested in, not how many of each, so this
      // used to invent the order: one unit of the first product, priced at the
      // whole deal value, with any other products silently dropped. Stock then
      // fell by one unit on delivery instead of the real amount. Leads.jsx now
      // confirms the line items first and calls convertLeadToOrder().
      if (!isConvertedNow && wasConverted) {
        shouldCancelOrder = true;
        updatedData.orderCreated = false;
        next = leads.map(l => l.id === id ? { ...l, ...updatedData } : l);
      }
    }

    setLeads(next);
    localStorage.setItem('prismora_leads', JSON.stringify(next));
    await persist('leads update', supabase.from('leads').update(leadRow(updatedData)).eq('id', id));

    if (oldLead && oldLead.status !== updatedData.status) {
      if (shouldCancelOrder) {
        // Found by the lead it was raised from. The previous rule matched on
        // customer name and company, which could remove an unrelated pending
        // order for the same customer.
        const targetOrder = orders.find(o => o.leadId === id && o.status === 'Pending');
        if (targetOrder) {
          logEvent('lead_rollback', `Lead rolled back from conversion: ${oldLead.name}. Pending order ${targetOrder.id} removed.`, updatedData.assignedTo || oldLead.assignedTo, id);
          setOrders(prev => {
            const nextOrders = prev.filter(o => o.id !== targetOrder.id);
            localStorage.setItem('prismora_orders', JSON.stringify(nextOrders));
            return nextOrders;
          });
          await persist('orders delete', supabase.from('orders').delete().eq('id', targetOrder.id));
        }
      } else if (updatedData.status === 'Lost') {
        logEvent('lead_lost', `Lead Lost: ${updatedData.name || oldLead.name}`, updatedData.assignedTo || oldLead.assignedTo, id);
      }
    }
  };

  /**
   * Raise the order for a lead the salesperson has just confirmed.
   *
   * Takes the line items rather than deriving them, because the lead genuinely
   * does not hold quantities — asking is the only honest way to get them. Also
   * records `leadId` on the order so a rollback can find it again.
   */
  const convertLeadToOrder = async (lead, lineItems, newStatus = 'First Order') => {
    if (!lead) return { ok: false, error: 'Lead not found.' };
    if (lead.orderCreated) return { ok: false, error: 'An order has already been raised for this lead.' };

    const items = (lineItems || [])
      .map(i => ({
        name: i.name,
        quantity: Number(i.quantity || 0),
        unitPrice: Number(i.unitPrice || 0),
        total: Number(i.quantity || 0) * Number(i.unitPrice || 0),
      }))
      .filter(i => i.name && i.quantity > 0);

    if (items.length === 0) return { ok: false, error: 'Enter a quantity for at least one product.' };

    const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalValue = items.reduce((sum, i) => sum + i.total, 0);

    const newOrderId = await addOrder({
      customerName: lead.name,
      companyName: lead.company || '',
      // A single-product order leaves `items` unset: partial delivery is only
      // tracked for those, and setting items would opt it out.
      product: items.length === 1 ? items[0].name : `${items[0].name} +${items.length - 1} more item${items.length > 2 ? 's' : ''}`,
      items: items.length > 1 ? items : undefined,
      quantity: totalUnits,
      value: totalValue || Number(lead.dealValue || 0),
      state: lead.state || '',
      city: lead.city || '',
      status: 'Pending',
      assignedTo: lead.assignedTo || '',
      leadId: lead.id,
      phone: lead.phone || '',
      email: lead.email || '',
      date: new Date().toISOString(),
    });

    await updateLead(lead.id, { status: newStatus, orderCreated: true });
    logEvent('lead_converted', `Lead ${lead.id} converted — order ${newOrderId} raised for ${totalUnits} unit(s)`, lead.assignedTo, newOrderId);
    return { ok: true, orderId: newOrderId };
  };

  const deleteLead = async (id) => {
    const next = leads.filter(l => l.id !== id);
    setLeads(next);
    localStorage.setItem('prismora_leads', JSON.stringify(next));
    await persist('leads delete', supabase.from('leads').delete().eq('id', id));
  };

  // ── Orders ───────────────────────────────────────────────────────────────
  const addOrder = async (order) => {
    const maxId = orders.reduce((max, o) => {
      const num = parseInt(o.id.replace('O', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    // The id is settled by the insert, so a clash with another user's order is
    // resolved before it ever reaches local state.
    const draft = { ...order, createdAt: new Date().toISOString() };
    const { id: newId } = await insertWithFreeId('orders insert', 'orders', 'O', maxId + 1, draft, orderRow);
    const newOrder = { ...draft, id: newId };
    const next = [newOrder, ...orders];
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    if (newOrder.distributorId || newOrder.dealerId || newOrder.retailerId) generateIncentivesForOrder(newOrder);
    return newId;
  };

  // Deducts an order's product quantity from inventory batches (earliest-expiry-first)
  // when the order is marked Delivered — keeps Stock Availability truthful.
  const deductInventoryForOrder = async (order) => {
    const lineItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
      : [{ name: order.product, quantity: Number(order.quantity || 0) }];

    for (const { name, quantity } of lineItems) {
      if (!name || quantity <= 0) continue;
      let remaining = quantity;
      const batches = inventory
        .filter(b => b.product === name && b.quantity > 0)
        // FEFO: soonest expiry first. Batches with no expiry date are consumed
        // LAST — `new Date(undefined || 0)` would put them at the epoch, draining
        // non-expiring stock before genuinely near-expiry stock and inverting FEFO.
        .sort((a, b) => {
          const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
          const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
          return ax - bx;
        });

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity);
        remaining -= deduct;
        const newQty = batch.quantity - deduct;
        setInventory(prev => {
          const nextInv = prev.map(b => b.id === batch.id ? { ...b, quantity: newQty } : b);
          localStorage.setItem('prismora_inventory', JSON.stringify(nextInv));
          return nextInv;
        });
        await persist('inventory update', supabase.from('inventory').update({ quantity: newQty }).eq('id', batch.id));
      }

      if (remaining > 0) {
        logEvent('stock_shortfall', `Delivered order ${order.id} needed ${quantity} of ${name} but only ${quantity - remaining} were available in stock`, null, order.id);
      }
    }
  };

  const updateOrder = async (id, updatedData) => {
    const oldOrder = orders.find(o => o.id === id);
    const next = orders.map(o => o.id === id ? { ...o, ...updatedData } : o);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    await persist('orders update', supabase.from('orders').update(orderRow(updatedData)).eq('id', id));
    if (oldOrder && oldOrder.status !== updatedData.status) {
      if (updatedData.status === 'Processing') {
        logEvent('order_processing', `Order Processing: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Ready for Dispatch') {
        logEvent('order_ready_for_dispatch', `Order Ready for Dispatch: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Shipped') {
        logEvent('order_shipped', `Order Shipped: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Delivered') {
        // Guard against re-delivering an order that was already fulfilled once
        // (e.g. Delivered -> Cancelled -> Delivered). Without this, stock is
        // deducted a second time and a duplicate invoice is raised against the
        // party, silently inflating both consumption and receivables.
        if (oldOrder.fulfilledAt) {
          logEvent('order_delivered', `Order re-marked Delivered (already fulfilled ${oldOrder.fulfilledAt}) — stock and billing skipped: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
          return;
        }
        logEvent('order_delivered', `Order Delivered: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
        const finalOrder = { ...oldOrder, ...updatedData, id };
        // If earlier partial deliveries already deducted some of this order's
        // stock, only deduct what's left now — otherwise this double-counts
        // the units already taken out of inventory. Doesn't apply to
        // multi-item orders, which don't support partial delivery.
        const alreadyDelivered = Number(oldOrder.deliveredQty || 0);
        const deductionOrder = alreadyDelivered > 0 && !(Array.isArray(finalOrder.items) && finalOrder.items.length > 0)
          ? { ...finalOrder, quantity: Number(finalOrder.quantity || 0) - alreadyDelivered }
          : finalOrder;
        await deductInventoryForOrder(deductionOrder);
        // Billed whether or not the order is linked to a partner record. The
        // link used to be the condition, so an order raised from a field visit
        // — where the shop has no retailer record yet — was delivered and then
        // never invoiced at all. It simply vanished from the accounts. Only the
        // balance update below needs a party; the invoice does not.
        await billPartyForOrder(finalOrder);
        await markOrderFulfilled(id);
      }
    }
  };

  // Stamps the order as having had its stock deducted and its invoice raised, so
  // a later status change back to "Delivered" can't trigger either a second time.
  const markOrderFulfilled = async (id) => {
    const fulfilledAt = new Date().toISOString();
    setOrders(prev => {
      const next = prev.map(o => o.id === id ? { ...o, fulfilledAt } : o);
      localStorage.setItem('prismora_orders', JSON.stringify(next));
      return next;
    });
    const { error } = await supabase.from('orders').update({ fulfilledAt }).eq('id', id);
    if (error) console.error(`Failed to record fulfilment stamp for order ${id} — a repeat "Delivered" could double-bill:`, error);
  };

  // Partial delivery: record that `deliverQty` more units of a (single-product)
  // order were physically delivered now. Deducts that stock, tracks cumulative
  // deliveredQty, and flips the order to "Partially Delivered" until the full
  // ordered quantity is met — at which point it becomes "Delivered" and bills.
  const deliverPartial = async (id, deliverQty) => {
    const order = orders.find(o => o.id === id);
    if (!order || deliverQty <= 0) return { ok: false, error: 'Invalid order or quantity.' };
    const totalQty = Number(order.quantity || 0);
    const already = Number(order.deliveredQty || 0);
    const newDelivered = Math.min(totalQty, already + Number(deliverQty));
    const actualNow = newDelivered - already;
    if (actualNow <= 0) return { ok: false, error: 'Nothing left to deliver on this order.' };

    // You can't deliver stock you don't physically hold. The modal's `max` attribute
    // isn't enforced (the input sits outside a <form>), so a typed-in quantity must
    // be validated here or the order gets marked Delivered and the customer billed
    // for goods that never left the warehouse.
    const availableNow = inventory
      .filter(b => b.product === order.product)
      .reduce((sum, b) => sum + Math.max(0, (b.quantity || 0) - (b.reserved || 0)), 0);
    if (actualNow > availableNow) {
      return { ok: false, error: `Only ${availableNow} unit(s) of ${order.product} in stock — cannot deliver ${actualNow}.` };
    }

    const fullyDone = newDelivered >= totalQty;
    const updatedData = { deliveredQty: newDelivered, status: fullyDone ? 'Delivered' : 'Partially Delivered' };

    const next = orders.map(o => o.id === id ? { ...o, ...updatedData } : o);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    // `.select()` makes the matched rows come back, so a write that targeted a
    // row Supabase doesn't have can be detected. Without it an .update() whose
    // filter matches nothing resolves with error: null — indistinguishable from
    // a real save. That is how delivery progress could look saved locally while
    // the database still held deliveredQty = 0, and the order came back showing
    // the full quantity outstanding on the next load.
    const { data: updatedRows, error: partialErr } = await supabase
      .from('orders').update(orderRow(updatedData)).eq('id', id).select('id');
    if (partialErr) {
      console.error('[Prismora] Could not save partial delivery — this change will be lost on refresh:', partialErr.message || partialErr);
    } else if (!updatedRows || updatedRows.length === 0) {
      console.warn(`[Prismora] Partial delivery for ${id} was not stored: no such order in the database. It exists only in this browser, so the progress will not survive a cache clear or appear on another device.`);
    }

    // Deduct only the units delivered in this instalment (single product)
    await deductInventoryForOrder({ ...order, items: undefined, product: order.product, quantity: actualNow, id });
    logEvent('order_partial_delivery', `Order ${id}: delivered ${actualNow} of ${totalQty} (${newDelivered}/${totalQty} cumulative)`, order.assignedTo, id);

    // Bill only once fully delivered (avoids partial-invoice complexity), and
    // regardless of whether a partner record is linked — see billPartyForOrder.
    if (fullyDone) {
      await billPartyForOrder({ ...order, ...updatedData });
    }
    if (fullyDone) await markOrderFulfilled(id);
    return { ok: true };
  };

  /**
   * GST on an order, taken from the rate held against each product.
   *
   * A multi-item order is taxed line by line, because the rates differ — the
   * catalogue carries 5%, 12% and 18%. A single-product order is taxed on its
   * whole value. A product that is not in the catalogue contributes no tax
   * rather than a guessed rate.
   */
  const gstForOrder = (order) => {
    const rateFor = (name) => {
      const p = (productCatalog || []).find(x => x.name === name);
      return p ? Number(p.gstPct || 0) / 100 : 0;
    };
    if (Array.isArray(order.items) && order.items.length > 0) {
      return Math.round(order.items.reduce((sum, i) =>
        sum + (Number(i.total ?? (Number(i.quantity || 0) * Number(i.unitPrice || 0))) * rateFor(i.name)), 0));
    }
    return Math.round(Number(order.value || 0) * rateFor(order.product));
  };

  // Generates an invoice for a delivered order and, where the order is linked
  // to a partner record, adds its value to that party's Outstanding balance —
  // without this, orders never show up as money owed anywhere in the app.
  /**
   * The invoice already raised for an order, if there is one.
   *
   * Asked of the database rather than local state, which a concurrent delivery
   * can leave stale. A failed read falls back to what this browser holds — on
   * a network blip the safe answer is "possibly already invoiced", because a
   * duplicate bill is worse than a missing one that can be raised by hand.
   */
  const findInvoiceForOrder = async (orderId) => {
    const { data, error } = await supabase
      .from('invoices').select('id').eq('orderId', orderId).limit(1);
    if (error) return invoices.find(i => i.orderId === orderId)?.id || null;
    return data && data.length > 0 ? data[0].id : null;
  };

  const billPartyForOrder = async (order) => {
    // An order can already have been invoiced by hand from the Accounting
    // screen — nothing there stops you billing an order that has not shipped
    // yet. Delivery then raised a second invoice for the same order, so the
    // customer was billed twice and a linked partner's balance went up twice.
    // Asked of the database rather than local state, which a concurrent
    // delivery can leave stale.
    const existingId = await findInvoiceForOrder(order.id);
    if (existingId) {
      logEvent('invoice_skipped', `Order ${order.id} delivered — already invoiced as ${existingId}, no second bill raised`, order.assignedTo, existingId);
      return existingId;
    }

    // react-hooks/purity flags Date.now() as unsafe to call while rendering.
    // This runs from a delivery handler, never during render, and the clock is
    // the point: the id and the dates are when the invoice was actually
    // raised. Twenty-odd other Date.now() calls in this file are identical and
    // unflagged — the rule only reaches this one now that the early return
    // above made the function analysable.
    /* eslint-disable react-hooks/purity */
    const newInvoiceId = `INV-${Date.now()}`;
    const newInvoice = {
      id: newInvoiceId,
      orderId: order.id,
      customerName: order.customerName,
      amount: Number(order.value || 0),
      // GST was hardcoded to zero here, so every invoice raised automatically
      // on delivery went out tax-free while the ones typed in by hand on the
      // Accounting screen carried it. The rate lives on the product, exactly
      // as the manual path reads it.
      tax: gstForOrder(order),
      status: 'Unpaid',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      assignedTo: order.assignedTo,
      createdAt: new Date().toISOString()
    };
    /* eslint-enable react-hooks/purity */
    // Persist from the functional update, not the closed-over `invoices` — two
    // deliveries billing back-to-back both read the same stale array and the
    // second write would drop the first invoice from the cache entirely.
    setInvoices(prev => {
      const next = [newInvoice, ...prev];
      localStorage.setItem('prismora_invoices', JSON.stringify(next));
      return next;
    });
    // Reported on the banner like every other write. This one only reached the
    // browser console, so an invoice the database refused looked identical to
    // one that saved — until it disappeared on the next load.
    const invoiceSaved = await persist('invoices insert', supabase.from('invoices').insert([newInvoice]));
    if (!invoiceSaved) {
      setInvoices(prev => {
        const next = prev.filter(i => i.id !== newInvoiceId);
        localStorage.setItem('prismora_invoices', JSON.stringify(next));
        return next;
      });
      return null;
    }
    logEvent('invoice_new', `Invoice generated for ${order.customerName}: ${newInvoiceId}`, order.assignedTo, newInvoiceId);

    await chargePartyForOrder(order);
    return newInvoiceId;
  };

  /**
   * Add an order's value to whichever partner it belongs to.
   *
   * Split out of billPartyForOrder so an invoice raised by hand does the same
   * thing. It did not: a manual invoice for a linked distributor produced a
   * bill that never became a receivable on their account, so the Accounting
   * screen and the partner's outstanding balance disagreed.
   */
  const chargePartyForOrder = async (order) => {
    if (!order) return;
    if (order.distributorId) {
      const dist = distributors.find(d => d.id === order.distributorId);
      if (dist) {
        const newOutstanding = (dist.outstandingAmount || 0) + Number(order.value || 0);
        const nextDist = distributors.map(d => d.id === dist.id ? { ...d, outstandingAmount: newOutstanding } : d);
        setDistributors(nextDist);
        localStorage.setItem('prismora_distributors', JSON.stringify(nextDist));
        await persist('distributors update', supabase.from('distributors').update({ outstandingAmount: newOutstanding }).eq('id', dist.id));
      }
    } else if (order.dealerId) {
      const dealer = dealers.find(d => d.id === order.dealerId);
      if (dealer) {
        const newOutstanding = (dealer.outstandingAmount || 0) + Number(order.value || 0);
        const nextDealers = dealers.map(d => d.id === dealer.id ? { ...d, outstandingAmount: newOutstanding } : d);
        setDealers(nextDealers);
        localStorage.setItem('prismora_dealers', JSON.stringify(nextDealers));
        await persist('dealers update', supabase.from('dealers').update({ outstandingAmount: newOutstanding }).eq('id', dealer.id));
      }
    } else if (order.retailerId) {
      const retailer = retailers.find(r => r.id === order.retailerId);
      if (retailer) {
        const newOutstanding = (retailer.outstandingAmount || 0) + Number(order.value || 0);
        const nextRetailers = retailers.map(r => r.id === retailer.id ? { ...r, outstandingAmount: newOutstanding } : r);
        setRetailers(nextRetailers);
        localStorage.setItem('prismora_retailers', JSON.stringify(nextRetailers));
        await persist('retailers update', supabase.from('retailers').update({ outstandingAmount: newOutstanding }).eq('id', retailer.id));
      }
    }
  };

  // ── Masters ──────────────────────────────────────────────────────────────
  // The rules about locked keys live here, not only in the screen. A key the
  // code branches on must not be renamable through any path — a screen can be
  // bypassed, and the cost of getting it wrong is deliveries that stop billing.

  const MASTER_COLUMNS = ['id', 'list', 'key', 'label', 'color', 'description', 'sort', 'active', 'locked', 'createdAt'];
  const masterRow = shapeFor(MASTER_COLUMNS);

  const addMasterOption = async (listId, label) => {
    const clean = String(label || '').trim();
    if (!listId || !clean) return { ok: false, error: 'Give the option a name.' };

    const existing = masters.filter(m => m.list === listId);
    if (existing.some(m => m.key.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: `"${clean}" is already in this list.` };
    }
    // Added options are never locked: the code cannot branch on something it
    // has never heard of, so there is nothing to protect.
    const row = masterRow({
      id: `M-${listId}-${Date.now()}`,
      list: listId,
      key: clean,
      label: clean,
      // Status lists are drawn as badges, so a new one needs something to be
      // drawn in. Grey is deliberate: obvious, and clearly not yet chosen.
      color: listId.endsWith('status') ? '#64748b' : null,
      description: '',
      sort: existing.reduce((max, m) => Math.max(max, Number(m.sort || 0)), -1) + 1,
      active: true,
      locked: false,
      createdAt: new Date().toISOString(),
    });

    const next = [...masters, row];
    setMasters(next);
    localStorage.setItem('prismora_masters', JSON.stringify(next));
    const saved = await persist('masters insert', supabase.from('masters').insert([row]));
    if (!saved) {
      setMasters(masters);
      localStorage.setItem('prismora_masters', JSON.stringify(masters));
      return { ok: false, error: 'Could not save — see the banner above.' };
    }
    logEvent('master_added', `Added "${clean}" to ${listId}`, null, row.id);
    return { ok: true };
  };

  const updateMasterOption = async (id, changes) => {
    const before = masters.find(m => m.id === id);
    if (!before) return { ok: false, error: 'That option no longer exists.' };

    // Only the label, order and whether it is in use may move on a locked row.
    const allowed = before.locked
      ? { label: changes.label, sort: changes.sort, active: changes.active }
      : changes;
    const patch = {};
    for (const [k, v] of Object.entries(allowed)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0) return { ok: true };

    if (patch.label !== undefined && !String(patch.label).trim()) {
      return { ok: false, error: 'An option needs a name.' };
    }
    if (patch.key !== undefined) {
      const clean = String(patch.key).trim();
      if (masters.some(m => m.list === before.list && m.id !== id && m.key.toLowerCase() === clean.toLowerCase())) {
        return { ok: false, error: `"${clean}" is already in this list.` };
      }
      patch.key = clean;
    }

    const next = masters.map(m => m.id === id ? { ...m, ...patch } : m);
    setMasters(next);
    localStorage.setItem('prismora_masters', JSON.stringify(next));
    const saved = await persist('masters update', supabase.from('masters').update(masterRow(patch)).eq('id', id));
    if (!saved) {
      setMasters(masters);
      localStorage.setItem('prismora_masters', JSON.stringify(masters));
      return { ok: false, error: 'Could not save — see the banner above.' };
    }
    return { ok: true };
  };

  const deleteMasterOption = async (id) => {
    const before = masters.find(m => m.id === id);
    if (!before) return { ok: true };
    if (before.locked) {
      return { ok: false, error: 'This one is part of a workflow and cannot be removed. Switch it off instead.' };
    }
    const next = masters.filter(m => m.id !== id);
    setMasters(next);
    localStorage.setItem('prismora_masters', JSON.stringify(next));
    const saved = await persist('masters delete', supabase.from('masters').delete().eq('id', id));
    if (!saved) {
      setMasters(masters);
      localStorage.setItem('prismora_masters', JSON.stringify(masters));
      return { ok: false, error: 'Could not save — see the banner above.' };
    }
    logEvent('master_removed', `Removed "${before.label}" from ${before.list}`, null, id);
    return { ok: true };
  };

  const deleteOrder = async (id) => {
    const next = orders.filter(o => o.id !== id);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    await persist('orders delete', supabase.from('orders').delete().eq('id', id));
  };

  // Lets a distributor self-acknowledge physical receipt of an order —
  // separate from internal staff marking it "Delivered".
  const confirmOrderReceipt = async (id) => {
    const order = orders.find(o => o.id === id);
    const receivedAt = new Date().toISOString();
    const next = orders.map(o => o.id === id ? { ...o, receivedByDistributor: true, receivedAt } : o);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    await persist('orders update', supabase.from('orders').update({ receivedByDistributor: true, receivedAt }).eq('id', id));
    if (order) logEvent('order_receipt_confirmed', `${order.customerName} confirmed receipt of order ${id}`, order.assignedTo, id);
  };

  // Splits an order when there isn't enough stock to fulfill it in full:
  // whatever IS available stays on the original order (which can now proceed
  // to dispatch), and the shortfall moves to a brand-new order that waits in
  // Processing until stock is replenished.
  // shipNowQuantities: optional { [productName]: qty } — how many units of
  // each line item to keep on the original order. Any not specified (or if
  // the whole param is omitted) falls back to auto-computed available stock.
  const splitOrder = async (id, shipNowQuantities) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    const rawLineItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map(i => ({ ...i, quantity: Number(i.quantity || 0) }))
      : [{ name: order.product, quantity: Number(order.quantity || 0), unitPrice: order.quantity ? (order.value || 0) / order.quantity : 0, gstPct: 0, total: order.value || 0 }];

    const getAvailableQty = (productName) => inventory
      .filter(b => b.product === productName)
      .reduce((sum, b) => sum + Math.max(0, (b.quantity || 0) - (b.reserved || 0)), 0);

    const keepItems = [];
    const splitItems = [];
    rawLineItems.forEach(item => {
      if (!item.name || item.quantity <= 0) return;
      const manualQty = shipNowQuantities && shipNowQuantities[item.name] !== undefined
        ? Number(shipNowQuantities[item.name])
        : null;
      const requestedKeep = manualQty !== null ? manualQty : getAvailableQty(item.name);
      const keepQty = Math.min(item.quantity, Math.max(0, requestedKeep));
      const splitQty = item.quantity - keepQty;
      const unitPrice = item.unitPrice || (item.quantity ? (item.total || 0) / item.quantity : 0);
      if (keepQty > 0) keepItems.push({ ...item, quantity: keepQty, total: unitPrice * keepQty });
      if (splitQty > 0) splitItems.push({ ...item, quantity: splitQty, total: unitPrice * splitQty });
    });

    if (splitItems.length === 0 || keepItems.length === 0) return;

    const maxId = orders.reduce((max, o) => {
      const num = parseInt(o.id.replace('O', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newOrderId = `O${maxId + 1}`;
    const hasItems = Array.isArray(order.items) && order.items.length > 0;
    const nameFor = (items) => items.length === 1 ? items[0].name : `${items[0].name} +${items.length - 1} more item${items.length > 2 ? 's' : ''}`;

    const splitOrderObj = {
      ...order,
      id: newOrderId,
      items: hasItems ? splitItems : undefined,
      product: nameFor(splitItems),
      quantity: splitItems.reduce((s, i) => s + i.quantity, 0),
      value: splitItems.reduce((s, i) => s + (i.total || 0), 0),
      status: 'Processing',
      splitFromOrderId: id,
      receivedByDistributor: false,
      receivedAt: null,
      createdAt: new Date().toISOString()
    };

    const updatedOriginal = {
      items: hasItems ? keepItems : undefined,
      product: nameFor(keepItems),
      quantity: keepItems.reduce((s, i) => s + i.quantity, 0),
      value: keepItems.reduce((s, i) => s + (i.total || 0), 0),
      splitIntoOrderId: newOrderId
    };

    const next = [splitOrderObj, ...orders.map(o => o.id === id ? { ...o, ...updatedOriginal } : o)];
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    await persist('orders insert', supabase.from('orders').insert([orderRow(splitOrderObj)]));
    await persist('orders update', supabase.from('orders').update(orderRow(updatedOriginal)).eq('id', id));
    logEvent('order_split', `Order ${id} split — ${updatedOriginal.quantity} unit(s) proceeding now, ${splitOrderObj.quantity} unit(s) moved to new order ${newOrderId} pending restock`, order.assignedTo, id);
  };

  // ── Products ─────────────────────────────────────────────────────────────
  const addProduct = async (productData) => {
    // Callers pass either a full product object (Settings' catalog form) or just
    // a product-name string (Orders and Leads, which save custom typed products).
    // Spreading a raw string would explode it into numeric character keys and a
    // nameless catalog row, so normalise to an object first.
    const normalized = typeof productData === 'string' ? { name: productData } : (productData || {});
    const name = String(normalized.name || '').trim();
    if (!name) return;

    // Orders/Leads call this on every save, not only for genuinely new products —
    // bail out if this name is already catalogued so we don't pile up duplicates.
    if (productCatalog.some(p => String(p?.name || '').toLowerCase() === name.toLowerCase())) return;

    const newId = `P${Date.now()}`;
    const newProduct = { ...normalized, name, id: newId, createdAt: new Date().toISOString() };

    setProductCatalog(prev => {
      const next = [newProduct, ...prev];
      localStorage.setItem('prismora_product_catalog', JSON.stringify(next));
      return next;
    });

    setProducts(prev => (prev.includes(name) ? prev : [...prev, name]));

    await persist('products insert', supabase.from('products').insert([newProduct]));
    logEvent('product_added', `Added product: ${name}`, null, newId);
  };

  const updateProduct = async (id, updatedData) => {
    setProductCatalog(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updatedData } : p);
      localStorage.setItem('prismora_product_catalog', JSON.stringify(next));
      return next;
    });

    const oldProd = productCatalog.find(p => p.id === id);
    if (oldProd && oldProd.name !== updatedData.name) {
      setProducts(prev => prev.map(name => name === oldProd.name ? updatedData.name : name));
    }

    await persist('products update', supabase.from('products').update(updatedData).eq('id', id));
  };

  const deleteProduct = async (id) => {
    const oldProd = productCatalog.find(p => p.id === id);
    setProductCatalog(prev => {
      const next = prev.filter(p => p.id !== id);
      localStorage.setItem('prismora_product_catalog', JSON.stringify(next));
      return next;
    });

    if (oldProd) {
      setProducts(prev => prev.filter(name => name !== oldProd.name));
    }

    await persist('products delete', supabase.from('products').delete().eq('id', id));
  };

  // ── Invoices ─────────────────────────────────────────────────────────────
  const addInvoice = async (invoiceData) => {
    const maxId = invoices.reduce((max, inv) => {
      const num = parseInt(inv.id.replace('INV-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const draft = { ...invoiceData, createdAt: new Date().toISOString() };
    let { id: newId, saved } = await insertWithFreeId('invoices insert', 'invoices', 'INV-', maxId + 1, draft);

    // Older databases are missing the `assignedTo` column, which rejects the
    // whole row. Retry once without it rather than losing the invoice.
    if (!saved) {
      const { assignedTo, ...withoutAssignee } = draft;
      const retry = await insertWithFreeId('invoices insert (without assignedTo)', 'invoices', 'INV-', maxId + 1, withoutAssignee);
      newId = retry.id;
    }

    const newInvoice = { ...draft, id: newId };
    setInvoices(prev => [newInvoice, ...prev]);
    const local = localStorage.getItem('prismora_invoices');
    const existing = local ? JSON.parse(local) : [];
    localStorage.setItem('prismora_invoices', JSON.stringify([newInvoice, ...existing]));
    logEvent('invoice_new', `Invoice generated for ${invoiceData.customerName}: ${newId}`, invoiceData.assignedTo, newId);

    // Billing by hand now moves the partner's balance, exactly as billing on
    // delivery does. Without this a manual invoice for a linked distributor
    // was a bill that never became money owed, so Accounting and the
    // partner's outstanding figure told two different stories.
    if (invoiceData.orderId) {
      await chargePartyForOrder(orders.find(o => o.id === invoiceData.orderId));
    }
    return newId;
  };

  const updateInvoiceStatus = async (id, status) => {
    const oldInvoice = invoices.find(inv => inv.id === id);
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
    try {
      const { error } = await supabase.from('invoices').update({ status }).eq('id', id);
      if (error) throw error;
    } catch (err) {
      const local = localStorage.getItem('prismora_invoices');
      if (local) {
        const updated = JSON.parse(local).map(inv => inv.id === id ? { ...inv, status } : inv);
        localStorage.setItem('prismora_invoices', JSON.stringify(updated));
      }
    }
    if (oldInvoice) logEvent('invoice_status_update', `Invoice ${id} marked as ${status}`, oldInvoice.assignedTo, id);
  };

  const deleteInvoice = async (id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
    try { await supabase.from('invoices').delete().eq('id', id); }
    catch (err) { console.warn('Failed to delete invoice from Supabase.', err); }
    const local = localStorage.getItem('prismora_invoices');
    if (local) {
      localStorage.setItem('prismora_invoices', JSON.stringify(JSON.parse(local).filter(inv => inv.id !== id)));
    }
  };

  // ── Credit Notes (sales returns / adjustments) ────────────────────────────
  // A credit note reduces what a customer owes us — the sales-side mirror of a
  // purchase return. Reduces the matching channel partner's outstanding balance.
  const addCreditNote = async (cnData) => {
    const newId = `CN-${Date.now()}`;
    const newCN = { ...cnData, id: newId, createdAt: new Date().toISOString() };
    setCreditNotes(prev => {
      const next = [newCN, ...prev];
      localStorage.setItem('prismora_credit_notes', JSON.stringify(next));
      return next;
    });
    await persist('credit_notes insert', supabase.from('credit_notes').insert([newCN]));

    const amount = Number(cnData.amount || 0);
    const name = (cnData.customerName || '').toLowerCase();
    const applyCredit = async (list, setter, table) => {
      const match = list.find(p => (p.name || '').toLowerCase() === name);
      if (!match) return false;
      const newOutstanding = Math.max(0, (match.outstandingAmount || 0) - amount);
      const next = list.map(p => p.id === match.id ? { ...p, outstandingAmount: newOutstanding } : p);
      setter(next);
      localStorage.setItem(`prismora_${table}`, JSON.stringify(next));
      // Must be awaited: without it the promise escapes the try/catch entirely and
      // a failed balance write is never noticed, silently reverting on next fetch.
      const { error } = await supabase.from(table).update({ outstandingAmount: newOutstanding }).eq('id', match.id);
      if (error) console.error(`Credit note: failed to update ${table} outstanding balance — will revert on next refresh:`, error);
      return true;
    };
    // Match against whichever channel the customer belongs to. Awaited in sequence
    // rather than `a() || b()` — now that applyCredit is async it returns a Promise,
    // which is always truthy, so `||` would stop after the first call and never try
    // dealers or retailers.
    const credited = await applyCredit(distributors, setDistributors, 'distributors')
      || await applyCredit(dealers, setDealers, 'dealers')
      || await applyCredit(retailers, setRetailers, 'retailers');

    if (!credited) {
      console.warn(`Credit note ${newId}: no distributor/dealer/retailer named "${cnData.customerName}" — the note was recorded but no outstanding balance was reduced.`);
    }

    logEvent('credit_note', `Credit note ${newId} issued to ${cnData.customerName} for ₹${amount} (${cnData.reason || 'adjustment'})`, cnData.recordedBy, newId);
  };

  // ── Expenses ─────────────────────────────────────────────────────────────
  const addExpense = async (expenseData) => {
    const maxId = expenses.reduce((max, exp) => {
      const num = parseInt(exp.id.replace('EXP-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const draft = { ...expenseData, createdAt: new Date().toISOString() };
    const { id: newId } = await insertWithFreeId('expenses insert', 'expenses', 'EXP-', maxId + 1, draft);
    const newExpense = { ...draft, id: newId };
    setExpenses(prev => [newExpense, ...prev]);
    const local = localStorage.getItem('prismora_expenses');
    const existing = local ? JSON.parse(local) : [];
    localStorage.setItem('prismora_expenses', JSON.stringify([newExpense, ...existing]));
    logEvent('expense_new', `Logged expense: ${expenseData.category} - ${newExpense.amount}`, expenseData.assignedTo, newId);
  };

  const deleteExpense = async (id) => {
    setExpenses(prev => prev.filter(exp => exp.id !== id));
    try { await supabase.from('expenses').delete().eq('id', id); }
    catch (err) { console.warn('Failed to delete expense from Supabase.', err); }
    const local = localStorage.getItem('prismora_expenses');
    if (local) {
      localStorage.setItem('prismora_expenses', JSON.stringify(JSON.parse(local).filter(exp => exp.id !== id)));
    }
  };

  // ════════════════════════════════════════════════════════════════
  // PHASE 1 — CRUD WITH localStorage PERSISTENCE
  // ════════════════════════════════════════════════════════════════

  // Helper: sync state array to localStorage
  const syncLS = (key, updater, current) => {
    const updated = updater(current);
    localStorage.setItem(key, JSON.stringify(updated));
    return updated;
  };

  // ── Inventory ─────────────────────────────────────────────────────────────
  const addInventoryItem = async (itemData) => {
    const newId = `INV-ITEM-${Date.now()}`;
    const newItem = { ...itemData, id: newId, createdAt: new Date().toISOString() };
    setInventory(prev => {
      const next = [newItem, ...prev];
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('inventory').insert([newItem]); }
    catch { /* table may not exist yet */ }
    logEvent('inventory_added', `Stock added: ${itemData.product} Batch:${itemData.batchNumber || 'N/A'}`, null, newId);
  };

  const updateInventoryItem = async (id, updatedData) => {
    setInventory(prev => {
      const next = prev.map(item => item.id === id ? { ...item, ...updatedData } : item);
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });
    await persist('inventory update', supabase.from('inventory').update(updatedData).eq('id', id));
  };

  const deleteInventoryItem = async (id) => {
    const item = inventory.find(i => i.id === id);
    setInventory(prev => {
      const next = prev.filter(i => i.id !== id);
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });
    await persist('inventory delete', supabase.from('inventory').delete().eq('id', id));
    if (item) logEvent('inventory_deleted', `Stock removed: ${item.product}`, null, id);
  };

  const adjustStock = async (id, adjustment, reason) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.quantity + adjustment);
    setInventory(prev => {
      const next = prev.map(i => i.id === id ? { ...i, quantity: newQty } : i);
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });
    await persist('inventory update', supabase.from('inventory').update({ quantity: newQty }).eq('id', id));
    logEvent('stock_adjusted', `Stock ${adjustment > 0 ? '+' : ''}${adjustment} for ${item.product}: ${reason}`, null, id);
  };

  /**
   * Take delivered goods into stock, as their own batch.
   *
   * Receiving used to call adjustStock on `inventory.find(by product name)` —
   * the first row for that product, whichever that happened to be. So 1000
   * bottles of hair oil were added to batch rbh100 and inherited its expiry of
   * 2027-10-10, a date belonging to different stock entirely. For a medicine
   * that is not a cosmetic detail. And when no row matched, `if (invItem)` meant
   * the goods were simply never taken into stock at all.
   *
   * A delivery is its own batch with its own expiry, so it gets its own row —
   * merged only into a row that is genuinely the same product AND batch.
   */
  const receiveStock = async ({ product, batchNumber, expiryDate, unitCost, quantity, warehouse, reason }) => {
    const qty = Number(quantity || 0);
    if (!product || qty <= 0) return null;

    const existing = inventory.find(i => i.product?.trim().toLowerCase() === product.trim().toLowerCase()
      && sameBatch(i.batchNumber, batchNumber));

    if (existing) {
      const newQty = Number(existing.quantity || 0) + qty;
      const patch = { quantity: newQty };
      // Fill in what the batch was missing rather than overwriting what it has.
      if (expiryDate && !existing.expiryDate) patch.expiryDate = expiryDate;
      if (unitCost && !existing.unitCost) patch.unitCost = Number(unitCost);
      setInventory(prev => {
        const next = prev.map(i => i.id === existing.id ? { ...i, ...patch } : i);
        localStorage.setItem('prismora_inventory', JSON.stringify(next));
        return next;
      });
      const ok = await persist('inventory update', supabase.from('inventory').update(patch).eq('id', existing.id));
      if (!ok) {
        setInventory(prev => {
          const next = prev.map(i => i.id === existing.id ? existing : i);
          localStorage.setItem('prismora_inventory', JSON.stringify(next));
          return next;
        });
        return null;
      }
      logEvent('stock_adjusted', `Stock +${qty} for ${product} (batch ${existing.batchNumber || 'unbatched'}): ${reason}`, null, existing.id);
      return existing.id;
    }

    const newId = `INV-ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem = inventoryRow({
      id: newId,
      product,
      batchNumber: batchNumber || '',
      expiryDate: expiryDate || null,
      quantity: qty,
      unitCost: Number(unitCost || 0),
      warehouse: warehouse || 'Main Warehouse',
      reorderLevel: 0, reserved: 0, transit: 0, damaged: 0,
      createdAt: new Date().toISOString(),
    });
    setInventory(prev => {
      const next = [newItem, ...prev];
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });
    const ok = await persist('inventory insert', supabase.from('inventory').insert([newItem]));
    if (!ok) {
      setInventory(prev => {
        const next = prev.filter(i => i.id !== newId);
        localStorage.setItem('prismora_inventory', JSON.stringify(next));
        return next;
      });
      return null;
    }
    logEvent('inventory_added', `Received ${qty} ${product} — batch ${batchNumber || 'none'}, expiry ${expiryDate ? String(expiryDate).slice(0, 10) : 'not given'}`, null, newId);
    return newId;
  };

  // Moves stock of a batch from its current warehouse to another. Reduces the
  // source batch and merges into a matching batch at the destination (same
  // product + batch number), creating a new destination batch if none exists.
  const transferStock = async (batchId, toWarehouse, qty, notes) => {
    const src = inventory.find(i => i.id === batchId);
    if (!src || qty <= 0 || qty > src.quantity || src.warehouse === toWarehouse) return;
    const newSrcQty = src.quantity - qty;
    const dest = inventory.find(i => i.product === src.product && i.batchNumber === src.batchNumber && i.warehouse === toWarehouse && i.id !== batchId);
    const newDestItem = dest ? null : {
      ...src, id: `INV-ITEM-${Date.now()}`, warehouse: toWarehouse, quantity: qty,
      reserved: 0, transit: 0, createdAt: new Date().toISOString()
    };

    setInventory(prev => {
      let next = prev.map(i => i.id === batchId ? { ...i, quantity: newSrcQty } : i);
      if (dest) next = next.map(i => i.id === dest.id ? { ...i, quantity: i.quantity + qty } : i);
      else next = [newDestItem, ...next];
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });

    await persist('inventory update', supabase.from('inventory').update({ quantity: newSrcQty }).eq('id', batchId));
    if (dest) { await persist('inventory update', supabase.from('inventory').update({ quantity: dest.quantity + qty }).eq('id', dest.id)); }
    else { await persist('inventory insert', supabase.from('inventory').insert([newDestItem])); }
    logEvent('stock_transfer', `Transferred ${qty} of ${src.product} from ${src.warehouse} → ${toWarehouse}${notes ? ` (${notes})` : ''}`, null, batchId);
  };

  // ── Vendors ───────────────────────────────────────────────────────────────
  const addVendor = async (vendorData) => {
    const newId = `V${Date.now()}`;
    const newVendor = { ...vendorData, id: newId, createdAt: new Date().toISOString() };
    setVendors(prev => {
      const next = [newVendor, ...prev];
      localStorage.setItem('prismora_vendors', JSON.stringify(next));
      return next;
    });
    await persist('vendors insert', supabase.from('vendors').insert([newVendor]));
    logEvent('vendor_added', `Vendor added: ${vendorData.name}`, null, newId);
  };

  const updateVendor = async (id, updatedData) => {
    setVendors(prev => {
      const next = prev.map(v => v.id === id ? { ...v, ...updatedData } : v);
      localStorage.setItem('prismora_vendors', JSON.stringify(next));
      return next;
    });
    await persist('vendors update', supabase.from('vendors').update(updatedData).eq('id', id));
  };

  const deleteVendor = async (id) => {
    setVendors(prev => {
      const next = prev.filter(v => v.id !== id);
      localStorage.setItem('prismora_vendors', JSON.stringify(next));
      return next;
    });
    await persist('vendors delete', supabase.from('vendors').delete().eq('id', id));
  };

  // ── Purchase Orders ───────────────────────────────────────────────────────
  const addPurchaseOrder = async (poData) => {
    const maxId = purchaseOrders.reduce((max, po) => {
      const num = parseInt(po.id.replace('PO-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const draft = { ...poData, status: 'Draft', createdAt: new Date().toISOString() };
    const { id: newId, saved } = await insertWithFreeId('purchase_orders insert', 'purchase_orders', 'PO-', maxId + 1, draft, purchaseOrderRow);
    if (!saved) return null;
    const newPO = { ...purchaseOrderRow(draft), id: newId };
    setPurchaseOrders(prev => {
      const next = [newPO, ...prev];
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    logEvent('po_created', `Purchase Order ${newId} created for ${poData.vendorName}`, poData.assignedTo, newId);
    return newId;
  };

  const updatePurchaseOrderStatus = async (id, status) => {
    setPurchaseOrders(prev => {
      const next = prev.map(po => po.id === id ? { ...po, status } : po);
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    await persist('purchase_orders update', supabase.from('purchase_orders').update({ status }).eq('id', id));
    logEvent('po_status_update', `Purchase Order ${id} → ${status}`, null, id);
  };

  /**
   * Cancel a PO, keeping it on file.
   *
   * 'Cancelled' was a defined status with a filter chip and no way to reach it,
   * so the only way out of a wrong order was Delete — which loses that it was
   * ever raised, and why. The reason goes into `notes` because the table has no
   * column for it, and inventing one would mean another migration before this
   * worked at all.
   */
  const cancelPurchaseOrder = async (id, reason) => {
    const before = purchaseOrders.find(po => po.id === id);
    if (!before) return null;
    const stamped = `Cancelled on ${new Date().toISOString().slice(0, 10)}: ${reason || 'no reason given'}`;
    const notes = before.notes ? `${before.notes}\n${stamped}` : stamped;

    setPurchaseOrders(prev => {
      const next = prev.map(po => po.id === id ? { ...po, status: 'Cancelled', notes } : po);
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    const ok = await persist('purchase_orders cancel', supabase.from('purchase_orders').update({ status: 'Cancelled', notes }).eq('id', id));
    if (!ok) {
      setPurchaseOrders(prev => {
        const next = prev.map(po => po.id === id ? before : po);
        localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
        return next;
      });
      return null;
    }
    logEvent('po_cancelled', `Purchase Order ${id} cancelled — ${reason || 'no reason given'}`, null, id);
    return id;
  };

  const deletePurchaseOrder = async (id) => {
    setPurchaseOrders(prev => {
      const next = prev.filter(po => po.id !== id);
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    await persist('purchase_orders delete', supabase.from('purchase_orders').delete().eq('id', id));
  };

  // ── GRN ───────────────────────────────────────────────────────────────────
  const addGRN = async (grnData) => {
    const maxId = grn.reduce((max, g) => {
      const num = parseInt(g.id.replace('GRN-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const draft = { ...grnData, createdAt: new Date().toISOString() };
    const { id: newId, saved } = await insertWithFreeId('grn insert', 'grn', 'GRN-', maxId + 1, draft, grnRow);
    // A receipt that was refused must not go on to close the PO or bill the
    // vendor for goods with no record behind them.
    if (!saved) return null;
    const newGRN = { ...grnRow(draft), id: newId };
    setGrn(prev => {
      const next = [newGRN, ...prev];
      localStorage.setItem('prismora_grn', JSON.stringify(next));
      return next;
    });
    if (grnData.poId) updatePurchaseOrderStatus(grnData.poId, 'GRN Done');
    logEvent('grn_created', `GRN ${newId} received from ${grnData.vendorName}`, grnData.receivedBy, newId);

    // Receiving goods creates money owed to the vendor — bump their outstanding
    // balance by the received value so it shows up as a payable, mirroring how a
    // delivered customer order bills the distributor/dealer/retailer.
    const grnValue = (grnData.items || []).reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitCost || 0)), 0);
    const linkedPO = purchaseOrders.find(p => p.id === grnData.poId);
    const vendor = vendors.find(v => v.id === (linkedPO?.vendorId)) ||
      vendors.find(v => v.name?.toLowerCase() === grnData.vendorName?.toLowerCase());
    if (vendor && grnValue > 0) {
      const newOutstanding = (vendor.outstandingAmount || 0) + grnValue;
      const nextVendors = vendors.map(v => v.id === vendor.id ? { ...v, outstandingAmount: newOutstanding } : v);
      setVendors(nextVendors);
      localStorage.setItem('prismora_vendors', JSON.stringify(nextVendors));
      await persist('vendors update', supabase.from('vendors').update({ outstandingAmount: newOutstanding }).eq('id', vendor.id));
    }
    // Returned so the caller can hold back the stock increase if this failed.
    return newId;
  };

  // ── Vendor Payments ───────────────────────────────────────────────────────
  const addVendorPayment = async (paymentData) => {
    const newId = `VPAY-${Date.now()}`;
    const newPayment = vendorPaymentRow({ ...paymentData, id: newId, createdAt: new Date().toISOString() });
    setVendorPayments(prev => {
      const next = [newPayment, ...prev];
      localStorage.setItem('prismora_vendor_payments', JSON.stringify(next));
      return next;
    });
    const saved = await persist('vendor_payments insert', supabase.from('vendor_payments').insert([newPayment]));
    if (!saved) {
      // The balance write below is a separate statement and would go through on
      // its own, so a refused payment used to still reduce what the vendor is
      // owed — money moving off the back of a record that does not exist, and
      // no payment left to explain it. Take the row back and change nothing.
      setVendorPayments(prev => {
        const next = prev.filter(p => p.id !== newId);
        localStorage.setItem('prismora_vendor_payments', JSON.stringify(next));
        return next;
      });
      return null;
    }

    const vendor = vendors.find(v => v.id === paymentData.vendorId);
    if (vendor) {
      const newOutstanding = Math.max(0, (vendor.outstandingAmount || 0) - Number(paymentData.amount || 0));
      const nextVendors = vendors.map(v => v.id === vendor.id ? { ...v, outstandingAmount: newOutstanding } : v);
      setVendors(nextVendors);
      localStorage.setItem('prismora_vendors', JSON.stringify(nextVendors));
      await persist('vendors update', supabase.from('vendors').update({ outstandingAmount: newOutstanding }).eq('id', vendor.id));
    }
    logEvent('vendor_payment', `Payment of ₹${paymentData.amount} recorded for ${vendor?.name || paymentData.vendorId}`, paymentData.recordedBy, newId);
  };

  // ── Purchase Returns ──────────────────────────────────────────────────────
  // Returning goods to a vendor reduces what we owe them (a credit on the
  // vendor ledger) and takes the returned units back out of inventory.
  const addPurchaseReturn = async (returnData) => {
    const newId = `PR-${Date.now()}`;
    const returnValue = (returnData.items || []).reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitCost || 0)), 0);
    const newReturn = purchaseReturnRow({ ...returnData, id: newId, value: returnValue, createdAt: new Date().toISOString() });
    setPurchaseReturns(prev => {
      const next = [newReturn, ...prev];
      localStorage.setItem('prismora_purchase_returns', JSON.stringify(next));
      return next;
    });
    const saved = await persist('purchase_returns insert', supabase.from('purchase_returns').insert([newReturn]));
    if (!saved) {
      // Worse than the payment case: this one also takes the units out of
      // inventory. A refused return used to credit the vendor and drop the
      // stock anyway, leaving both wrong with nothing on record to reverse.
      setPurchaseReturns(prev => {
        const next = prev.filter(r => r.id !== newId);
        localStorage.setItem('prismora_purchase_returns', JSON.stringify(next));
        return next;
      });
      return null;
    }

    // Credit the vendor payable (we owe them less now)
    const vendor = vendors.find(v => v.id === returnData.vendorId);
    if (vendor && returnValue > 0) {
      const newOutstanding = Math.max(0, (vendor.outstandingAmount || 0) - returnValue);
      const nextVendors = vendors.map(v => v.id === vendor.id ? { ...v, outstandingAmount: newOutstanding } : v);
      setVendors(nextVendors);
      localStorage.setItem('prismora_vendors', JSON.stringify(nextVendors));
      await persist('vendors update', supabase.from('vendors').update({ outstandingAmount: newOutstanding }).eq('id', vendor.id));
    }

    // Remove the returned units from inventory (goods physically leave)
    (returnData.items || []).forEach(item => {
      const qty = Number(item.quantity || 0);
      if (qty <= 0) return;
      const invItem = inventory.find(inv => inv.product?.toLowerCase() === item.product?.toLowerCase() && inv.quantity > 0);
      if (invItem) adjustStock(invItem.id, -qty, `Purchase return to ${vendor?.name || returnData.vendorName || 'vendor'}`);
    });

    logEvent('purchase_return', `Return ${newId} to ${vendor?.name || returnData.vendorName} — ₹${returnValue}`, returnData.recordedBy, newId);
    return newId;
  };

  // ── Distributors ──────────────────────────────────────────────────────────
  const addDistributor = async (distData) => {
    const newId = `DIST-${Date.now()}`;
    const newDist = { ...distData, id: newId, outstandingAmount: 0, createdAt: new Date().toISOString() };
    setDistributors(prev => {
      const next = [newDist, ...prev];
      localStorage.setItem('prismora_distributors', JSON.stringify(next));
      return next;
    });
    await persist('distributors insert', supabase.from('distributors').insert([newDist]));
    logEvent('distributor_added', `New distributor: ${distData.name} (${distData.territory})`, null, newId);
    return newId;
  };

  const updateDistributor = async (id, updatedData) => {
    setDistributors(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updatedData } : d);
      localStorage.setItem('prismora_distributors', JSON.stringify(next));
      return next;
    });
    await persist('distributors update', supabase.from('distributors').update(updatedData).eq('id', id));
  };

  const deleteDistributor = async (id) => {
    setDistributors(prev => {
      const next = prev.filter(d => d.id !== id);
      localStorage.setItem('prismora_distributors', JSON.stringify(next));
      return next;
    });
    await persist('distributors delete', supabase.from('distributors').delete().eq('id', id));
  };

  // ── Dealers ──────────────────────────────────────────────────────────────
  const addDealer = async (dealerData) => {
    const newId = `DEAL-${Date.now()}`;
    const newDealer = { ...dealerData, id: newId, outstandingAmount: 0, createdAt: new Date().toISOString() };
    setDealers(prev => {
      const next = [newDealer, ...prev];
      localStorage.setItem('prismora_dealers', JSON.stringify(next));
      return next;
    });
    await persist('dealers insert', supabase.from('dealers').insert([newDealer]));
    logEvent('dealer_added', `New dealer: ${dealerData.name} (${dealerData.territory})`, null, newId);
    return newId;
  };

  const updateDealer = async (id, updatedData) => {
    setDealers(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updatedData } : d);
      localStorage.setItem('prismora_dealers', JSON.stringify(next));
      return next;
    });
    await persist('dealers update', supabase.from('dealers').update(updatedData).eq('id', id));
  };

  const deleteDealer = async (id) => {
    setDealers(prev => {
      const next = prev.filter(d => d.id !== id);
      localStorage.setItem('prismora_dealers', JSON.stringify(next));
      return next;
    });
    await persist('dealers delete', supabase.from('dealers').delete().eq('id', id));
  };

  // ── Retailers ────────────────────────────────────────────────────────────
  const addRetailer = async (retailerData) => {
    const newId = `RET-${Date.now()}`;
    const newRetailer = { ...retailerData, id: newId, outstandingAmount: 0, createdAt: new Date().toISOString() };
    setRetailers(prev => {
      const next = [newRetailer, ...prev];
      localStorage.setItem('prismora_retailers', JSON.stringify(next));
      return next;
    });
    await persist('retailers insert', supabase.from('retailers').insert([newRetailer]));
    logEvent('retailer_added', `New retailer: ${retailerData.name} (${retailerData.territory})`, null, newId);
    return newId;
  };

  const updateRetailer = async (id, updatedData) => {
    setRetailers(prev => {
      const next = prev.map(r => r.id === id ? { ...r, ...updatedData } : r);
      localStorage.setItem('prismora_retailers', JSON.stringify(next));
      return next;
    });
    await persist('retailers update', supabase.from('retailers').update(updatedData).eq('id', id));
  };

  const deleteRetailer = async (id) => {
    setRetailers(prev => {
      const next = prev.filter(r => r.id !== id);
      localStorage.setItem('prismora_retailers', JSON.stringify(next));
      return next;
    });
    await persist('retailers delete', supabase.from('retailers').delete().eq('id', id));
  };

  // ── Schemes ───────────────────────────────────────────────────────────────
  const addScheme = async (schemeData) => {
    const newId = `SCH-${Date.now()}`;
    const newScheme = { ...schemeData, id: newId, createdAt: new Date().toISOString() };
    setSchemes(prev => {
      const next = [newScheme, ...prev];
      localStorage.setItem('prismora_schemes', JSON.stringify(next));
      return next;
    });
    await persist('schemes insert', supabase.from('schemes').insert([newScheme]));
    logEvent('scheme_created', `Scheme created: ${schemeData.name}`, null, newId);
  };

  const updateScheme = async (id, updatedData) => {
    setSchemes(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updatedData } : s);
      localStorage.setItem('prismora_schemes', JSON.stringify(next));
      return next;
    });
    await persist('schemes update', supabase.from('schemes').update(updatedData).eq('id', id));
  };

  const deleteScheme = async (id) => {
    setSchemes(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem('prismora_schemes', JSON.stringify(next));
      return next;
    });
    await persist('schemes delete', supabase.from('schemes').delete().eq('id', id));
  };

  // ── Complaints ────────────────────────────────────────────────────────────
  const addComplaint = async (complaintData) => {
    const maxId = complaints.reduce((max, c) => {
      const num = parseInt(c.id.replace('CMP-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const draft = { ...complaintData, status: 'Registered', createdAt: new Date().toISOString() };
    const { id: newId } = await insertWithFreeId('complaints insert', 'complaints', 'CMP-', maxId + 1, draft);
    const newComplaint = { ...draft, id: newId };
    setComplaints(prev => {
      const next = [newComplaint, ...prev];
      localStorage.setItem('prismora_complaints', JSON.stringify(next));
      return next;
    });
    logEvent('complaint_registered', `Complaint ${newId}: ${complaintData.complaintType} by ${complaintData.customerName}`, complaintData.assignedTo, newId);
  };

  const updateComplaintStatus = async (id, status, resolution = '') => {
    setComplaints(prev => {
      const next = prev.map(c => c.id === id ? { ...c, status, resolution } : c);
      localStorage.setItem('prismora_complaints', JSON.stringify(next));
      return next;
    });
    await persist('complaints update', supabase.from('complaints').update({ status, resolution }).eq('id', id));
    logEvent('complaint_updated', `Complaint ${id} → ${status}`, null, id);
  };

  const deleteComplaint = async (id) => {
    setComplaints(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem('prismora_complaints', JSON.stringify(next));
      return next;
    });
    await persist('complaints delete', supabase.from('complaints').delete().eq('id', id));
  };

  // ── Territories ────────────────────────────────────────────────────────────
  const addTerritory = async (territoryData) => {
    const newId = `T-${Date.now()}`;
    const newTerritory = { ...territoryData, id: newId, createdAt: new Date().toISOString() };
    setTerritories(prev => {
      const next = [newTerritory, ...prev];
      localStorage.setItem('prismora_territories', JSON.stringify(next));
      return next;
    });
    await persist('territories insert', supabase.from('territories').insert([newTerritory]));
    logEvent('territory_created', `Territory created: ${territoryData.name}`, null, newId);
  };

  const updateTerritory = async (id, updatedData) => {
    setTerritories(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updatedData } : t);
      localStorage.setItem('prismora_territories', JSON.stringify(next));
      return next;
    });
    await persist('territories update', supabase.from('territories').update(updatedData).eq('id', id));
  };

  const deleteTerritory = async (id) => {
    setTerritories(prev => {
      const next = prev.filter(t => t.id !== id);
      localStorage.setItem('prismora_territories', JSON.stringify(next));
      return next;
    });
    await persist('territories delete', supabase.from('territories').delete().eq('id', id));
  };

  // ── SFA Beat Plans ─────────────────────────────────────────────────────────
  const addBeatPlan = async (beatData) => {
    const newId = `B-${Date.now()}`;
    const newBeat = { ...beatData, id: newId, status: 'Planned', createdAt: new Date().toISOString() };
    setBeatPlans(prev => {
      const next = [newBeat, ...prev];
      localStorage.setItem('prismora_beat_plans', JSON.stringify(next));
      return next;
    });
    const saved = await persist('beat_plans insert', supabase.from('beat_plans').insert([newBeat]));
    if (!saved) {
      // Keeping a row the database refused is what made a new beat appear for a
      // few seconds and then vanish on the next load. Take it back now, while
      // the person is still looking at the screen and the banner explains why.
      setBeatPlans(prev => {
        const next = prev.filter(b => b.id !== newId);
        localStorage.setItem('prismora_beat_plans', JSON.stringify(next));
        return next;
      });
      return null;
    }
    logEvent('beat_plan_created', `Beat Plan assigned for date ${beatData.date}`, beatData.executiveId, newId);
    return newId;
  };

  /**
   * Record what happened at one outlet on a beat.
   *
   * A beat used to carry a single status, so checking in at the first outlet
   * marked the whole route done and every other outlet lost its check-in
   * button. Outcomes belong to outlets, and the beat's own status is derived
   * from them: untouched while nothing has been recorded, in progress while
   * some outlets remain, and Visited once every outlet has an outcome —
   * whether that outcome was a visit or a documented no-show.
   */
  const recordOutletOutcome = async (beatId, outletName, outcome, extra = {}) => {
    const beat = beatPlans.find(b => b.id === beatId);
    if (!beat || !outletName) return;

    const outletVisits = {
      ...(beat.outletVisits || {}),
      [outletName]: { outcome, at: new Date().toISOString(), ...extra },
    };

    const outlets = Array.isArray(beat.outlets) ? beat.outlets : [];
    // The status has to say what happened, not merely that the route was worked
    // through. Marking every outlet "could not visit" and calling the beat
    // Visited overstates coverage and reads as plainly wrong to the rep who
    // just recorded three closed shops.
    const done = outlets.filter(o => outletVisits[o]).length;
    const anyVisited = outlets.some(o => outletVisits[o]?.outcome === 'Visited');
    const status =
      done === 0 ? 'Planned'
        : done < outlets.length ? 'In Progress'
          : anyVisited ? 'Completed'
            : 'Not Visited';

    setBeatPlans(prev => {
      const next = prev.map(b => b.id === beatId ? { ...b, outletVisits, status } : b);
      localStorage.setItem('prismora_beat_plans', JSON.stringify(next));
      return next;
    });
    await persist('beat_plans update', supabase.from('beat_plans').update({ outletVisits, status }).eq('id', beatId));
    logEvent('outlet_outcome', `${outletName} on beat ${beatId}: ${outcome}${extra.reason ? ` — ${extra.reason}` : ''}`, beat.executiveId, beatId);
  };

  const updateBeatPlanStatus = async (id, status) => {
    setBeatPlans(prev => {
      const next = prev.map(b => b.id === id ? { ...b, status } : b);
      localStorage.setItem('prismora_beat_plans', JSON.stringify(next));
      return next;
    });
    await persist('beat_plans update', supabase.from('beat_plans').update({ status }).eq('id', id));
  };

  // ── SFA Attendance ────────────────────────────────────────────────────────
  const addAttendanceRecord = async (attendanceData) => {
    const newId = `ATT-${Date.now()}`;
    // Shaped, so one field the table does not have cannot void the whole punch.
    const newRecord = attendanceRow({ ...attendanceData, id: newId, createdAt: new Date().toISOString() });
    setAttendance(prev => {
      const next = [newRecord, ...prev];
      localStorage.setItem('prismora_attendance', JSON.stringify(next));
      return next;
    });
    const saved = await persist('attendance insert', supabase.from('attendance').insert([newRecord]));
    if (!saved) {
      // A punch nobody recorded is worse than a punch that visibly failed: the
      // salesperson believes they are marked present for the day. Take it back
      // while they are still on the screen, with the banner saying why.
      setAttendance(prev => {
        const next = prev.filter(a => a.id !== newId);
        localStorage.setItem('prismora_attendance', JSON.stringify(next));
        return next;
      });
      return null;
    }
    logEvent('attendance_checkin', `User checked in: ${attendanceData.status}`, attendanceData.userId, newId);
    return newId;
  };

  const updateAttendanceRecord = async (id, updatedData) => {
    const before = attendance.find(a => a.id === id);
    setAttendance(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updatedData } : a);
      localStorage.setItem('prismora_attendance', JSON.stringify(next));
      return next;
    });
    const saved = await persist('attendance update', supabase.from('attendance').update(attendanceRow(updatedData)).eq('id', id));
    if (!saved && before) {
      setAttendance(prev => {
        const next = prev.map(a => a.id === id ? before : a);
        localStorage.setItem('prismora_attendance', JSON.stringify(next));
        return next;
      });
    }
  };

  // ── SFA Visit Reports ──────────────────────────────────────────────────────
  const addVisitReport = async (visitData) => {
    const newId = `VR-${Date.now()}`;
    const newReport = { ...visitData, id: newId, status: 'Submitted', createdAt: new Date().toISOString() };
    setVisitReports(prev => {
      const next = [newReport, ...prev];
      localStorage.setItem('prismora_visit_reports', JSON.stringify(next));
      return next;
    });
    await persist('visit_reports insert', supabase.from('visit_reports').insert([newReport]));
    logEvent('visit_submitted', `Visit report logged for outlet: ${visitData.outletName}`, visitData.executiveId, newId);
    return newId;
  };

  // ── SFA Expense Claims ─────────────────────────────────────────────────────
  const addSFAExpense = async (expData) => {
    const newId = `EXP-${Date.now()}`;
    const newExp = { ...expData, id: newId, status: 'Pending', createdAt: new Date().toISOString() };
    setSfaExpenses(prev => {
      const next = [newExp, ...prev];
      localStorage.setItem('prismora_sfa_expenses', JSON.stringify(next));
      return next;
    });
    await persist('sfa_expenses insert', supabase.from('sfa_expenses').insert([newExp]));
  };

  const updateSFAExpense = async (id, updatedData) => {
    setSfaExpenses(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...updatedData } : e);
      localStorage.setItem('prismora_sfa_expenses', JSON.stringify(next));
      return next;
    });
    await persist('sfa_expenses update', supabase.from('sfa_expenses').update(updatedData).eq('id', id));
  };

  // ── Distributor Payments (Outstanding Ledger credits) ──────────────────────
  const addDistributorPayment = async (paymentData) => {
    const newId = `PAY-${Date.now()}`;
    const newPayment = { ...paymentData, id: newId, createdAt: new Date().toISOString() };
    setDistributorPayments(prev => {
      const next = [newPayment, ...prev];
      localStorage.setItem('prismora_distributor_payments', JSON.stringify(next));
      return next;
    });
    await persist('distributor_payments insert', supabase.from('distributor_payments').insert([newPayment]));

    const dist = distributors.find(d => d.id === paymentData.distributorId);
    if (dist) {
      const newOutstanding = Math.max(0, (dist.outstandingAmount || 0) - Number(paymentData.amount || 0));
      updateDistributor(dist.id, { outstandingAmount: newOutstanding });
    }
    logEvent('distributor_payment', `Payment of ₹${paymentData.amount} recorded for ${dist?.name || paymentData.distributorId}`, null, newId);
  };

  const addDealerPayment = async (paymentData) => {
    const newId = `PAY-${Date.now()}`;
    const newPayment = { ...paymentData, id: newId, createdAt: new Date().toISOString() };
    setDistributorPayments(prev => {
      const next = [newPayment, ...prev];
      localStorage.setItem('prismora_distributor_payments', JSON.stringify(next));
      return next;
    });
    await persist('distributor_payments insert', supabase.from('distributor_payments').insert([newPayment]));

    const dealer = dealers.find(d => d.id === paymentData.dealerId);
    if (dealer) {
      const newOutstanding = Math.max(0, (dealer.outstandingAmount || 0) - Number(paymentData.amount || 0));
      updateDealer(dealer.id, { outstandingAmount: newOutstanding });
    }
    logEvent('dealer_payment', `Payment of ₹${paymentData.amount} recorded for ${dealer?.name || paymentData.dealerId}`, null, newId);
  };

  const addRetailerPayment = async (paymentData) => {
    const newId = `PAY-${Date.now()}`;
    const newPayment = { ...paymentData, id: newId, createdAt: new Date().toISOString() };
    setDistributorPayments(prev => {
      const next = [newPayment, ...prev];
      localStorage.setItem('prismora_distributor_payments', JSON.stringify(next));
      return next;
    });
    await persist('distributor_payments insert', supabase.from('distributor_payments').insert([newPayment]));

    const retailer = retailers.find(r => r.id === paymentData.retailerId);
    if (retailer) {
      const newOutstanding = Math.max(0, (retailer.outstandingAmount || 0) - Number(paymentData.amount || 0));
      updateRetailer(retailer.id, { outstandingAmount: newOutstanding });
    }
    logEvent('retailer_payment', `Payment of ₹${paymentData.amount} recorded for ${retailer?.name || paymentData.retailerId}`, null, newId);
  };

  // ── Scheme Claims (distributor/dealer/retailer-submitted) ───────────────────
  const addSchemeClaim = async (claimData) => {
    const newId = `CLM-${Date.now()}`;
    const newClaim = { ...claimData, id: newId, status: 'Pending', createdAt: new Date().toISOString() };
    setSchemeClaims(prev => {
      const next = [newClaim, ...prev];
      localStorage.setItem('prismora_scheme_claims', JSON.stringify(next));
      return next;
    });
    await persist('scheme_claims insert', supabase.from('scheme_claims').insert([newClaim]));
    logEvent('scheme_claim_submitted', `Scheme claim submitted for ${claimData.schemeName}`, null, newId);
  };

  const updateSchemeClaimStatus = async (id, status, reviewNotes = '') => {
    setSchemeClaims(prev => {
      const next = prev.map(c => c.id === id ? { ...c, status, reviewNotes } : c);
      localStorage.setItem('prismora_scheme_claims', JSON.stringify(next));
      return next;
    });
    await persist('scheme_claims update', supabase.from('scheme_claims').update({ status, reviewNotes }).eq('id', id));
    logEvent('scheme_claim_updated', `Scheme claim ${id} → ${status}`, null, id);
  };

  // ── Distributor/Dealer/Retailer Incentives (auto-generated from Schemes) ───
  const generateIncentivesForOrder = (order) => {
    const partyType = order.distributorId ? 'Distributor' : order.dealerId ? 'Dealer' : order.retailerId ? 'Retailer' : null;
    if (!partyType) return;

    const matchingSchemes = schemes.filter(s =>
      [partyType, 'All'].includes(s.applicableTo) && isSchemeEligible(s, order)
    );

    matchingSchemes.forEach(async (scheme) => {
      const alreadyExists = distributorIncentives.some(i => i.orderId === order.id && i.schemeId === scheme.id);
      if (alreadyExists) return;

      const matchValue = getSchemeMatchValue(scheme, order);
      const incentiveType = scheme.discountPct > 0 ? 'Discount' : scheme.freeGoodsQty > 0 ? 'Free Goods' : 'Cash';
      const incentiveValue = scheme.discountPct > 0
        ? Math.round(matchValue * (Number(scheme.discountPct) / 100))
        : Number(scheme.freeGoodsQty || 0);

      const newId = `INC-${Date.now()}-${scheme.id}`;
      const newIncentive = {
        id: newId,
        distributorId: order.distributorId || null,
        dealerId: order.dealerId || null,
        retailerId: order.retailerId || null,
        schemeId: scheme.id,
        schemeName: scheme.name,
        orderId: order.id,
        orderValue: Number(order.value || 0),
        incentiveType,
        incentiveValue,
        status: 'Earned',
        createdAt: new Date().toISOString()
      };
      setDistributorIncentives(prev => {
        const next = [newIncentive, ...prev];
        localStorage.setItem('prismora_distributor_incentives', JSON.stringify(next));
        return next;
      });
      await persist('distributor_incentives insert', supabase.from('distributor_incentives').insert([newIncentive]));
      logEvent('incentive_earned', `Incentive earned on order ${order.id} via scheme ${scheme.name}`, null, newId);
    });
  };

  const markIncentivePaid = async (id) => {
    setDistributorIncentives(prev => {
      const next = prev.map(i => i.id === id ? { ...i, status: 'Paid' } : i);
      localStorage.setItem('prismora_distributor_incentives', JSON.stringify(next));
      return next;
    });
    await persist('distributor_incentives update', supabase.from('distributor_incentives').update({ status: 'Paid' }).eq('id', id));
  };

  return (
    <DataContext.Provider value={{
      // Original CRM
      leads, orders, eventLog, products, productCatalog, invoices, expenses,
      schemaError, dismissSchemaError: () => setSchemaError(null),
      addLead, updateLead, deleteLead, convertLeadToOrder,
      addOrder, updateOrder, deleteOrder, confirmOrderReceipt, splitOrder, deliverPartial,
      addProduct, updateProduct, deleteProduct,
      addInvoice, updateInvoiceStatus, deleteInvoice,
      creditNotes, addCreditNote,
      addExpense, deleteExpense,
      // Phase 1 Enterprise
      inventory, vendors, purchaseOrders, grn, distributors, dealers, retailers, schemes, complaints,
      addInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, transferStock, receiveStock,
      masters, addMasterOption, updateMasterOption, deleteMasterOption,
      addVendor, updateVendor, deleteVendor,
      vendorPayments, addVendorPayment,
      purchaseReturns, addPurchaseReturn,
      addPurchaseOrder, updatePurchaseOrderStatus, cancelPurchaseOrder, deletePurchaseOrder,
      addGRN,
      addDistributor, updateDistributor, deleteDistributor,
      addDealer, updateDealer, deleteDealer,
      addRetailer, updateRetailer, deleteRetailer,
      addScheme, updateScheme, deleteScheme,
      addComplaint, updateComplaintStatus, deleteComplaint,
      // Phase 2 Enterprise
      territories, addTerritory, updateTerritory, deleteTerritory,
      beatPlans, addBeatPlan, updateBeatPlanStatus, recordOutletOutcome,
      attendance, addAttendanceRecord, updateAttendanceRecord,
      visitReports, addVisitReport,
      sfaExpenses, addSFAExpense, updateSFAExpense,
      // Distributor / Dealer / Retailer Portal
      distributorPayments, addDistributorPayment, addDealerPayment, addRetailerPayment,
      schemeClaims, addSchemeClaim, updateSchemeClaimStatus,
      distributorIncentives, markIncentivePaid,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);

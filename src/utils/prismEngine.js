/**
 * PRISM Engine — self-contained natural-language query engine for PRISMORA.
 * No external API. Pipeline: normalize -> tokenize -> expand synonyms ->
 * score intents -> extract entities -> resolve against live data -> render answer.
 */

// ── 1. Text normalization & tokenization ────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did',
  'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'and', 'or', 'but',
  'i', 'we', 'you', 'me', 'my', 'our', 'us', 'it', 'its', 'that', 'this', 'these', 'those',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'please', 'tell', 'give',
  'there', 'their', 'have', 'has', 'had', 'get', 'want', 'need', 'know',
]);

// Light stemmer — collapses common English inflections so "orders"/"ordering" match "order".
const stem = (w) => {
  if (w.length <= 3) return w;
  for (const suf of ['ingly', 'edly', 'ing', 'ies', 'ied', 'es', 'ed', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      let base = w.slice(0, -suf.length);
      if (suf === 'ies' || suf === 'ied') base += 'y';
      return base;
    }
  }
  return w;
};

const normalize = (text) =>
  String(text || '').toLowerCase().replace(/[^a-z0-9₹%.\s-]/g, ' ').replace(/\s+/g, ' ').trim();

export const tokenize = (text) =>
  normalize(text).split(' ').filter(t => t && !STOPWORDS.has(t)).map(stem);

// ── 1b. Fuzzy matching (typo tolerance) ─────────────────────────────────────

/**
 * Damerau-Levenshtein edit distance (counts an adjacent transposition as one
 * edit, so "unpiad" → "unpaid" costs 1). Abandoned early once it exceeds `max`.
 */
const editDistance = (a, b, max = 2) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1); // transposition
      }
      cur[j] = d;
      if (d < rowBest) rowBest = d;
    }
    if (rowBest > max) return max + 1; // whole row already too far — bail out
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
};

// Concept correction stays strict — the vocabulary is full of short everyday
// words, and a loose budget turns "doing" into "owing" or "trader" into "order".
const conceptBudget = (w) => (w.length <= 6 ? 1 : 2);
// Proper nouns tolerate more: they're distinctive, so collisions are unlikely.
const nameBudget = (w) => (w.length <= 4 ? 1 : w.length <= 8 ? 2 : 3);

const closest = (token, vocabulary) => {
  const max = conceptBudget(token);
  let best = null, bestD = max + 1;
  for (const v of vocabulary) {
    if (Math.abs(v.length - token.length) > max) continue;
    const d = editDistance(token, v, max);
    if (d < bestD) { bestD = d; best = v; if (d === 0) break; }
  }
  return bestD <= max ? { word: best, distance: bestD } : null;
};

// Synonym groups — each token is expanded to its canonical concept before scoring.
const SYNONYMS = {
  revenue: ['revenue', 'sale', 'sales', 'turnover', 'income', 'earning', 'earn', 'booked', 'business', 'topline'],
  profit: ['profit', 'margin', 'net', 'bottomline', 'profitability', 'pnl', 'p&l'],
  expense: ['expense', 'cost', 'spend', 'spending', 'expenditure', 'outflow', 'overhead'],
  outstanding: ['outstanding', 'unpaid', 'overdue', 'receivable', 'pending', 'due', 'owe', 'owing', 'recover'],
  invoice: ['invoice', 'bill', 'billing', 'billed'],
  order: ['order', 'po', 'purchase-order', 'booking'],
  lead: ['lead', 'prospect', 'enquiry', 'inquiry', 'opportunity'],
  customer: ['customer', 'client', 'buyer', 'party', 'account'],
  distributor: ['distributor', 'dealer', 'retailer', 'channel', 'partner'],
  product: ['product', 'item', 'sku', 'goods', 'article'],
  stock: ['stock', 'inventory', 'warehouse', 'onhand', 'quantity', 'qty'],
  team: ['team', 'salesperson', 'staff', 'employee', 'executive', 'rep', 'person', 'people', 'user'],
  top: ['top', 'best', 'highest', 'most', 'maximum', 'max', 'leading', 'biggest', 'largest'],
  bottom: ['bottom', 'worst', 'lowest', 'least', 'minimum', 'min', 'poorest'],
  forecast: ['forecast', 'predict', 'projection', 'project', 'expected', 'future', 'next'],
  churn: ['churn', 'inactive', 'dormant', 'losing', 'lost', 'risk', 'retention', 'disengaged'],
  dead: ['dead', 'slow', 'stale', 'nonmoving', 'unsold', 'stagnant'],
  count: ['count', 'how-many', 'number', 'total', 'many'],
  list: ['list', 'show', 'display', 'view', 'which', 'what', 'who', 'find', 'search'],
  state: ['state', 'region', 'territory', 'zone', 'area', 'geography', 'location'],
  status: ['status', 'stage', 'progress', 'condition'],
  low: ['low', 'short', 'shortage', 'reorder', 'stockout', 'empty', 'finish', 'running'],
  help: ['help', 'hello', 'hi', 'hey', 'assist', 'capability', 'ask'],
};

// Register each synonym under every surface form the stemmer can produce, so
// "expense"/"expenses" both resolve even though they stem differently.
const CONCEPT_OF = (() => {
  const map = {};
  for (const [concept, words] of Object.entries(SYNONYMS)) {
    words.forEach(w => {
      [w, stem(w), stem(`${w}s`), stem(stem(w))].forEach(form => {
        if (form) map[form] = concept;
      });
    });
  }
  return map;
})();

const VOCABULARY = Object.keys(CONCEPT_OF);

// Ordinary English words that are already spelled correctly. Without this guard
// the corrector "fixes" them into lookalike concepts — "last" → "least".
const NEVER_CORRECT = new Set([
  'last', 'next', 'past', 'first', 'more', 'less', 'than', 'over', 'under', 'above',
  'below', 'about', 'much', 'very', 'been', 'were', 'when', 'where', 'why', 'how',
  'name', 'date', 'time', 'year', 'week', 'days', 'month', 'today', 'now', 'here',
  'good', 'bad', 'well', 'like', 'make', 'made', 'take', 'come', 'goes', 'going',
  'doing', 'done', 'said', 'says', 'work', 'used', 'each', 'every', 'some', 'any',
]);

/**
 * Map tokens to concepts, falling back to nearest-neighbour spell correction
 * when a token isn't recognised. Returns the corrections made so the UI can
 * show what was auto-corrected.
 */
const conceptize = (tokens) => {
  const set = new Set();
  const corrections = [];
  tokens.forEach(t => {
    set.add(t);
    const direct = CONCEPT_OF[t] || CONCEPT_OF[stem(t)];
    if (direct) { set.add(direct); return; }
    if (t.length < 4 || NEVER_CORRECT.has(t)) return; // too short / already valid
    const near = closest(t, VOCABULARY);
    if (near) {
      set.add(CONCEPT_OF[near.word]);
      corrections.push({ from: t, to: CONCEPT_OF[near.word] });
    }
  });
  return { concepts: set, corrections };
};

// ── 2. Intent definitions ───────────────────────────────────────────────────
// `must` = at least one required; `boost` = additive score; `weight` = tie-break priority.

const INTENTS = [
  { id: 'help', must: ['help'], boost: [], weight: 1 },
  { id: 'profit', must: ['profit'], boost: ['revenue', 'expense'], weight: 6 },
  { id: 'outstanding', must: ['outstanding'], boost: ['invoice', 'customer'], weight: 5 },
  { id: 'expense_breakdown', must: ['expense'], boost: ['list', 'top', 'count'], weight: 5 },
  { id: 'invoice_list', must: ['invoice'], boost: ['list', 'count'], weight: 4 },
  { id: 'forecast', must: ['forecast'], boost: ['product', 'revenue'], weight: 6 },
  { id: 'churn', must: ['churn'], boost: ['distributor', 'customer'], weight: 6 },
  { id: 'dead_stock', must: ['dead'], boost: ['stock', 'product'], weight: 6 },
  { id: 'low_stock', must: ['low'], boost: ['stock', 'product'], weight: 5 },
  { id: 'stock_level', must: ['stock'], boost: ['list', 'count', 'product'], weight: 4 },
  { id: 'team_performance', must: ['team'], boost: ['revenue', 'top', 'lead', 'order'], weight: 5 },
  { id: 'revenue_by_state', must: ['state'], boost: ['revenue', 'order'], weight: 5 },
  { id: 'revenue_by_product', must: ['product'], boost: ['revenue', 'top'], weight: 4 },
  { id: 'lead_summary', must: ['lead'], boost: ['count', 'list', 'status', 'top'], weight: 4 },
  { id: 'order_summary', must: ['order'], boost: ['count', 'list', 'status'], weight: 4 },
  { id: 'revenue_total', must: ['revenue'], boost: ['count'], weight: 3 },
  { id: 'customer_lookup', must: ['customer'], boost: ['list', 'top'], weight: 3 },
];

const classify = (concepts) => {
  const scored = INTENTS.map(intent => {
    const hasMust = intent.must.some(m => concepts.has(m));
    if (!hasMust) return { id: intent.id, score: 0 };
    let score = 10 + intent.weight;
    intent.boost.forEach(b => { if (concepts.has(b)) score += 4; });
    return { id: intent.id, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  return scored.length ? scored[0] : { id: 'unknown', score: 0 };
};

// ── 3. Entity extraction ────────────────────────────────────────────────────

const ORDER_STATUSES = ['pending', 'processing', 'ready for dispatch', 'shipped', 'delivered', 'cancelled', 'partially delivered'];
const LEAD_STATUSES = ['lead created', 'call', 'meeting', 'sample sent', 'negotiation', 'distributor approved', 'converted', 'lost'];

/**
 * Whole-word match — used for short, ambiguous vocabularies like statuses,
 * where a substring test would read "spending" as the status "pending".
 */
const findNamed = (raw, candidates) => {
  const hay = ` ${normalize(raw)} `;
  let best = null;
  candidates.forEach(c => {
    const n = normalize(c);
    if (!n || n.length < 3) return;
    if (hay.includes(` ${n} `) && (!best || n.length > normalize(best).length)) best = c;
  });
  return best;
};

/**
 * Typo-tolerant match for proper nouns (products, people, customers, states).
 * Exact substring wins outright; otherwise a candidate matches when enough of
 * its significant words are within edit distance of some query word.
 */
const findNamedFuzzy = (raw, candidates) => {
  const hay = normalize(raw);
  const qWords = hay.split(' ').filter(Boolean);
  let best = null, bestScore = 0;

  candidates.forEach(c => {
    const n = normalize(c);
    if (!n || n.length < 3) return;

    if (hay.includes(n)) {
      const score = 1000 + n.length;
      if (score > bestScore) { bestScore = score; best = c; }
      return;
    }

    const words = n.split(' ').filter(w => w.length >= 3);
    if (!words.length) return;
    let hits = 0;
    words.forEach(w => {
      if (qWords.includes(w)) { hits++; return; }
      if (w.length < 4) return; // short words need an exact hit
      if (qWords.some(q => q.length >= 3 && editDistance(q, w, nameBudget(w)) <= nameBudget(w))) hits++;
    });
    const ratio = hits / words.length;
    if (ratio >= 0.6) {
      const score = ratio * 100 + n.length * 0.1;
      if (score > bestScore) { bestScore = score; best = c; }
    }
  });
  return best;
};

const extractTimeframe = (raw) => {
  const t = normalize(raw);
  if (/\b(today)\b/.test(t)) return { days: 1, label: 'today' };
  if (/\b(this week|last 7|past 7|week)\b/.test(t)) return { days: 7, label: 'the last 7 days' };
  if (/\b(this month|last 30|past 30|month)\b/.test(t)) return { days: 30, label: 'the last 30 days' };
  if (/\b(quarter|last 90|past 90|3 month)\b/.test(t)) return { days: 90, label: 'the last 90 days' };
  if (/\b(year|annual|12 month)\b/.test(t)) return { days: 365, label: 'the last 12 months' };
  return null;
};

const extractEntities = (raw, data) => {
  const { orders, users, productCatalog, distributors } = data;
  const states = [...new Set(orders.map(o => o.state).filter(Boolean))];
  const products = [...new Set([...productCatalog.map(p => p.name), ...orders.map(o => o.product)].filter(Boolean))];
  const customers = [...new Set(orders.map(o => o.customerName).filter(Boolean))];

  return {
    // Proper nouns tolerate typos; statuses stay exact (they collide with
    // everyday words — "spending" would otherwise match status "pending").
    state: findNamedFuzzy(raw, states),
    product: findNamedFuzzy(raw, products),
    person: findNamedFuzzy(raw, users.map(u => u.name)),
    customer: findNamedFuzzy(raw, customers),
    distributor: findNamedFuzzy(raw, distributors.map(d => d.name)),
    orderStatus: findNamed(raw, ORDER_STATUSES),
    leadStatus: findNamed(raw, LEAD_STATUSES),
    timeframe: extractTimeframe(raw),
  };
};

// ── 4. Formatting helpers ───────────────────────────────────────────────────

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : Infinity);

const table = (rows, cols) =>
  rows.map(r => `* ${cols.map(c => c(r)).join(' — ')}`).join('\n');

const rank = (obj, n = 5) =>
  Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);

const orderLines = (orders) => {
  const lines = [];
  orders.forEach(o => {
    const date = o.date || o.createdAt;
    const items = Array.isArray(o.items) && o.items.length > 0
      ? o.items.map(i => ({ name: i.name, qty: Number(i.quantity || 0), value: Number(i.total || 0) }))
      : [{ name: o.product, qty: Number(o.quantity || 0), value: Number(o.value || 0) }];
    items.forEach(li => { if (li.name) lines.push({ ...li, date, state: o.state, assignedTo: o.assignedTo }); });
  });
  return lines;
};

// ── 5. Intent handlers ──────────────────────────────────────────────────────

const HANDLERS = {
  help: () => [
    `Here's what I can help you with:`,
    ``,
    `* **Revenue** — totals, by product, by state, by salesperson`,
    `* **Orders & Leads** — counts, status breakdowns, filters`,
    `* **Finance** — profit, expenses, unpaid invoices, receivables`,
    `* **Inventory** — stock levels, low stock, dead stock`,
    `* **Predictions** — demand forecast, distributor churn risk`,
    ``,
    `You can filter naturally, e.g. *"revenue from Gujarat last 30 days"* or *"pending orders for Rahul"*.`,
  ].join('\n'),

  revenue_total: (d, e) => {
    let rows = d.liveOrders;
    const filters = [];
    if (e.state) { rows = rows.filter(o => o.state === e.state); filters.push(e.state); }
    if (e.person) { const u = d.users.find(x => x.name === e.person); rows = rows.filter(o => o.assignedTo === u?.id); filters.push(e.person); }
    if (e.product) { rows = rows.filter(o => o.product === e.product || (o.items || []).some(i => i.name === e.product)); filters.push(e.product); }
    if (e.customer) { rows = rows.filter(o => o.customerName === e.customer); filters.push(e.customer); }
    if (e.timeframe) { rows = rows.filter(o => daysSince(o.date || o.createdAt) <= e.timeframe.days); filters.push(e.timeframe.label); }

    const total = rows.reduce((s, o) => s + Number(o.value || 0), 0);
    const scope = filters.length ? ` for **${filters.join(' · ')}**` : '';
    if (!rows.length) return `No orders found${scope}.`;
    const avg = total / rows.length;
    return [
      `**Total revenue${scope}: ${inr(total)}**`,
      ``,
      `* Orders counted: **${rows.length}**`,
      `* Average order value: **${inr(avg)}**`,
      `* Largest single order: **${inr(Math.max(...rows.map(o => Number(o.value || 0))))}**`,
    ].join('\n');
  },

  revenue_by_product: (d, e) => {
    const lines = orderLines(e.timeframe ? d.liveOrders.filter(o => daysSince(o.date || o.createdAt) <= e.timeframe.days) : d.liveOrders);
    const byProduct = {};
    const qtyByProduct = {};
    lines.forEach(l => {
      byProduct[l.name] = (byProduct[l.name] || 0) + l.value;
      qtyByProduct[l.name] = (qtyByProduct[l.name] || 0) + l.qty;
    });
    if (e.product) {
      const v = byProduct[e.product] || 0;
      return `**${e.product}**\n\n* Revenue: **${inr(v)}**\n* Units sold: **${qtyByProduct[e.product] || 0}**\n* Share of total sales: **${pct(d.totalRevenue ? (v / d.totalRevenue) * 100 : 0)}**`;
    }
    const top = rank(byProduct, 6);
    if (!top.length) return 'No product sales recorded yet.';
    const scope = e.timeframe ? ` (${e.timeframe.label})` : '';
    return `**Revenue by product${scope}**\n\n${table(top, [
      ([n]) => `**${n}**`,
      ([, v]) => inr(v),
      ([n]) => `${qtyByProduct[n]} units`,
    ])}`;
  },

  revenue_by_state: (d, e) => {
    const src = e.timeframe ? d.liveOrders.filter(o => daysSince(o.date || o.createdAt) <= e.timeframe.days) : d.liveOrders;
    const byState = {};
    src.forEach(o => { byState[o.state || 'Unknown'] = (byState[o.state || 'Unknown'] || 0) + Number(o.value || 0); });
    if (e.state) {
      const v = byState[e.state] || 0;
      const cnt = src.filter(o => o.state === e.state).length;
      return `**${e.state}**\n\n* Revenue: **${inr(v)}**\n* Orders: **${cnt}**\n* Share of national sales: **${pct(d.totalRevenue ? (v / d.totalRevenue) * 100 : 0)}**`;
    }
    const top = rank(byState, 8);
    if (!top.length) return 'No regional sales data available.';
    return `**Revenue by state**\n\n${table(top, [([n]) => `**${n}**`, ([, v]) => inr(v), ([, v]) => pct(d.totalRevenue ? (v / d.totalRevenue) * 100 : 0)])}`;
  },

  team_performance: (d, e, c) => {
    const byPerson = {};
    const leadsBy = {};
    d.liveOrders.forEach(o => {
      const n = d.users.find(u => u.id === o.assignedTo)?.name || 'Unassigned';
      byPerson[n] = (byPerson[n] || 0) + Number(o.value || 0);
    });
    d.leads.forEach(l => {
      const n = d.users.find(u => u.id === l.assignedTo)?.name || 'Unassigned';
      leadsBy[n] = (leadsBy[n] || 0) + 1;
    });
    if (e.person) {
      const u = d.users.find(x => x.name === e.person);
      const myOrders = d.liveOrders.filter(o => o.assignedTo === u?.id);
      const myLeads = d.leads.filter(l => l.assignedTo === u?.id);
      const conv = myLeads.filter(l => l.status === 'Converted').length;
      return [
        `**${e.person}** · ${u?.role || 'Team member'}`,
        ``,
        `* Revenue booked: **${inr(myOrders.reduce((s, o) => s + Number(o.value || 0), 0))}**`,
        `* Orders: **${myOrders.length}**`,
        `* Leads owned: **${myLeads.length}** (converted: **${conv}**)`,
        `* Conversion rate: **${myLeads.length ? pct((conv / myLeads.length) * 100) : '0%'}**`,
      ].join('\n');
    }
    // "who has the most leads" ranks by lead count; otherwise by revenue.
    const byLeads = c && c.has('lead') && !c.has('revenue');
    const top = rank(byLeads ? leadsBy : byPerson, 6);
    if (!top.length) return 'No team performance data yet.';
    return byLeads
      ? `**Team leaderboard — lead ownership**\n\n${table(top, [
        ([n]) => `**${n}**`,
        ([, v]) => `${v} lead${v === 1 ? '' : 's'}`,
        ([n]) => inr(byPerson[n] || 0),
      ])}`
      : `**Team performance — revenue leaderboard**\n\n${table(top, [
        ([n]) => `**${n}**`,
        ([, v]) => inr(v),
        ([n]) => `${leadsBy[n] || 0} leads`,
      ])}`;
  },

  order_summary: (d, e) => {
    let rows = d.orders;
    const filters = [];
    const statusFilter = e.orderStatus;
    if (statusFilter) { rows = rows.filter(o => (o.status || '').toLowerCase() === statusFilter); filters.push(statusFilter); }
    if (e.person) { const u = d.users.find(x => x.name === e.person); rows = rows.filter(o => o.assignedTo === u?.id); filters.push(e.person); }
    if (e.state) { rows = rows.filter(o => o.state === e.state); filters.push(e.state); }
    if (e.customer) { rows = rows.filter(o => o.customerName === e.customer); filters.push(e.customer); }
    if (e.timeframe) { rows = rows.filter(o => daysSince(o.date || o.createdAt) <= e.timeframe.days); filters.push(e.timeframe.label); }

    const scope = filters.length ? ` (${filters.join(' · ')})` : '';
    if (!rows.length) return `No orders match${scope}.`;

    if (!statusFilter && !filters.length) {
      const byStatus = {};
      d.orders.forEach(o => { byStatus[o.status || 'Unknown'] = (byStatus[o.status || 'Unknown'] || 0) + 1; });
      return [
        `**Order overview — ${d.orders.length} total**`,
        ``,
        ...Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => `* **${s}**: ${c}`),
        ``,
        `Total booked value: **${inr(d.totalRevenue)}**`,
      ].join('\n');
    }
    const shown = rows.slice(0, 10);
    return [
      `**${rows.length} order${rows.length === 1 ? '' : 's'}${scope}** · value **${inr(rows.reduce((s, o) => s + Number(o.value || 0), 0))}**`,
      ``,
      table(shown, [
        (o) => `**${o.id}**`,
        (o) => o.customerName || '—',
        (o) => `${o.product} ×${o.quantity}`,
        (o) => inr(o.value),
        (o) => o.status,
      ]),
      rows.length > shown.length ? `\n_…and ${rows.length - shown.length} more._` : '',
    ].join('\n');
  },

  lead_summary: (d, e) => {
    let rows = d.leads;
    const filters = [];
    if (e.leadStatus) { rows = rows.filter(l => (l.status || '').toLowerCase() === e.leadStatus); filters.push(e.leadStatus); }
    if (e.person) { const u = d.users.find(x => x.name === e.person); rows = rows.filter(l => l.assignedTo === u?.id); filters.push(e.person); }
    if (e.timeframe) { rows = rows.filter(l => daysSince(l.createdAt) <= e.timeframe.days); filters.push(e.timeframe.label); }

    const scope = filters.length ? ` (${filters.join(' · ')})` : '';
    if (!rows.length) return `No leads match${scope}.`;

    if (!filters.length) {
      const byStatus = {};
      d.leads.forEach(l => { byStatus[l.status || 'Unknown'] = (byStatus[l.status || 'Unknown'] || 0) + 1; });
      const pipeline = d.leads.filter(l => !['Converted', 'Lost'].includes(l.status)).reduce((s, l) => s + Number(l.dealValue || 0), 0);
      const conv = byStatus['Converted'] || 0;
      return [
        `**Lead pipeline — ${d.leads.length} total**`,
        ``,
        ...Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => `* **${s}**: ${c}`),
        ``,
        `* Open pipeline value: **${inr(pipeline)}**`,
        `* Overall conversion: **${pct(d.leads.length ? (conv / d.leads.length) * 100 : 0)}**`,
      ].join('\n');
    }
    const shown = rows.slice(0, 10);
    return [
      `**${rows.length} lead${rows.length === 1 ? '' : 's'}${scope}** · pipeline **${inr(rows.reduce((s, l) => s + Number(l.dealValue || 0), 0))}**`,
      ``,
      table(shown, [
        (l) => `**${l.name}**`,
        (l) => l.company || '—',
        (l) => l.status,
        (l) => inr(l.dealValue),
      ]),
      rows.length > shown.length ? `\n_…and ${rows.length - shown.length} more._` : '',
    ].join('\n');
  },

  profit: (d) => {
    const income = d.invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0);
    const spend = d.expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
    const net = income - spend;
    const margin = income ? (net / income) * 100 : 0;
    return [
      `**Profitability snapshot**`,
      ``,
      `* Realised income (paid invoices): **${inr(income)}**`,
      `* Total expenses: **${inr(spend)}**`,
      `* **Net profit: ${inr(net)}**`,
      `* Net margin: **${pct(margin)}**`,
      ``,
      net < 0
        ? `⚠️ Currently operating at a loss — expenses exceed realised income.`
        : `Booked (unrealised) sales stand at ${inr(d.totalRevenue)}; collecting outstanding invoices would lift realised income further.`,
    ].join('\n');
  },

  outstanding: (d, e) => {
    let due = d.invoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue');
    if (e.customer) due = due.filter(i => i.customerName === e.customer);
    const total = due.reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0);
    if (!due.length) return `✓ No outstanding invoices${e.customer ? ` for **${e.customer}**` : ''} — everything is collected.`;
    const overdue = due.filter(i => i.status === 'Overdue' || (i.dueDate && new Date(i.dueDate) < new Date()));
    return [
      `**Outstanding receivables: ${inr(total)}** across **${due.length}** invoice${due.length === 1 ? '' : 's'}`,
      overdue.length ? `⚠️ **${overdue.length}** already past due date.` : '',
      ``,
      table(due.slice(0, 10), [
        (i) => `**${i.id}**`,
        (i) => i.customerName || '—',
        (i) => inr(Number(i.amount || 0) + Number(i.tax || 0)),
        (i) => i.status,
        (i) => i.dueDate ? `due ${new Date(i.dueDate).toLocaleDateString('en-IN')}` : 'no due date',
      ]),
      due.length > 10 ? `\n_…and ${due.length - 10} more._` : '',
    ].filter(Boolean).join('\n');
  },

  invoice_list: (d, e) => {
    let rows = d.invoices;
    if (e.customer) rows = rows.filter(i => i.customerName === e.customer);
    if (!rows.length) return 'No invoices recorded yet.';
    const byStatus = {};
    rows.forEach(i => { byStatus[i.status || 'Unknown'] = (byStatus[i.status || 'Unknown'] || 0) + 1; });
    const value = rows.reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0);
    return [
      `**${rows.length} invoice${rows.length === 1 ? '' : 's'}${e.customer ? ` for ${e.customer}` : ''}** · total **${inr(value)}**`,
      ``,
      ...Object.entries(byStatus).map(([s, c]) => `* **${s}**: ${c}`),
      ``,
      table(rows.slice(0, 8), [
        (i) => `**${i.id}**`,
        (i) => i.customerName || '—',
        (i) => inr(Number(i.amount || 0) + Number(i.tax || 0)),
        (i) => i.status,
      ]),
    ].join('\n');
  },

  expense_breakdown: (d, e) => {
    let rows = d.expenses;
    if (e.timeframe) rows = rows.filter(x => daysSince(x.date) <= e.timeframe.days);
    if (!rows.length) return 'No expenses recorded for that period.';
    const byCat = {};
    rows.forEach(x => { byCat[x.category || 'Uncategorised'] = (byCat[x.category || 'Uncategorised'] || 0) + Number(x.amount || 0); });
    const total = rows.reduce((s, x) => s + Number(x.amount || 0), 0);
    const scope = e.timeframe ? ` (${e.timeframe.label})` : '';
    return [
      `**Total expenses${scope}: ${inr(total)}** across ${rows.length} entries`,
      ``,
      table(rank(byCat, 8), [
        ([c]) => `**${c}**`,
        ([, v]) => inr(v),
        ([, v]) => pct(total ? (v / total) * 100 : 0),
      ]),
    ].join('\n');
  },

  stock_level: (d, e) => {
    const byProduct = {};
    d.inventory.forEach(i => {
      if (!byProduct[i.product]) byProduct[i.product] = { qty: 0, reserved: 0, value: 0 };
      byProduct[i.product].qty += Number(i.quantity || 0);
      byProduct[i.product].reserved += Number(i.reserved || 0);
      byProduct[i.product].value += Number(i.quantity || 0) * Number(i.unitCost || 0);
    });
    if (e.product) {
      const s = byProduct[e.product];
      if (!s) return `**${e.product}** has no inventory records.`;
      return `**${e.product}**\n\n* On hand: **${s.qty}** units\n* Reserved: **${s.reserved}**\n* Available to sell: **${Math.max(0, s.qty - s.reserved)}**\n* Stock value: **${inr(s.value)}**`;
    }
    const entries = Object.entries(byProduct).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    if (!entries.length) return 'No inventory records found.';
    const totalVal = Object.values(byProduct).reduce((s, v) => s + v.value, 0);
    return [
      `**Inventory overview** · ${Object.keys(byProduct).length} products · total value **${inr(totalVal)}**`,
      ``,
      table(entries, [
        ([n]) => `**${n}**`,
        ([, v]) => `${v.qty} units`,
        ([, v]) => `${Math.max(0, v.qty - v.reserved)} available`,
      ]),
    ].join('\n');
  },

  low_stock: (d) => {
    const avail = {};
    d.inventory.forEach(i => { avail[i.product] = (avail[i.product] || 0) + Math.max(0, Number(i.quantity || 0) - Number(i.reserved || 0)); });
    const sold30 = {};
    orderLines(d.liveOrders).forEach(l => { if (daysSince(l.date) <= 30) sold30[l.name] = (sold30[l.name] || 0) + l.qty; });

    const risky = d.productCatalog.map(p => {
      const a = avail[p.name] || 0;
      const velocity = (sold30[p.name] || 0) / 30;
      const daysLeft = velocity > 0 ? Math.round(a / velocity) : (a === 0 ? 0 : null);
      return { name: p.name, avail: a, velocity, daysLeft };
    }).filter(p => p.daysLeft !== null && p.daysLeft <= 21).sort((a, b) => a.daysLeft - b.daysLeft);

    if (!risky.length) return '✓ No products are at risk of stocking out in the next 21 days.';
    return [
      `⚠️ **${risky.length} product${risky.length === 1 ? '' : 's'} at stock-out risk** (within 21 days at current sales velocity)`,
      ``,
      table(risky.slice(0, 8), [
        (p) => `**${p.name}**`,
        (p) => `${p.avail} available`,
        (p) => `${p.velocity.toFixed(1)}/day`,
        (p) => p.daysLeft === 0 ? '**OUT OF STOCK**' : `~**${p.daysLeft} days** left`,
      ]),
      ``,
      `Recommend raising purchase orders for the top items now.`,
    ].join('\n');
  },

  dead_stock: (d) => {
    const sold60 = {};
    orderLines(d.liveOrders).forEach(l => { if (daysSince(l.date) <= 60) sold60[l.name] = (sold60[l.name] || 0) + l.qty; });
    const byProduct = {};
    d.inventory.forEach(i => {
      if (!byProduct[i.product]) byProduct[i.product] = { qty: 0, value: 0 };
      byProduct[i.product].qty += Number(i.quantity || 0);
      byProduct[i.product].value += Number(i.quantity || 0) * Number(i.unitCost || 0);
    });
    const dead = Object.entries(byProduct)
      .filter(([n, v]) => v.qty > 0 && !(sold60[n] > 0))
      .sort((a, b) => b[1].value - a[1].value);

    if (!dead.length) return '✓ All stock has moved in the last 60 days — no dead inventory.';
    const locked = dead.reduce((s, [, v]) => s + v.value, 0);
    return [
      `**${dead.length} slow/dead product${dead.length === 1 ? '' : 's'}** — no sales in 60 days · **${inr(locked)}** of capital locked up`,
      ``,
      table(dead.slice(0, 8), [
        ([n]) => `**${n}**`,
        ([, v]) => `${v.qty} units`,
        ([, v]) => inr(v.value),
      ]),
      ``,
      `Recommend clearance schemes or redistribution to higher-demand territories.`,
    ].join('\n');
  },

  forecast: (d, e) => {
    const now = new Date();
    const mk = (dt) => `${dt.getFullYear()}-${dt.getMonth()}`;
    const last3 = [0, 1, 2].map(m => mk(new Date(now.getFullYear(), now.getMonth() - m, 1)));
    const prev3 = [3, 4, 5].map(m => mk(new Date(now.getFullYear(), now.getMonth() - m, 1)));
    const byProduct = {};
    orderLines(d.liveOrders).forEach(l => {
      const k = mk(new Date(l.date));
      if (!byProduct[l.name]) byProduct[l.name] = { recent: 0, prior: 0 };
      if (last3.includes(k)) byProduct[l.name].recent += l.qty;
      else if (prev3.includes(k)) byProduct[l.name].prior += l.qty;
    });
    const rows = Object.entries(byProduct).map(([name, v]) => {
      const projected = Math.round(v.recent / 3);
      const ra = v.recent / 3, pa = v.prior / 3;
      const trend = pa > 0 ? Math.round(((ra - pa) / pa) * 100) : (ra > 0 ? 100 : 0);
      return { name, projected, trend };
    }).filter(r => r.projected > 0).sort((a, b) => b.projected - a.projected);

    if (!rows.length) return 'Not enough sales history yet to build a forecast. I need at least a few months of orders.';
    if (e.product) {
      const r = rows.find(x => x.name === e.product);
      if (!r) return `**${e.product}** has no recent sales to forecast from.`;
      return `**${e.product} — next-month forecast**\n\n* Projected demand: **~${r.projected} units**\n* Trend vs prior quarter: **${r.trend >= 0 ? '+' : ''}${r.trend}%**\n\n_Method: 3-month moving average of actual dispatch volume._`;
    }
    return [
      `**Next-month demand forecast** _(3-month moving average)_`,
      ``,
      table(rows.slice(0, 8), [
        (r) => `**${r.name}**`,
        (r) => `~${r.projected} units`,
        (r) => `${r.trend >= 0 ? '📈 +' : '📉 '}${r.trend}% trend`,
      ]),
    ].join('\n');
  },

  churn: (d, e) => {
    const active = d.distributors.filter(x => x.status === 'Active');
    const scored = active.map(dist => {
      const his = d.liveOrders.filter(o => o.distributorId === dist.id)
        .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
      const recency = his.length ? daysSince(his[0].date || his[0].createdAt) : Infinity;
      const last60 = his.filter(o => daysSince(o.date || o.createdAt) <= 60).length;
      const prior60 = his.filter(o => { const g = daysSince(o.date || o.createdAt); return g > 60 && g <= 120; }).length;
      const declining = prior60 > 0 && last60 < prior60;
      let risk = 'Low', score = 20;
      if (recency === Infinity || recency > 60) { risk = 'High'; score = 90; }
      else if (recency > 30 || declining) { risk = 'Medium'; score = 55; }
      return { name: dist.name, recency, risk, score, orders: his.length, declining };
    }).sort((a, b) => b.score - a.score);

    if (!scored.length) return 'No active distributors to assess for churn risk.';
    if (e.distributor) {
      const r = scored.find(x => x.name === e.distributor);
      if (!r) return `**${e.distributor}** is not an active distributor.`;
      return `**${r.name} — churn risk: ${r.risk}**\n\n* Lifetime orders: **${r.orders}**\n* Last ordered: **${r.recency === Infinity ? 'never' : `${r.recency} days ago`}**\n* Order trend: **${r.declining ? 'declining' : 'stable'}**`;
    }
    const high = scored.filter(x => x.risk === 'High');
    return [
      `**Distributor churn risk** — ${high.length} high · ${scored.filter(x => x.risk === 'Medium').length} medium · ${scored.filter(x => x.risk === 'Low').length} low`,
      ``,
      table(scored.slice(0, 8), [
        (r) => `**${r.name}**`,
        (r) => `${r.risk} risk`,
        (r) => r.recency === Infinity ? 'never ordered' : `last order ${r.recency}d ago`,
      ]),
      high.length ? `\n⚠️ Prioritise re-engagement calls for the ${high.length} high-risk account${high.length === 1 ? '' : 's'}.` : '',
    ].filter(Boolean).join('\n');
  },

  customer_lookup: (d, e) => {
    if (e.customer) {
      const his = d.liveOrders.filter(o => o.customerName === e.customer);
      const inv = d.invoices.filter(i => i.customerName === e.customer);
      const dueAmt = inv.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0);
      return [
        `**${e.customer}**`,
        ``,
        `* Total orders: **${his.length}**`,
        `* Lifetime value: **${inr(his.reduce((s, o) => s + Number(o.value || 0), 0))}**`,
        `* Outstanding: **${inr(dueAmt)}**`,
        `* Last order: **${his.length ? `${daysSince(his[0].date || his[0].createdAt)} days ago` : 'never'}**`,
      ].join('\n');
    }
    const byCustomer = {};
    d.liveOrders.forEach(o => { byCustomer[o.customerName || 'Unknown'] = (byCustomer[o.customerName || 'Unknown'] || 0) + Number(o.value || 0); });
    const top = rank(byCustomer, 8);
    if (!top.length) return 'No customer data available yet.';
    return `**Top customers by lifetime value**\n\n${table(top, [([n]) => `**${n}**`, ([, v]) => inr(v)])}`;
  },
};

// ── 6. Fallback ─────────────────────────────────────────────────────────────

// When no intent matched but the question names a known record, answer about
// that record rather than giving up — "tell me about Shree Traders" still works.
const ENTITY_ROUTES = [
  ['customer', 'customer_lookup'],
  ['distributor', 'churn'],
  ['person', 'team_performance'],
  ['product', 'stock_level'],
  ['state', 'revenue_by_state'],
];

const resolveByEntity = (entities) => {
  for (const [key, intent] of ENTITY_ROUTES) {
    if (entities[key]) return intent;
  }
  return null;
};

const fallback = (d, concepts) => {
  const hints = [];
  if (concepts.size) hints.push(`I picked up on: _${[...concepts].slice(0, 6).join(', ')}_ — but couldn't map that to a specific report.`);
  return [
    `I couldn't confidently answer that one.`,
    ...(hints.length ? ['', ...hints] : []),
    ``,
    `Here's a quick snapshot instead:`,
    `* Revenue: **${inr(d.totalRevenue)}** across **${d.liveOrders.length}** orders`,
    `* Open leads: **${d.leads.filter(l => !['Converted', 'Lost'].includes(l.status)).length}**`,
    `* Outstanding: **${inr(d.invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0))}**`,
    ``,
    `Try asking about **revenue**, **orders**, **leads**, **profit**, **stock**, **forecast**, or **churn risk** — or type *help*.`,
  ].join('\n');
};

// ── 7. Public API ───────────────────────────────────────────────────────────

// ── 6b. Dialogue state ──────────────────────────────────────────────────────

// Phrases that signal the question continues the previous one rather than
// starting fresh: "revenue by state" → "what about Gujarat?"
const FOLLOWUP_PHRASE = /^(what|how)\s+about\b|^and\b|^also\b|^same\s+(for|in)\b|^just\b|^only\b|^now\b|^ok(ay)?\b|^then\b/i;
const REFERENTIAL = /\b(it|its|that|this|them|they|their|there|those|him|her|his|the\s+same)\b/i;

const hasEntity = (e) => Object.values(e).some(Boolean);

/** Decide whether this turn should inherit the previous turn's intent. */
const isFollowUp = (question, entities, matched, prior) => {
  if (!prior || !prior.intent) return false;
  if (FOLLOWUP_PHRASE.test(question.trim())) return true;
  // No intent of its own, but it names something concrete or points back.
  if (!matched && (hasEntity(entities) || REFERENTIAL.test(question))) return true;
  return false;
};

/**
 * Answer a natural-language question against live PRISMORA data.
 *
 * @param question  raw user text
 * @param raw       live data slices from DataContext/AuthContext
 * @param prior     previous turn's { intent, entities } for follow-up resolution
 *
 * Returns { text, intent, confidence, entities, corrections, followUp, context }
 * — metadata is surfaced in the UI so the reasoning stays inspectable.
 */
export function askPrism(question, raw, prior = null) {
  const orders = raw.orders || [];
  const data = {
    orders,
    liveOrders: orders.filter(o => o.status !== 'Cancelled'),
    leads: raw.leads || [],
    users: raw.users || [],
    invoices: raw.invoices || [],
    expenses: raw.expenses || [],
    inventory: raw.inventory || [],
    productCatalog: raw.productCatalog || [],
    distributors: raw.distributors || [],
  };
  data.totalRevenue = data.liveOrders.reduce((s, o) => s + Number(o.value || 0), 0);

  const tokens = tokenize(question);
  const { concepts, corrections } = conceptize(tokens);
  let entities = extractEntities(question, data);
  let { id: intent, score } = classify(concepts);
  let followUp = false;

  // Carry the previous turn forward when this one is a continuation. Newly
  // named entities override the remembered ones; the rest are inherited.
  if (isFollowUp(question, entities, !!HANDLERS[intent], prior)) {
    const fresh = Object.fromEntries(Object.entries(entities).filter(([, v]) => v));
    entities = { ...prior.entities, ...fresh };
    if (!HANDLERS[intent]) { intent = prior.intent; score = Math.max(score, 13); }
    followUp = true;
  }

  // Still nothing, but the question names a known record — answer about it.
  if (!HANDLERS[intent]) {
    const routed = resolveByEntity(entities);
    if (routed) { intent = routed; score = 14; }
  }

  const handler = HANDLERS[intent];
  const text = handler ? handler(data, entities, concepts) : fallback(data, concepts);
  const kept = Object.fromEntries(Object.entries(entities).filter(([, v]) => v));

  return {
    text,
    intent: handler ? intent : 'unknown',
    confidence: handler ? Math.min(99, Math.round((score / 22) * 100)) : 0,
    entities: kept,
    corrections,
    followUp,
    // Passed back on the next call so the conversation keeps its thread.
    context: handler ? { intent, entities: kept } : prior,
  };
}

export const PRISM_CAPABILITIES = Object.keys(HANDLERS);

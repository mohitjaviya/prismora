// Fix batch 6 (migration 070), each check as a real signed-in role.
import { writeFileSync } from 'node:fs';
import { as } from './rest-as.mjs';

const tag = String(Date.now()).slice(-6);
const out = [];
const rec = (id, pass, detail) => { out.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const msg = (r) => (r.body && (r.body.message || r.body.hint)) || JSON.stringify(r.body);
const post = (who, t, row) => who(t, { method: 'POST', body: JSON.stringify([row]) });
const smMove = (id, status) => SM('rpc/sales_move_order', { method: 'POST', body: JSON.stringify({ p_order_id: id, p_status: status }) });
const patch = (who, t, q, row) => who(`${t}?${q}`, { method: 'PATCH', body: JSON.stringify(row) });

const ADMIN = await as('ADMIN'), SM = await as('SALES_MANAGER'), WH = await as('WAREHOUSE'),
      DISP = await as('DISPATCH'), PD = await as('P2E_DIST'), DL = await as('DEALER'), AC = await as('ACCOUNTS');

const incs = async (orderId) => (await ADMIN(`distributor_incentives?select=*&orderId=eq.${orderId}`)).body;
const line = (name, q, u) => ({ name, quantity: q, unitPrice: u, total: q * u, gstPct: 18 });

// ── 1. F02: a partner's own order earns the incentive ───────────────────
console.log('\n# 1. Incentives from the database');
const neem = 'TEST Neem Face Wash 100ml', shamp = 'TEST Herbal Shampoo 200ml';
const mk = (items, extra = {}) => ({ customerName: `TEST P2E Distributor 35167`, companyName: 'TEST P2E Distributor 35167', items, product: items[0].name, quantity: items.reduce((s, i) => s + i.quantity, 0), value: items.reduce((s, i) => s + i.total, 0), state: 'Gujarat', city: 'Vadodara', status: 'Pending', ...extra });

const o1 = await post(PD, 'orders', mk([line(neem, 10, 1)]));
const o1id = o1.body?.[0]?.id;
rec('1a partner (P2E Distributor) can place an order', o1.status === 201 && !!o1id, `${o1.status} ${o1id || msg(o1)}`);
const i1 = await incs(o1id);
const o1v = o1.body?.[0]?.value;
rec('1b the order earned the P2F scheme incentive (partner could not write it before)', i1.length === 1 && i1[0].status === 'Earned' && i1[0].incentiveType === 'Discount' && Number(i1[0].incentiveValue) === Math.round(o1v * 0.05) && i1[0].distributorId === o1.body[0].distributorId, `order value ${o1v}; incentive ${JSON.stringify(i1.map(i => [i.schemeId, i.incentiveType, i.incentiveValue, i.status]))}`);
const seen = await PD(`distributor_incentives?select=id&orderId=eq.${o1id}`);
rec('1c the partner can read its own incentive', seen.body?.length === 1, `${seen.status} rows=${seen.body?.length}`);
const w = await post(PD, 'distributor_incentives', { id: `TEST-FORGE-${tag}`, distributorId: o1.body?.[0]?.distributorId, schemeId: 'SCH-1790706947005', orderId: o1id, incentiveType: 'Cash', incentiveValue: 99999, status: 'Earned' });
rec('1d the partner still cannot write incentives itself', w.status >= 400, `${w.status} ${msg(w).slice(0, 80)}`);

const o2 = await post(PD, 'orders', mk([line(shamp, 20, 1)]));
rec('1e order with no targeted product earns nothing', o2.status === 201 && (await incs(o2.body[0].id)).length === 0, `${o2.body?.[0]?.id}: ${(await incs(o2.body?.[0]?.id)).length} incentives`);
const o3 = await post(PD, 'orders', mk([line(neem, 1, 1)]));
rec('1f targeted line below the scheme minimum earns nothing', o3.status === 201 && (await incs(o3.body[0].id)).length === 0, `${o3.body?.[0]?.id} value ${o3.body?.[0]?.value}: ${(await incs(o3.body?.[0]?.id)).length} incentives`);
const o4 = await post(DL, 'orders', { customerName: 'TEST Dealer', items: [line(neem, 10, 1)], product: neem, quantity: 10, value: 10, status: 'Pending' });
rec('1g a Dealer order does not earn a Distributor-only scheme', o4.status === 201 && (await incs(o4.body[0].id)).length === 0, `${o4.body?.[0]?.id}: ${(await incs(o4.body?.[0]?.id)).length} incentives`);
const o5 = await post(ADMIN, 'orders', { ...mk([line(neem, 10, 110)]), distributorId: o1.body?.[0]?.distributorId, customerName: `TEST staff-placed ${tag}` });
const i5 = await incs(o5.body?.[0]?.id);
rec('1h a staff-placed order for the same partner earns it too (same rule both ways)', o5.status === 201 && i5.length === 1 && Number(i5[0].incentiveValue) === Math.round(1100 * 0.05), `${o5.body?.[0]?.id} ${JSON.stringify(i5.map(i => i.incentiveValue))}`);
const dupe = await ADMIN('rpc/earn_incentives_for_order', { method: 'POST', body: JSON.stringify({ o: o5.body?.[0] }) });
rec('1i the earn function is not callable by users', dupe.status >= 400, `${dupe.status}`);
const all5 = await incs(o5.body?.[0]?.id);
rec('1j still exactly one incentive per order+scheme', all5.length === 1, `${all5.length}`);

// ── lead + parent order helpers ─────────────────────────────────────────
const mkLead = async (n) => {
  const r = await post(ADMIN, 'leads', { name: `TEST Person ${tag}-${n}`, company: `TEST Company ${tag}-${n}`, phone: '9000000099', status: 'New', leadSource: 'Website' });
  return r.body?.[0]?.id ? r.body[0] : (console.log('lead insert:', r.status, msg(r)), null);
};
const L1 = await mkLead(1), L2 = await mkLead(2);
const base = (leadId, extra = {}) => ({ customerName: `TEST Person ${tag}`, companyName: `TEST Company ${tag}`, items: [line(neem, 4, 100)], product: neem, quantity: 4, value: 400, state: 'Gujarat', city: 'Vadodara', deliveryAddress: 'TEST addr', deliveryPincode: '390001', status: 'Pending', ...(leadId ? { leadId } : {}), ...extra });

// ── 2. Backorder invoice billed to the parent's company ─────────────────
console.log('\n# 2. Backorder invoice');
const P = await post(ADMIN, 'orders', base(L1?.id));
const Pid = P.body?.[0]?.id;
rec('2a parent order from a lead (with company) created', P.status === 201 && !!L1?.id && P.body?.[0]?.leadId === L1.id, `${Pid} lead ${L1?.id}`);
const toProcessing = await smMove(Pid, 'Processing');
rec('2b Sales Manager sends the parent to Processing (sales_move_order)', toProcessing.status < 300, `${toProcessing.status} ${msg(toProcessing).slice(0, 80)}`);
const B = await post(ADMIN, 'orders', base(null, { items: [line(neem, 2, 100)], quantity: 2, value: 200, status: 'Processing', splitFromOrderId: Pid, customerName: `TEST Person ${tag}`, companyName: `TEST Company ${tag}` }));
const Bid = B.body?.[0]?.id;
rec('2c backorder created with no lead of its own', B.status === 201 && B.body?.[0]?.leadId == null && B.body?.[0]?.splitFromOrderId === Pid, `${Bid} leadId=${B.body?.[0]?.leadId}`);
const s1 = await patch(WH, 'orders', `id=eq.${Bid}`, { status: 'Ready for Dispatch' });
const s2 = await patch(DISP, 'orders', `id=eq.${Bid}`, { status: 'Shipped' });
const s3 = await patch(DISP, 'orders', `id=eq.${Bid}`, { status: 'Delivered' });
rec('2d Warehouse → Dispatch → Dispatch deliver the backorder', s1.status === 200 && s2.status === 200 && s3.status === 200, `${s1.status}/${s2.status}/${s3.status} ${[s1, s2, s3].filter(x => x.status !== 200).map(msg).join(' | ')}`);
const invB = (await ADMIN(`invoices?select=*&orderId=eq.${Bid}`)).body?.[0];
rec('2e the backorder invoice is billed to the PARENT\'S COMPANY, the person is the contact', invB?.customerName === `TEST Company ${tag}` && invB?.contactName === `TEST Person ${tag}`, `billed="${invB?.customerName}" contact="${invB?.contactName}"`);

// A backorder whose parent had no lead is still billed to the person.
const P0 = await post(ADMIN, 'orders', base(null, { customerName: `TEST NoLead ${tag}`, companyName: `TEST NoLead Co ${tag}` }));
await smMove(P0.body[0].id, 'Processing');
const B0 = await post(ADMIN, 'orders', base(null, { customerName: `TEST NoLead ${tag}`, companyName: `TEST NoLead Co ${tag}`, items: [line(neem, 1, 100)], quantity: 1, value: 100, status: 'Processing', splitFromOrderId: P0.body[0].id }));
await patch(WH, 'orders', `id=eq.${B0.body[0].id}`, { status: 'Ready for Dispatch' });
await patch(DISP, 'orders', `id=eq.${B0.body[0].id}`, { status: 'Shipped' });
await patch(DISP, 'orders', `id=eq.${B0.body[0].id}`, { status: 'Delivered' });
const inv0 = (await ADMIN(`invoices?select=*&orderId=eq.${B0.body[0].id}`)).body?.[0];
rec('2f a backorder of a parent with no lead is billed to the person, as before', inv0?.customerName === `TEST NoLead ${tag}` && inv0?.contactName == null, `billed="${inv0?.customerName}" contact="${inv0?.contactName}"`);

// ── 3. One order per lead, also on UPDATE ───────────────────────────────
console.log('\n# 3. One order per lead on update');
const X = await post(ADMIN, 'orders', base(null, { customerName: `TEST Other ${tag}` }));
const Xid = X.body?.[0]?.id;
const clash = await patch(ADMIN, 'orders', `id=eq.${Xid}`, { leadId: L1?.id });
rec('3a pointing another order at an already-converted lead is refused (Admin)', clash.status >= 400 && /already been converted/.test(msg(clash)), `${clash.status} ${msg(clash).slice(0, 110)}`);
const clash2 = await patch(SM, 'orders', `id=eq.${Xid}`, { leadId: L1?.id });
const smCanEdit = clash2.status === 200 && Array.isArray(clash2.body) && clash2.body.length > 0;
rec('3b …and for Sales Manager (cannot move a lead onto it either: refused or no access)', (clash2.status >= 400 && /already been converted/.test(msg(clash2))) || (clash2.status === 200 && !smCanEdit), `${clash2.status} ${msg(clash2).slice(0, 110)}`);
const stillNull = (await ADMIN(`orders?select=leadId&id=eq.${Xid}`)).body?.[0]?.leadId;
rec('3c the refused order still has no lead in the database', stillNull == null, `leadId=${stillNull}`);
const fine = await patch(ADMIN, 'orders', `id=eq.${Xid}`, { leadId: L2?.id });
rec('3d pointing it at a free lead works', fine.status === 200 && !!L2?.id && fine.body?.[0]?.leadId === L2.id, `${fine.status} ${msg(fine).slice(0, 80)}`);
const same = await patch(ADMIN, 'orders', `id=eq.${Pid}`, { city: 'Surat' });
rec('3e editing the lead-holding order without changing its lead is unaffected', same.status === 200 && same.body?.[0]?.city === 'Surat', `${same.status} ${msg(same).slice(0, 80)}`);
const dupe2 = await post(ADMIN, 'orders', base(L1?.id, { customerName: `TEST Dup ${tag}` }));
rec('3f the original insert rule (066) still holds', dupe2.status >= 400 && /already been converted/.test(msg(dupe2)), `${dupe2.status} ${msg(dupe2).slice(0, 80)}`);

// ── 4. No cancelling a parent while its backorder is open ───────────────
console.log('\n# 4. Parent with an open backorder');
const Q = await post(ADMIN, 'orders', base(null, { customerName: `TEST Parent ${tag}`, companyName: null }));
const Qid = Q.body?.[0]?.id;
await patch(ADMIN, 'orders', `id=eq.${Qid}`, { status: 'Processing' });
const QB = await post(ADMIN, 'orders', base(null, { customerName: `TEST Parent ${tag}`, companyName: null, items: [line(neem, 1, 100)], quantity: 1, value: 100, status: 'Processing', splitFromOrderId: Qid }));
const QBid = QB.body?.[0]?.id;
const QP = await post(ADMIN, 'orders', base(null, { customerName: `TEST PendParent ${tag}`, companyName: null }));
const Qpend = QP.body?.[0]?.id;
const QPB = await post(ADMIN, 'orders', base(null, { customerName: `TEST PendParent ${tag}`, companyName: null, items: [line(neem, 1, 100)], quantity: 1, value: 100, status: 'Processing', splitFromOrderId: Qpend }));
rec('4a parent + open backorder set up', !!Qid && !!QBid, `${Qid} ← ${QBid}`);
const c1 = await smMove(Qpend, 'Cancelled');
rec('4b Sales Manager (sales_move_order) cannot cancel a Pending parent whose backorder is open', c1.status >= 400 && /open backorder/.test(msg(c1)), `${c1.status} ${msg(c1).slice(0, 120)}`);
const c2 = await patch(ADMIN, 'orders', `id=eq.${Qid}`, { status: 'Cancelled' });
rec('4c …nor Admin', c2.status >= 400 && /open backorder/.test(msg(c2)), `${c2.status} ${msg(c2).slice(0, 120)}`);
const d1 = await ADMIN(`orders?id=eq.${Qid}`, { method: 'DELETE' });
rec('4d …nor delete it', d1.status >= 400 && /open backorder/.test(msg(d1)), `${d1.status} ${msg(d1).slice(0, 120)}`);
const still = (await ADMIN(`orders?select=status&id=eq.${Qid}`)).body?.[0]?.status;
rec('4e parent still Processing in the database', still === 'Processing', still);
const c3 = await patch(ADMIN, 'orders', `id=eq.${QBid}`, { status: 'Cancelled' });
rec('4f cancelling the backorder first is allowed', c3.status === 200 && c3.body?.[0]?.status === 'Cancelled', `${c3.status} ${msg(c3).slice(0, 80)}`);
const c4 = await patch(ADMIN, 'orders', `id=eq.${Qid}`, { status: 'Cancelled' });
const c4b = await smMove(Qpend, 'Cancelled');
rec('4g2 …and the Pending parent once its own backorder is cancelled via the owner role', c4b.status >= 400, `${c4b.status} (still has an open backorder ${QPB.body?.[0]?.id})`);
rec('4g now the parent can be cancelled', c4.status === 200 && c4.body?.[0]?.status === 'Cancelled', `${c4.status} ${msg(c4).slice(0, 80)}`);
// a delivered backorder (done in 2) does not keep its parent alive either
const c5 = await patch(ADMIN, 'orders', `id=eq.${Pid}`, { status: 'Cancelled' });
rec('4h a parent whose backorder is Delivered can be cancelled', c5.status === 200 && c5.body?.[0]?.status === 'Cancelled', `${c5.status} ${msg(c5).slice(0, 80)}`);

// ── 5. Books still agree ────────────────────────────────────────────────
console.log('\n# 5. Balances');
const drift = await AC('rpc/partner_balance_drift', { method: 'POST', body: '{}' });
rec('5a partner balances still match (Accounts)', drift.status === 200 && drift.body.length === 0, JSON.stringify(drift.body).slice(0, 150));

writeFileSync('D:/PRISMORA/test-results/full-test/fix-batch-6/api.json', JSON.stringify({ tag, out, ids: { o1id, Pid, Bid, Xid, Qid, QBid, L1: L1?.id, L2: L2?.id } }, null, 1));
console.log(`\n${out.filter(x => x.pass).length}/${out.length} passed; tag ${tag}`);

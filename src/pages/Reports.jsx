import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { territoryName } from '../utils/territory';
import { useAuth, isSalesRole } from '../context/AuthContext';
import { BarChart3, Download, TrendingUp, Package2, Wallet, Users, Star, ChevronRight } from 'lucide-react';
import { Button, PageHeader } from '../components/ui';
import { downloadCSV } from '../utils/exportUtils';
import { isConvertedLead } from '../utils/leadStatus';
import { amountPaid, amountDue, invoiceTotal } from '../utils/invoiceStatus';
import { profitAndLoss, salesCreditNotes, openTaxInvoices } from '../utils/financials';
import { taxInvoices, registerRow, gstHsnSummary } from '../utils/gstReport';
import { orderLines } from '../utils/billing';
import { needsReorder } from '../utils/expiry';

// Paise shown where there are any (₹30.50, not ₹31), so a column on screen
// adds up to the same total as its CSV (H15).
const formatCurrency = (val) => {
  const v = Math.round((Number(val) || 0) * 100) / 100;
  const paiseDigits = Number.isInteger(v) ? 0 : 2;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paiseDigits, maximumFractionDigits: paiseDigits }).format(v);
};

const paise = (n) => Math.round((Number(n) || 0) * 100) / 100;

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

// ── Category definitions ────────────────────────────────────────
const CATEGORIES = [
  { key: 'sales',     label: 'Sales',           icon: TrendingUp, color: 'text-brand-accent',   bg: 'bg-brand-accent/10' },
  { key: 'inventory', label: 'Inventory',        icon: Package2,   color: 'text-blue-400',        bg: 'bg-blue-500/10' },
  { key: 'financial', label: 'Financial',        icon: Wallet,     color: 'text-emerald-400',     bg: 'bg-emerald-500/10' },
  { key: 'crm',       label: 'CRM',              icon: Users,      color: 'text-purple-400',      bg: 'bg-purple-500/10' },
  { key: 'team',      label: 'Team Performance', icon: Star,       color: 'text-amber-400',       bg: 'bg-amber-500/10' },
];

export default function Reports() {
  const { leads, orders, invoices, expenses, inventory, distributors, complaints, schemes, productCatalog, territories, companySettings, creditNotes, grn, purchaseReturns } = useData();
  // Seller details, only for an invoice from before they were stored on it.
  const gstSeller = useMemo(() => companySettings || {}, [companySettings]);
  const { user, users: teamUsers } = useAuth();

  const [activeCategory, setActiveCategory] = useState('sales');
  const [activeReport, setActiveReport] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Helper: date range filter
  const inRange = (dateStr) => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(dateStr);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  };

  // ── Report Definitions ───────────────────────────────────────
  const reports = useMemo(() => ({
    sales: [
      {
        key: 'sales_summary',
        label: 'Sales Summary',
        desc: 'Value of orders booked by month (not cancelled), order count and average order. Booked, not invoiced: net sales are in Financial → P&L.',
        generate: () => {
          const byMonth = {};
          orders.filter(o => o.status !== 'Cancelled' && inRange(o.date || o.createdAt)).forEach(o => {
            const m = new Date(o.date || o.createdAt).toLocaleString('default', { month: 'short', year: 'numeric' });
            if (!byMonth[m]) byMonth[m] = { month: m, revenue: 0, orders: 0 };
            byMonth[m].revenue += (o.value || 0);
            byMonth[m].orders += 1;
          });
          return Object.values(byMonth).map(r => ({ ...r, avgOrder: r.orders ? r.revenue / r.orders : 0 }));
        },
        columns: ['month', 'revenue', 'orders', 'avgOrder'],
        labels: ['Month', 'Order Value (₹)', 'Orders', 'Avg Order (₹)'],
      },
      {
        key: 'product_sales',
        label: 'Sales by Product',
        desc: 'Order value and quantity booked per product.',
        generate: () => {
          const byProduct = {};
          // By the order's own lines: a multi-item order used to count as one
          // product named "X +2 more items" (H10).
          orders.filter(o => o.status !== 'Cancelled' && inRange(o.date || o.createdAt)).forEach(o => {
            orderLines(o).forEach(line => {
              const key = line.name || 'Unknown';
              if (!byProduct[key]) byProduct[key] = { product: key, revenue: 0, qty: 0 };
              byProduct[key].revenue += line.amount;
              byProduct[key].qty += line.quantity;
            });
          });
          return Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);
        },
        columns: ['product', 'revenue', 'qty'],
        labels: ['Product', 'Order Value (₹)', 'Qty Sold'],
      },
      {
        key: 'city_sales',
        label: 'Sales by City / Territory',
        desc: 'Order value booked by city.',
        generate: () => {
          const byCity = {};
          orders.filter(o => o.status !== 'Cancelled' && inRange(o.date || o.createdAt)).forEach(o => {
            const key = o.city || 'Unknown';
            if (!byCity[key]) byCity[key] = { city: key, revenue: 0, orders: 0 };
            byCity[key].revenue += (o.value || 0);
            byCity[key].orders += 1;
          });
          return Object.values(byCity).sort((a, b) => b.revenue - a.revenue);
        },
        columns: ['city', 'revenue', 'orders'],
        labels: ['City', 'Order Value (₹)', 'Orders'],
      },
      {
        key: 'order_status',
        label: 'Order Status Report',
        desc: 'All orders with their current status.',
        generate: () => orders.filter(o => inRange(o.date || o.createdAt)).map(o => ({
          id: o.id, customer: o.customerName, city: o.city, product: o.product,
          qty: o.quantity, value: o.value, status: o.status, date: formatDate(o.date)
        })),
        columns: ['id', 'customer', 'city', 'product', 'qty', 'value', 'status', 'date'],
        labels: ['ID', 'Customer', 'City', 'Product', 'Qty', 'Value (₹)', 'Status', 'Date'],
      },
    ],
    inventory: [
      {
        key: 'stock_summary',
        label: 'Stock Summary',
        desc: 'Current stock levels per product and batch.',
        generate: () => inventory.map(i => ({
          product: i.product, batch: i.batchNumber, warehouse: i.warehouse,
          qty: i.quantity, reserved: i.reserved, transit: i.transit, damaged: i.damaged,
          reorderLevel: i.reorderLevel, expiry: formatDate(i.expiryDate),
          value: (i.quantity || 0) * (i.unitCost || 0)
        })),
        columns: ['product', 'batch', 'warehouse', 'qty', 'reserved', 'transit', 'damaged', 'reorderLevel', 'expiry', 'value'],
        labels: ['Product', 'Batch', 'Warehouse', 'Qty', 'Reserved', 'Transit', 'Damaged', 'Reorder At', 'Expiry', 'Value (₹)'],
      },
      {
        key: 'low_stock',
        label: 'Low Stock / Reorder Report',
        desc: 'Items at or below reorder level.',
        // The Inventory screen's rule (needsReorder): an expired batch is not
        // stock to reorder against — it is on the Expiry report (H12).
        generate: () => inventory.filter(needsReorder).map(i => ({
          product: i.product, batch: i.batchNumber, warehouse: i.warehouse,
          qty: i.quantity, reorderLevel: i.reorderLevel, deficit: i.reorderLevel - i.quantity
        })).sort((a, b) => a.qty - b.qty),
        columns: ['product', 'batch', 'warehouse', 'qty', 'reorderLevel', 'deficit'],
        labels: ['Product', 'Batch', 'Warehouse', 'Current Qty', 'Reorder Level', 'Deficit'],
      },
      {
        key: 'expiry_report',
        label: 'Expiry Report',
        desc: 'Batches expiring within the next 90 days.',
        generate: () => inventory
          .filter(i => i.expiryDate)
          .map(i => {
            const daysLeft = Math.ceil((new Date(i.expiryDate) - new Date()) / 86400000);
            return { product: i.product, batch: i.batchNumber, expiry: formatDate(i.expiryDate), daysLeft, qty: i.quantity, warehouse: i.warehouse };
          })
          .filter(i => i.daysLeft <= 90)
          .sort((a, b) => a.daysLeft - b.daysLeft),
        columns: ['product', 'batch', 'expiry', 'daysLeft', 'qty', 'warehouse'],
        labels: ['Product', 'Batch', 'Expiry Date', 'Days Left', 'Qty', 'Warehouse'],
      },
    ],
    financial: [
      {
        key: 'invoice_report',
        label: 'Invoice Register',
        desc: 'Tax invoices with the CGST / SGST / IGST each was issued with. Proformas are not tax invoices and are left out.',
        generate: () => taxInvoices(invoices).filter(i => inRange(i.createdAt)).map(i => {
          const r = registerRow(i, gstSeller);
          const dist = distributors?.find(d => d.name?.toLowerCase() === i.customerName?.toLowerCase());
          const gstinVal = dist?.gstin || i.customerGSTIN || '—';
          return {
            id: i.id, customer: i.customerName, gstin: gstinVal, placeOfSupply: r.placeOfSupply,
            subtotal: r.subtotal, cgst: r.cgst, sgst: r.sgst, igst: r.igst, total: r.total,
            status: i.status, date: formatDate(i.createdAt)
          };
        }),
        columns: ['id', 'customer', 'gstin', 'placeOfSupply', 'subtotal', 'cgst', 'sgst', 'igst', 'total', 'status', 'date'],
        labels: ['Invoice ID', 'Customer', 'GSTIN', 'Place of Supply', 'Subtotal (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total (₹)', 'Status', 'Date'],
      },
      {
        key: 'outstanding_receivables',
        label: 'Outstanding Receivables',
        desc: 'Tax invoices not yet settled, with what is still due after part-payments and credit notes.',
        // What is still due, as Accounting shows it: part-payments and credit
        // notes taken off; proformas are not receivables.
        generate: () => openTaxInvoices(invoices)
          .map(i => ({
            id: i.id, customer: i.customerName,
            total: invoiceTotal(i), paid: amountPaid(i), due: amountDue(i),
            status: i.status, date: formatDate(i.createdAt)
          })),
        columns: ['id', 'customer', 'total', 'paid', 'due', 'status', 'date'],
        labels: ['Invoice ID', 'Customer', 'Invoice Total (₹)', 'Received (₹)', 'Due (₹)', 'Status', 'Date'],
      },
      {
        key: 'expense_report',
        label: 'Expense Report',
        desc: 'All expenses by category.',
        generate: () => {
          const byCat = {};
          expenses.filter(e => inRange(e.date)).forEach(e => {
            if (!byCat[e.category]) byCat[e.category] = { category: e.category, total: 0, count: 0 };
            byCat[e.category].total += (e.amount || 0);
            byCat[e.category].count += 1;
          });
          return Object.values(byCat).sort((a, b) => b.total - a.total);
        },
        columns: ['category', 'total', 'count'],
        labels: ['Category', 'Total (₹)', 'Transactions'],
      },
      {
        key: 'pl_report',
        label: 'P&L Summary',
        desc: 'Net sales less expenses and goods bought — the Accounting figures. GST and proformas are not sales.',
        // Accounting's definition (utils/financials.js). It used to be
        // everything paid, GST and proformas included, less expenses only.
        generate: () => {
          const r = profitAndLoss({
            invoices: invoices.filter(i => inRange(i.createdAt)),
            creditNotes: salesCreditNotes(creditNotes, invoices).filter(cn => inRange(cn.createdAt)),
            expenses: expenses.filter(e => inRange(e.date)),
            grn: grn.filter(g => inRange(g.receivedDate || g.createdAt)),
            purchaseReturns: purchaseReturns.filter(pr => inRange(pr.date || pr.createdAt)),
          });
          return [
            { metric: 'Invoiced and Paid (ex-GST)', value: paise(r.invoicedPaid) },
            { metric: 'Less Credit Notes (ex-GST)', value: -paise(r.creditNoteValue) },
            { metric: 'Net Sales', value: paise(r.netSales) },
            { metric: 'Expenses', value: paise(r.expenses) },
            { metric: 'Cost of Goods Purchased', value: paise(r.purchaseCost) },
            { metric: 'Net Profit', value: paise(r.netProfit) },
            { metric: 'Profit Margin %', value: r.margin.toFixed(2) + '%' },
            { metric: 'GST to Remit, net of credit notes (not income)', value: paise(r.gstCollected) },
          ];
        },
        columns: ['metric', 'value'],
        labels: ['Metric', 'Value (₹)'],
      },
      {
        key: 'gst_summary',
        label: 'GST / HSN Summary (GSTR-1)',
        desc: 'Tax invoices by HSN code and GST rate, with the CGST / SGST / IGST each invoice was issued with. Proformas are left out.',
        generate: () => gstHsnSummary(
          invoices.filter(i => inRange(i.createdAt)),
          { orders, productCatalog, seller: gstSeller }
        ),
        columns: ['hsn', 'rate', 'taxable', 'cgst', 'sgst', 'igst', 'total'],
        labels: ['HSN Code', 'GST Rate', 'Taxable Value (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total (₹)'],
      },
      {
        key: 'tds_summary',
        label: 'TDS Estimate Report',
        desc: 'Estimated TDS deductible on applicable expense categories at standard rates.',
        generate: () => {
          // Standard TDS rates by expense nature (indicative)
          const TDS = { 'Rent': { sec: '194-I', rate: 10 }, 'Salaries': { sec: '192', rate: 10 }, 'Marketing': { sec: '194-C', rate: 2 }, 'Logistics': { sec: '194-C', rate: 2 } };
          const byCat = {};
          expenses.filter(e => inRange(e.date)).forEach(e => {
            const t = TDS[e.category];
            if (!t) return;
            if (!byCat[e.category]) byCat[e.category] = { category: e.category, section: t.sec, rate: `${t.rate}%`, base: 0, tds: 0 };
            byCat[e.category].base += Number(e.amount || 0);
            byCat[e.category].tds += Number(e.amount || 0) * (t.rate / 100);
          });
          return Object.values(byCat).map(r => ({ ...r, base: Math.round(r.base), tds: Math.round(r.tds) })).sort((a, b) => b.tds - a.tds);
        },
        columns: ['category', 'section', 'rate', 'base', 'tds'],
        labels: ['Expense Category', 'TDS Section', 'Rate', 'Base Amount (₹)', 'TDS Deductible (₹)'],
      },
    ],
    crm: [
      {
        key: 'lead_summary',
        label: 'Lead Pipeline Summary',
        desc: 'Leads by status and conversion funnel.',
        generate: () => {
          const byStatus = {};
          leads.filter(l => inRange(l.createdAt)).forEach(l => {
            if (!byStatus[l.status]) byStatus[l.status] = { status: l.status, count: 0, value: 0 };
            byStatus[l.status].count += 1;
            byStatus[l.status].value += (l.dealValue || 0);
          });
          return Object.values(byStatus);
        },
        columns: ['status', 'count', 'value'],
        labels: ['Status', 'Count', 'Deal Value (₹)'],
      },
      {
        key: 'lead_source',
        label: 'Lead Source Report',
        desc: 'Which channels are generating the most leads.',
        generate: () => {
          const bySource = {};
          leads.forEach(l => {
            const src = l.leadSource || 'Unknown';
            if (!bySource[src]) bySource[src] = { source: src, count: 0, converted: 0 };
            bySource[src].count += 1;
            if (isConvertedLead(l)) bySource[src].converted += 1;
          });
          return Object.values(bySource).map(s => ({ ...s, convRate: s.count ? ((s.converted / s.count) * 100).toFixed(1) + '%' : '0%' })).sort((a, b) => b.count - a.count);
        },
        columns: ['source', 'count', 'converted', 'convRate'],
        labels: ['Lead Source', 'Total Leads', 'Converted', 'Conv. Rate'],
      },
      {
        key: 'complaint_report',
        label: 'Complaint Analysis',
        desc: 'Complaints by type and resolution status.',
        generate: () => {
          const byType = {};
          complaints.forEach(c => {
            if (!byType[c.complaintType]) byType[c.complaintType] = { type: c.complaintType, total: 0, resolved: 0, open: 0 };
            byType[c.complaintType].total += 1;
            if (c.status === 'Resolved' || c.status === 'Closed') byType[c.complaintType].resolved += 1;
            else byType[c.complaintType].open += 1;
          });
          return Object.values(byType).sort((a, b) => b.total - a.total);
        },
        columns: ['type', 'total', 'resolved', 'open'],
        labels: ['Complaint Type', 'Total', 'Resolved', 'Open'],
      },
    ],
    team: [
      {
        key: 'sales_exec_report',
        label: 'Sales Executive Performance',
        desc: 'Order value booked, leads and conversion per salesperson.',
        generate: () => {
          return (teamUsers || []).filter(u => isSalesRole(u.role) || u.role === 'Sales Manager' || u.role === 'Manager').map(u => {
            const userOrders = orders.filter(o => o.assignedTo === u.id && o.status !== 'Cancelled' && inRange(o.date || o.createdAt));
            const userLeads = leads.filter(l => l.assignedTo === u.id && inRange(l.createdAt));
            const converted = userLeads.filter(isConvertedLead).length;
            return {
              name: u.name, role: u.role,
              revenue: userOrders.reduce((s, o) => s + (o.value || 0), 0),
              orders: userOrders.length,
              leads: userLeads.length,
              converted,
              convRate: userLeads.length ? ((converted / userLeads.length) * 100).toFixed(1) + '%' : '0%',
            };
          }).sort((a, b) => b.revenue - a.revenue);
        },
        columns: ['name', 'role', 'revenue', 'orders', 'leads', 'converted', 'convRate'],
        labels: ['Name', 'Role', 'Order Value (₹)', 'Orders', 'Leads', 'Converted', 'Conv. Rate'],
      },
      {
        key: 'distributor_report',
        label: 'Distributor Outstanding Report',
        desc: 'Outstanding amounts per distributor.',
        generate: () => distributors.map(d => ({
          name: d.name, territory: territoryName(territories, d), state: d.state,
          outstanding: d.outstandingAmount || 0, creditLimit: d.creditLimit || 0,
          utilization: d.creditLimit ? ((d.outstandingAmount || 0) / d.creditLimit * 100).toFixed(1) + '%' : 'N/A',
          status: d.status
        })).sort((a, b) => b.outstanding - a.outstanding),
        columns: ['name', 'territory', 'state', 'outstanding', 'creditLimit', 'utilization', 'status'],
        labels: ['Distributor', 'Territory', 'State', 'Outstanding (₹)', 'Credit Limit (₹)', 'Utilization', 'Status'],
      },
      {
        key: 'scheme_usage',
        label: 'Active Schemes Report',
        desc: 'All currently active schemes with details.',
        generate: () => schemes.filter(s => s.status === 'Active').map(s => ({
          name: s.name, type: s.type, applicableTo: s.applicableTo,
          discount: s.discountPct ? s.discountPct + '%' : '—',
          freeGoods: s.freeGoodsQty || 0,
          minOrder: s.minOrderValue || 0,
          validFrom: formatDate(s.validFrom), validTo: formatDate(s.validTo)
        })),
        columns: ['name', 'type', 'applicableTo', 'discount', 'freeGoods', 'minOrder', 'validFrom', 'validTo'],
        labels: ['Scheme', 'Type', 'Applicable To', 'Discount', 'Free Goods', 'Min Order', 'Valid From', 'Valid To'],
      },
    ],
  }), [leads, orders, invoices, expenses, inventory, distributors, complaints, schemes, productCatalog, territories, teamUsers, dateFrom, dateTo, gstSeller, creditNotes, grn, purchaseReturns]);

  const currentReports = reports[activeCategory] || [];
  const activeReportDef = currentReports.find(r => r.key === activeReport);
  const reportData = useMemo(() => {
    if (!activeReportDef) return [];
    return activeReportDef.generate();
  }, [activeReportDef, leads, orders, invoices, expenses, inventory, distributors, complaints, schemes, territories, teamUsers, dateFrom, dateTo]);

  const handleExport = () => {
    if (!activeReportDef || !reportData.length) return;
    const exportData = reportData.map(row => {
      const obj = {};
      activeReportDef.columns.forEach((col, i) => { obj[activeReportDef.labels[i]] = row[col]; });
      return obj;
    });
    downloadCSV(exportData, `PRISMORA_${activeReportDef.label.replace(/\s+/g, '_')}`);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
            <PageHeader
        icon={BarChart3}
        title="Reports Hub"
        subtitle="20+ business reports across sales, inventory, financials, CRM, and team performance."
        actions={activeReport && reportData.length > 0 && (
          <Button variant="primary" icon={Download} onClick={handleExport}>Export CSV</Button>
        )}
      />

      {/* Date Range Filter */}
      <div className="glass-panel rounded-2xl p-4 border border-white/5 flex flex-col sm:flex-row gap-3 items-center">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Date Range:</span>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActiveReport(null); }} className="glass-input rounded-xl px-4 py-2 text-sm text-white" />
        <span className="text-slate-500">→</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActiveReport(null); }} className="glass-input rounded-xl px-4 py-2 text-sm text-white" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setActiveReport(null); }} className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg bg-brand-primary-lighter/50 transition-colors">Clear Filter</button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Category + Report Selector */}
        <div className="space-y-2">
          {CATEGORIES.map(cat => (
            <div key={cat.key}>
              <button
                onClick={() => { setActiveCategory(cat.key); setActiveReport(null); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${activeCategory === cat.key ? 'border-brand-accent/50 bg-brand-accent/10' : 'border-white/5 bg-brand-primary-lighter/20 hover:bg-brand-primary-lighter/40'}`}>
                <div className={`p-2 rounded-lg ${cat.bg}`}><cat.icon size={16} className={cat.color} /></div>
                <span className={`font-semibold text-sm ${activeCategory === cat.key ? 'text-brand-accent' : 'text-slate-300'}`}>{cat.label}</span>
                <ChevronRight size={14} className={`ml-auto ${activeCategory === cat.key ? 'text-brand-accent' : 'text-slate-600'}`} />
              </button>

              {/* Report sub-list */}
              {activeCategory === cat.key && (
                <div className="mt-1 space-y-1 pl-2">
                  {(reports[cat.key] || []).map(r => (
                    <button key={r.key}
                      onClick={() => setActiveReport(r.key)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all border ${activeReport === r.key ? 'border-brand-accent/40 bg-brand-accent/10 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-white hover:bg-brand-primary-lighter/40'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: Report Output */}
        <div className="lg:col-span-3">
          {!activeReport ? (
            <div className="glass-panel rounded-2xl border border-white/5 p-16 text-center text-slate-500 h-full flex flex-col items-center justify-center">
              <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-semibold text-slate-400">Select a report to generate</p>
              <p className="text-sm mt-1">Choose a category from the left, then pick a report.</p>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-white">{activeReportDef?.label}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{activeReportDef?.desc}</p>
                </div>
                <span className="text-xs text-slate-500 bg-brand-primary-lighter/30 px-3 py-1 rounded-full border border-white/5">{reportData.length} records</span>
              </div>

              {reportData.length === 0 ? (
                <div className="p-16 text-center text-slate-500">No data available for this report.</div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        {activeReportDef?.labels.map((label, i) => (
                          <th key={i} className="p-4 whitespace-nowrap">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {reportData.slice(0, 100).map((row, ri) => (
                        <tr key={ri} className="hover:bg-brand-primary-lighter/20 transition-colors">
                          {activeReportDef?.columns.map((col, ci) => {
                            const val = row[col];
                            const isNum = typeof val === 'number';
                            const label = activeReportDef.labels[ci];
                            const isCurrency = label.includes('(₹)');
                            return (
                              <td key={ci} className={`p-4 ${ci === 0 ? 'font-semibold text-white' : ''} ${isNum ? 'text-right' : ''}`}>
                                {isCurrency && isNum ? formatCurrency(val) : val ?? '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {reportData.length > 100 && (
                        <tr>
                          <td colSpan={activeReportDef?.columns.length} className="p-4 text-center text-slate-500 text-xs italic">
                            Showing first 100 rows. Export CSV for the full report.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole } from '../context/AuthContext';
import { BarChart3, Download, Search, TrendingUp, Package2, Wallet, Users, Star, ChevronRight } from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

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
  const { leads, orders, invoices, expenses, inventory, distributors, complaints, schemes, productCatalog } = useData();
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
        desc: 'Monthly revenue, orders count, and average order value.',
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
        labels: ['Month', 'Revenue (₹)', 'Orders', 'Avg Order (₹)'],
      },
      {
        key: 'product_sales',
        label: 'Sales by Product',
        desc: 'Revenue and quantity sold per product.',
        generate: () => {
          const byProduct = {};
          orders.filter(o => o.status !== 'Cancelled' && inRange(o.date || o.createdAt)).forEach(o => {
            const key = o.product || 'Unknown';
            if (!byProduct[key]) byProduct[key] = { product: key, revenue: 0, qty: 0 };
            byProduct[key].revenue += (o.value || 0);
            byProduct[key].qty += (o.quantity || 0);
          });
          return Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);
        },
        columns: ['product', 'revenue', 'qty'],
        labels: ['Product', 'Revenue (₹)', 'Qty Sold'],
      },
      {
        key: 'city_sales',
        label: 'Sales by City / Territory',
        desc: 'Revenue breakdown by city.',
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
        labels: ['City', 'Revenue (₹)', 'Orders'],
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
        generate: () => inventory.filter(i => i.quantity <= i.reorderLevel).map(i => ({
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
        desc: 'All GST invoices with status and amounts.',
        generate: () => invoices.filter(i => inRange(i.createdAt)).map(i => {
          const subtotalVal = Number(i.amount || 0);
          const taxVal = Number(i.tax || 0);
          const totalVal = subtotalVal + taxVal;
          const cgstVal = taxVal / 2;
          const sgstVal = taxVal / 2;
          const dist = distributors?.find(d => d.name?.toLowerCase() === i.customerName?.toLowerCase());
          const gstinVal = dist?.gstin || i.customerGSTIN || '—';
          return {
            id: i.id, customer: i.customerName, gstin: gstinVal,
            subtotal: subtotalVal, cgst: cgstVal, sgst: sgstVal, total: totalVal,
            status: i.status, date: formatDate(i.createdAt)
          };
        }),
        columns: ['id', 'customer', 'gstin', 'subtotal', 'cgst', 'sgst', 'total', 'status', 'date'],
        labels: ['Invoice ID', 'Customer', 'GSTIN', 'Subtotal (₹)', 'CGST (₹)', 'SGST (₹)', 'Total (₹)', 'Status', 'Date'],
      },
      {
        key: 'outstanding_receivables',
        label: 'Outstanding Receivables',
        desc: 'Unpaid invoices (Sent / Unpaid status).',
        generate: () => invoices
          .filter(i => i.status === 'Sent' || i.status === 'Unpaid' || i.status === 'Overdue' || i.status === 'Pending')
          .map(i => {
            const subtotalVal = Number(i.amount || 0);
            const taxVal = Number(i.tax || 0);
            return { id: i.id, customer: i.customerName, total: subtotalVal + taxVal, status: i.status, date: formatDate(i.createdAt) };
          }),
        columns: ['id', 'customer', 'total', 'status', 'date'],
        labels: ['Invoice ID', 'Customer', 'Amount (₹)', 'Status', 'Date'],
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
        desc: 'Revenue vs. expenses summary.',
        generate: () => {
          const revenue = invoices.filter(i => i.status === 'Paid' && inRange(i.createdAt)).reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0);
          const exp = expenses.filter(e => inRange(e.date)).reduce((s, e) => s + (e.amount || 0), 0);
          return [
            { metric: 'Total Revenue (Paid Invoices)', value: revenue },
            { metric: 'Total Expenses', value: exp },
            { metric: 'Gross Profit', value: revenue - exp },
            { metric: 'Profit Margin %', value: revenue ? ((revenue - exp) / revenue * 100).toFixed(2) + '%' : '0%' },
          ];
        },
        columns: ['metric', 'value'],
        labels: ['Metric', 'Value (₹)'],
      },
      {
        key: 'gst_summary',
        label: 'GST / HSN Summary (GSTR-1)',
        desc: 'Tax collected grouped by HSN code and GST rate, with CGST/SGST/IGST split.',
        generate: () => {
          const byHsn = {};
          invoices.filter(i => inRange(i.createdAt)).forEach(inv => {
            const order = orders.find(o => o.id === inv.orderId);
            const prod = order ? productCatalog.find(p => p.name === order.product) : null;
            const hsn = prod?.hsnCode || '30049011';
            const rate = prod?.gstPct ?? (Number(inv.amount) ? Math.round((Number(inv.tax || 0) / Number(inv.amount)) * 100) : 0);
            const key = `${hsn}-${rate}`;
            const taxable = Number(inv.amount || 0);
            const tax = Number(inv.tax || 0);
            const intrastate = (order?.state || 'Gujarat').toLowerCase() === 'gujarat';
            if (!byHsn[key]) byHsn[key] = { hsn, rate: `${rate}%`, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
            byHsn[key].taxable += taxable;
            byHsn[key].cgst += intrastate ? tax / 2 : 0;
            byHsn[key].sgst += intrastate ? tax / 2 : 0;
            byHsn[key].igst += intrastate ? 0 : tax;
            byHsn[key].total += taxable + tax;
          });
          return Object.values(byHsn).map(r => ({
            ...r,
            taxable: Math.round(r.taxable), cgst: Math.round(r.cgst), sgst: Math.round(r.sgst), igst: Math.round(r.igst), total: Math.round(r.total)
          })).sort((a, b) => b.total - a.total);
        },
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
            if (l.status === 'Converted') bySource[src].converted += 1;
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
        desc: 'Revenue, leads, and conversion per salesperson.',
        generate: () => {
          return (teamUsers || []).filter(u => isSalesRole(u.role) || u.role === 'Sales Manager' || u.role === 'Manager').map(u => {
            const userOrders = orders.filter(o => o.assignedTo === u.id && o.status !== 'Cancelled' && inRange(o.date || o.createdAt));
            const userLeads = leads.filter(l => l.assignedTo === u.id && inRange(l.createdAt));
            const converted = userLeads.filter(l => l.status === 'Converted').length;
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
        labels: ['Name', 'Role', 'Revenue (₹)', 'Orders', 'Leads', 'Converted', 'Conv. Rate'],
      },
      {
        key: 'distributor_report',
        label: 'Distributor Outstanding Report',
        desc: 'Outstanding amounts per distributor.',
        generate: () => distributors.map(d => ({
          name: d.name, territory: d.territory, state: d.state,
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
  }), [leads, orders, invoices, expenses, inventory, distributors, complaints, schemes, productCatalog, teamUsers, dateFrom, dateTo]);

  const currentReports = reports[activeCategory] || [];
  const activeReportDef = currentReports.find(r => r.key === activeReport);
  const reportData = useMemo(() => {
    if (!activeReportDef) return [];
    return activeReportDef.generate();
  }, [activeReportDef, leads, orders, invoices, expenses, inventory, distributors, complaints, schemes, teamUsers, dateFrom, dateTo]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 size={24} className="text-brand-accent" /> Reports Hub
          </h1>
          <p className="text-slate-400 text-sm mt-1">20+ business reports across sales, inventory, financials, CRM, and team performance.</p>
        </div>
        {activeReport && reportData.length > 0 && (
          <button onClick={handleExport} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
            <Download size={16} /> Export CSV
          </button>
        )}
      </div>

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

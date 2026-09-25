import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { attributionFor } from '../utils/attribution';
import { Navigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Wallet, TrendingUp, Plus, Trash2, FileText, Clock, AlertCircle, Check, X, CreditCard, DollarSign, Printer, Mail, MessageSquare, ShoppingBag, AlertTriangle, Undo2 } from 'lucide-react';
import { useToast, useConfirm } from '../context/DialogContext';
import { Button, Card, IconButton, PageHeader } from '../components/ui';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { CHART_TOOLTIP, CHART_GRID, CHART_AXIS, colorAt } from '../utils/chartTheme';
import { MONTHS, monthKey } from '../utils/months';
import { unbookedPayouts, unbookedTotal } from '../utils/payouts';
import { sendWhatsAppAlert, sendEmailAlert } from '../utils/notificationUtils';
import { gstForOrder, productsMissingGst, isProforma } from '../utils/billing';
import InvoicesTable from '../components/accounting/InvoicesTable';
import ExpensesTable from '../components/accounting/ExpensesTable';
import CreditNotesTable from '../components/accounting/CreditNotesTable';


const Accounting = () => {
  const { user, users, canAccessData, canAccess } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
   const {
    orders: rawOrders, invoices: rawInvoices, expenses: rawExpenses, leads, productCatalog, distributors,
    distributorIncentives, schemeClaims, sfaExpenses, reconcilePayouts,
    addInvoice, convertInvoice, updateInvoiceStatus, deleteInvoice,
    addExpense, deleteExpense, creditNotes, addCreditNote, deleteCreditNote,
    grn, vendors, purchaseReturns
  } = useData();


  // Filter orders, invoices, and expenses based on user role (RBAC)
  const orders = useMemo(() => {
    return rawOrders.filter(o => canAccessData(o.assignedTo));
  }, [rawOrders, canAccessData]);

  const invoices = useMemo(() => {
    return rawInvoices.filter(inv => {
      if (canAccessData(inv.assignedTo)) return true;
      const order = rawOrders.find(o => o.id === inv.orderId);
      return order && canAccessData(order.assignedTo);
    });
  }, [rawInvoices, rawOrders, canAccessData]);

  const expenses = useMemo(() => {
    return rawExpenses.filter(exp => canAccessData(exp.assignedTo));
  }, [rawExpenses, canAccessData]);

  // State variables - non-Admins start on 'invoices' tab since overview is Admin-only
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [activeTab, setActiveTab] = useState(canAccess('accounting', 'full') ? 'overview' : 'invoices'); // 'overview' | 'invoices' | 'expenses'
  const [invoiceFilter, setInvoiceFilter] = useState('All'); // 'All' | 'Paid' | 'Unpaid' | 'Overdue'
  
  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditForm, setCreditForm] = useState({ customerName: '', invoiceId: '', amount: '', reason: 'Sales Return' });

  // Form states
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  // Some bills go out with GST and some without — a sample, a replacement, or a
  // buyer outside GST. The choice belongs on the invoice, not in the code.
  const [invoiceWithTax, setInvoiceWithTax] = useState(true);
  // A custom invoice has no product to take a rate from, so the rate is
  // chosen. It used to default to 18% without asking.
  const [customGstPct, setCustomGstPct] = useState('');
  const [invoiceError, setInvoiceError] = useState('');
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [convertingId, setConvertingId] = useState(null);

  const [expenseCategory, setExpenseCategory] = useState('Raw Materials');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Financial Calculations
  const totalIncome = invoices
    .filter(inv => inv.status === 'Paid')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

  const totalTax = invoices
    .filter(inv => inv.status === 'Paid')
    .reduce((sum, inv) => sum + Number(inv.tax || 0), 0);

  // GST collected is not the business's money. It is held on behalf of the
  // government and paid over, so it belongs on neither the revenue line nor
  // the profit line. It is still shown, because it has to be remitted and
  // knowing how much is owed matters -- it just is not earnings.
  const gstCollected = totalTax;

  // A credit note is a sales return: goods came back or a bill was reduced, so
  // the income it cancels was never earned. It reduced the partner's balance
  // and nothing else, which left profit overstated by every note ever issued.
  const creditNoteValue = (creditNotes || []).reduce((sum, cn) => sum + (Number(cn?.amount) || 0), 0);

  const netSales = totalIncome - creditNoteValue;
  const totalRevenue = netSales;

  const totalExpensesValue = expenses
    .reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  // ── Cost of the goods themselves ────────────────────────────────────────
  // Nothing from the purchase side reached this screen: net profit was income
  // minus operating expenses, with the entire cost of buying stock left out. A
  // business that had bought Rs.2,75,000 of goods and sold none of it still
  // showed a profit. Goods received is the point the cost is incurred — a PO is
  // only an intention, so Draft and Cancelled orders are rightly not counted.
  // Plain reductions rather than useMemo: this component returns early when
  // there is no user, so every hook after that point is a conditional hook —
  // the count would change between renders and React would throw. These are
  // sums over a handful of rows and cost nothing to redo.
  const goodsReceivedValue = (grn || []).reduce((sum, g) =>
    sum + (g.items || []).reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitCost || 0)), 0), 0);

  // Goods sent back are a cost we no longer carry.
  const purchaseReturnsValue = (purchaseReturns || []).reduce((sum, r) => sum + Number(r.value || 0), 0);

  const purchaseCost = Math.max(0, goodsReceivedValue - purchaseReturnsValue);

  // What is still owed to vendors — the mirror of outstanding receivables,
  // which this screen already showed on its own.
  const vendorPayables = (vendors || []).reduce((sum, v) => sum + Number(v.outstandingAmount || 0), 0);

  // Money that has already gone out but never reached this screen: incentives
  // marked Paid, claims marked Settled and field expenses marked Approved all
  // used to change a status and nothing else. They are booked as they happen
  // now, but anything paid before that was wired up is still missing, and no
  // amount of correct behaviour from here on would find it.
  const missingPayouts = unbookedPayouts({
    expenses,
    incentives: distributorIncentives,
    claims: schemeClaims,
    fieldExpenses: sfaExpenses,
  });
  const missingPayoutValue = unbookedTotal(missingPayouts);

  const netProfit = totalRevenue - totalExpensesValue - purchaseCost;
  const profitMargin = totalRevenue ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

  const unpaidInvoices = invoices.filter(inv => inv.status === 'Unpaid' || inv.status === 'Overdue');
  const outstandingAmount = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0) + Number(inv.tax || 0), 0);

  /**
   * What the Generate Invoice form will charge, worked out the way the
   * database will: an order line by line at each product's catalogue rate
   * (the same gstForOrder the rest of the app uses), a custom invoice at the
   * rate chosen for it. A product with no rate is named, and the invoice is
   * refused — it used to be taxed at a flat 18%.
   */
  const invoicePreview = useMemo(() => {
    if (selectedOrderId) {
      const order = orders.find(o => o.id === selectedOrderId);
      if (!order) return { base: 0, tax: 0, missing: [], rateLabel: '' };
      const missing = invoiceWithTax ? productsMissingGst(order, productCatalog) : [];
      const tax = invoiceWithTax && missing.length === 0 ? gstForOrder(order, productCatalog) : 0;
      const lines = Array.isArray(order.items) && order.items.length > 0 ? order.items.map(i => i.name) : [order.product];
      const rates = [...new Set(lines
        .map(name => productCatalog.find(p => p.name === name)?.gstPct)
        .filter(r => r !== undefined && r !== null && r !== '')
        .map(Number))].sort((a, b) => a - b);
      const rateLabel = rates.length === 1 ? `${rates[0]}%` : rates.length > 1 ? `${rates.join('% + ')}%, line by line` : '';
      return { base: Number(order.value || 0), tax, missing, rateLabel };
    }
    const base = Number(customAmount || 0);
    const pct = customGstPct === '' ? null : Number(customGstPct);
    const tax = invoiceWithTax && pct !== null ? Math.round(base * pct / 100) : 0;
    return { base, tax, missing: [], rateLabel: pct === null ? '' : `${pct}%`, needsRate: invoiceWithTax && pct === null };
  }, [selectedOrderId, orders, productCatalog, invoiceWithTax, customAmount, customGstPct]);

  const proformaCount = invoices.filter(isProforma).length;

  // Route Guard: anyone logged in can access, the view is filtered dynamically.
  //
  // It sits below every hook rather than above them. React requires the same
  // hooks to run in the same order on every render, and this guard used to
  // return before all twenty of them — so the moment `user` went from set to
  // null (a sign-out, an expired session) the hook count changed and React
  // threw instead of redirecting. canAccess and canAccessData both return
  // false without a user, so the hooks above are safe to run first.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Helper for formatting Currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Helper for dates
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getOrderForInvoice = (invoice) => {
    if (!invoice || !invoice.orderId) return null;
    return orders.find(o => o.id === invoice.orderId);
  };

  const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return ''; 
    let str = '';
    str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only' : 'Only';
    return "Rupees " + str.replace(/\s+/g, ' ').trim();
  };

  // Get trend data (grouped by month)
  const getMonthlyTrendData = () => {
    const data = {};
    
    // Default initial empty states
    MONTHS.forEach(m => {
      data[m] = { month: m, Income: 0, Expenses: 0 };
    });

    invoices.forEach(inv => {
      if (inv.status === 'Paid' && inv.createdAt) {
        const m = monthKey(inv.createdAt);
        if (data[m]) {
          data[m].Income += Number(inv.amount || 0) + Number(inv.tax || 0);
        }
      }
    });

    expenses.forEach(exp => {
      if (exp.date) {
        const m = monthKey(exp.date);
        if (data[m]) {
          data[m].Expenses += Number(exp.amount || 0);
        }
      }
    });

    // Only display months with active income or expenses
    const activeMonths = MONTHS.map(m => data[m]).filter(d => d.Income > 0 || d.Expenses > 0);
    return activeMonths.length > 0 ? activeMonths : MONTHS.map(m => data[m]);
  };

  // Get expense categories data
  const getExpenseCategoriesData = () => {
    const categories = {};
    expenses.forEach(exp => {
      categories[exp.category] = (categories[exp.category] || 0) + Number(exp.amount || 0);
    });
    return Object.keys(categories).map(cat => ({
      name: cat,
      value: categories[cat]
    }));
  };

  // Invoice generation filter (orders that do not have invoices yet)
  const uninvoicedOrders = orders.filter(order => 
    order.status !== 'Cancelled' && 
    !invoices.some(inv => inv.orderId === order.id)
  );

  // The database raises the invoice and charges the partner together
  // (create_invoice, 039). Nothing is shown or charged until it says the
  // invoice is saved; a refusal keeps the form open with the reason.
  const handleGenerateInvoiceSubmit = async (e) => {
    e.preventDefault();
    if (isSavingInvoice) return;
    setInvoiceError('');

    if (invoicePreview.missing.length > 0) {
      setInvoiceError(`No GST rate in the catalogue for ${invoicePreview.missing.join(', ')}. Set it under Product Catalogue, or bill without GST.`);
      return;
    }
    if (!selectedOrderId) {
      const amount = Number(customAmount);
      if (!customCustomerName.trim() || !Number.isFinite(amount) || amount <= 0) {
        setInvoiceError('Enter the customer name and an amount above zero.');
        return;
      }
      if (invoicePreview.needsRate) {
        setInvoiceError('Choose the GST rate for this invoice.');
        return;
      }
    }

    setIsSavingInvoice(true);
    try {
      const result = await addInvoice({
        orderId: selectedOrderId || null,
        customerName: selectedOrderId ? null : customCustomerName.trim(),
        amount: selectedOrderId ? null : Number(customAmount),
        withTax: invoiceWithTax,
        gstPct: selectedOrderId || !invoiceWithTax ? null : Number(customGstPct),
        dueDate: invoiceDueDate ? new Date(invoiceDueDate).toISOString() : null,
      });
      if (!result.ok) {
        setInvoiceError(result.error);
        return;
      }
      toast(`Invoice ${result.id} raised.`, 'success');
      setSelectedOrderId('');
      setCustomCustomerName('');
      setCustomAmount('');
      setCustomGstPct('');
      setInvoiceDueDate('');
      setInvoiceWithTax(true);
      setIsInvoiceModalOpen(false);
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleConvert = async (inv) => {
    if (!await confirm({
      title: `Convert ${inv.id} to a GST tax invoice?`,
      body: 'GST is added line by line at each product\'s rate stored on the proforma, and the partner is charged it. The same invoice is updated; this cannot be undone here.',
      confirmLabel: 'Convert',
    })) return;
    setConvertingId(inv.id);
    try {
      const result = await convertInvoice(inv.id);
      if (!result.ok) toast(result.error, 'error');
      else toast(`${inv.id} is now a GST tax invoice (GST ₹${Number(result.tax || 0).toLocaleString('en-IN')}).`, 'success');
    } finally {
      setConvertingId(null);
    }
  };

  // Handles adding an expense
  const handleAddExpenseSubmit = (e) => {
    e.preventDefault();
    const amount = Number(expenseAmount);
    
    if (isNaN(amount) || amount <= 0) {
      toast("Please enter a valid amount.", 'error');
      return;
    }

    addExpense({
      category: expenseCategory,
      amount,
      description: expenseDescription,
      date: new Date(expenseDate).toISOString(),
      assignedTo: user.id
    });

    // Reset and close
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setIsExpenseModalOpen(false);
  };

  const filteredInvoices = invoices.filter(inv => {
    if (invoiceFilter === 'All') return true;
    if (invoiceFilter === 'Proforma') return isProforma(inv);
    return inv.status === invoiceFilter;
  });

  const handleDeleteCreditNote = async (cn) => {
    const ok = await confirm({
      title: 'Withdraw this credit note?',
      body: `${cn.id} gave ${cn.customerName} a credit of ${formatCurrency(cn.amount)}. `
        + 'Withdrawing it deletes the note and puts that amount back on their balance.',
      confirmLabel: 'Withdraw',
      danger: true,
    });
    if (!ok) return;

    const result = await deleteCreditNote(cn.id);
    if (result?.ok) toast(`Credit note ${cn.id} withdrawn and ${formatCurrency(cn.amount)} put back.`, 'success');
    else toast(result?.error || 'The credit note could not be withdrawn.', 'error');
  };

  const handleCreditSubmit = (e) => {
    e.preventDefault();
    const amount = Number(creditForm.amount);
    if (!creditForm.customerName || isNaN(amount) || amount <= 0) { toast('Enter a valid customer and amount.', 'success'); return; }
    addCreditNote({
      customerName: creditForm.customerName,
      invoiceId: creditForm.invoiceId || null,
      amount,
      reason: creditForm.reason,
      recordedBy: user.id
    });
    setCreditForm({ customerName: '', invoiceId: '', amount: '', reason: 'Sales Return' });
    setIsCreditModalOpen(false);
  };

  // What can be done with one invoice. Kept here, beside the handlers it
  // calls; InvoicesTable only lays the row out.
  const renderInvoiceActions = (inv) => (
    <div className="flex items-center justify-end gap-0.5">
      {inv.status !== 'Paid' && (() => {
        // ── Resolve customer contact details dynamically ──────────────────────
        const orderObj = inv.orderId ? rawOrders.find(o => o.id === inv.orderId) : null;
        const leadObj = leads.find(l => l.name?.toLowerCase() === inv.customerName?.toLowerCase() || l.company?.toLowerCase() === inv.customerName?.toLowerCase());
        const distObj = distributors?.find(d => d.name?.toLowerCase() === inv.customerName?.toLowerCase());

        const phone = orderObj?.phone || leadObj?.phone || distObj?.phone || '9876543210';
        const email = orderObj?.email || leadObj?.email || distObj?.email || 'accounts@prismora.com';
        
        const totalValue = Number(inv.amount || 0) + Number(inv.tax || 0);
        
        // Calculate calendar day difference
        const dueDateObj = new Date(inv.dueDate);
        const todayObj = new Date();
        const todayStart = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
        const dueStart = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());
        
        const msDiff = todayStart.getTime() - dueStart.getTime();
        const daysDiff = Math.round(msDiff / 86400000); // positive if overdue, negative if upcoming
        const formattedDate = dueDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        
        let statusText = '';
        if (daysDiff > 0) {
          statusText = `is currently overdue by ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
        } else if (daysDiff < 0) {
          const absDiff = Math.abs(daysDiff);
          statusText = `is due in ${absDiff} day${absDiff > 1 ? 's' : ''} (on ${formattedDate})`;
        } else {
          statusText = `is due today`;
        }
        
        const messageText = `Hi ${inv.customerName},\n\nThis is a payment reminder from Prismora. Invoice ${inv.id} for ₹${totalValue.toLocaleString('en-IN')} ${statusText}. Please arrange for payment at your earliest convenience.\n\nThank you,\nPrismora Finance Team`;

        return (
          <>
            <button
              onClick={() => sendWhatsAppAlert(phone, messageText)}
              className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
              title={`Send WhatsApp Reminder to ${phone}`}
            >
              <MessageSquare size={16} />
            </button>
            <button
              onClick={() => sendEmailAlert(
                email,
                `Payment Reminder: Invoice ${inv.id}`,
                messageText
              )}
              className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
              title={`Send Email Reminder to ${email}`}
            >
              <Mail size={16} />
            </button>
          </>
        );
      })()}
      {inv.status !== 'Paid' && (
        <button
          onClick={() => updateInvoiceStatus(inv.id, 'Paid')}
          className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
          title="Mark as Paid"
        >
          <Check size={16} />
        </button>
      )}
      {inv.status === 'Paid' && (
        <button
          onClick={async () => {
            // Marking an invoice paid now also credits the partner, so a
            // misclick moves money. It has to be undoable.
            if (await confirm({
              title: 'Mark this invoice unpaid again?',
              body: 'The payment recorded against the partner will be removed and their balance put back.',
              confirmLabel: 'Mark unpaid',
            })) {
              updateInvoiceStatus(inv.id, 'Unpaid');
            }
          }}
          className="p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
          title="Mark as unpaid"
        >
          <Undo2 size={16} />
        </button>
      )}
      {inv.status === 'Unpaid' && (
        <button
          onClick={() => updateInvoiceStatus(inv.id, 'Overdue')}
          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
          title="Mark as Overdue"
        >
          <AlertCircle size={16} />
        </button>
      )}
      {isProforma(inv) && canAccess('accounting', 'full') && (
        <button
          onClick={() => handleConvert(inv)}
          disabled={convertingId === inv.id}
          className="px-2 py-1 text-[10px] font-bold rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
          title="Add GST and make this a tax invoice"
        >
          {convertingId === inv.id ? 'Converting…' : 'Convert'}
        </button>
      )}
      <button
        onClick={() => setPrintInvoice(inv)}
        className="p-1 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"
        title={isProforma(inv) ? 'Print proforma' : 'Print GST invoice'}
      >
        <Printer size={16} />
      </button>
      <button
        onClick={async () => {
          if (await confirm({ title: "Delete this invoice?", danger: true, confirmLabel: 'Delete' })) {
            const result = await deleteInvoice(inv.id);
            if (!result?.ok) toast(result?.error || 'The invoice could not be deleted.', 'error');
          }
        }}
        className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
        title="Delete Invoice"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Wallet}
        title="Accounting Hub"
        subtitle="Monitor business income, track operational expenses, and analyze net margins."
        actions={<>
          <Button icon={Plus} onClick={() => setIsExpenseModalOpen(true)}>Log Expense</Button>
          <Button icon={FileText} onClick={() => setIsCreditModalOpen(true)}>Credit Note</Button>
          <Button variant="primary" icon={Plus} onClick={() => setIsInvoiceModalOpen(true)}>Generate Invoice</Button>
        </>}
      />

        {missingPayouts.length > 0 && canAccess('accounting', 'full') && (
          <Card padding="p-4" className="border-amber-500/25 bg-amber-500/5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-amber-300 leading-relaxed">
                    <span className="font-bold">
                      {missingPayouts.length === 1
                        ? 'One payout is missing from the books'
                        : `${missingPayouts.length} payouts are missing from the books`}
                      {' — '}{formatCurrency(missingPayoutValue)}.
                    </span>{' '}
                    Scheme incentives, settled claims and approved field expenses used to change a status and nothing
                    else, so the money left the business without being recorded. Net profit above is overstated by
                    this much.
                  </p>
                  <p className="text-[11px] text-amber-300/70 mt-1.5 leading-relaxed">
                    Anything paid from now on is booked as it happens. This only covers what was paid before that.
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                disabled={reconciling}
                onClick={async () => {
                  setReconciling(true);
                  setReconcileResult(await reconcilePayouts());
                  setReconciling(false);
                }}
              >
                {reconciling ? 'Booking…' : 'Book them'}
              </Button>
            </div>
          </Card>
        )}

        {reconcileResult && (
          <Card
            padding="p-4"
            className={reconcileResult.failed > 0
              ? 'border-rose-500/25 bg-rose-500/5'
              : 'border-emerald-500/25 bg-emerald-500/5'}
          >
            <p className={`text-xs leading-relaxed ${reconcileResult.failed > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
              {reconcileResult.booked > 0 && (
                <>Booked {reconcileResult.booked} payout{reconcileResult.booked === 1 ? '' : 's'} worth{' '}
                {formatCurrency(reconcileResult.value)}. </>
              )}
              {reconcileResult.failed > 0
                ? `${reconcileResult.failed} could not be written and are still missing — the reason is in the browser console. Running this again is safe.`
                : reconcileResult.booked === 0 ? 'Nothing needed booking.' : 'Net profit above now accounts for them.'}
            </p>
          </Card>
        )}

      {/* Tabs Menu */}
      <div className="flex border-b border-white/5 pb-px">
        {canAccess('accounting', 'full') && (
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'overview'
                ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10'
                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Overview
          </button>
        )}
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'invoices'
              ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10'
              : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'expenses'
              ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10'
              : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Expenses ({expenses.length})
        </button>
        <button
          onClick={() => setActiveTab('credit')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'credit'
              ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10'
              : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Credit Notes ({(creditNotes || []).length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && canAccess('accounting', 'full') && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Total Revenue */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Net Sales (Paid)</h3>
                <div className="p-3 bg-brand-primary/80 rounded-xl text-green-400"><TrendingUp size={20} /></div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight break-all">
                {formatCurrency(totalRevenue)}
              </p>
              <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                <div>Invoiced and paid: {formatCurrency(totalIncome)}</div>
                {creditNoteValue > 0 && (
                  <div className="text-amber-400">Less credit notes: &minus;{formatCurrency(creditNoteValue)}</div>
                )}
                {/* Shown apart from the figure above, because it is not the
                    business's money: it is collected and paid over. */}
                <div>GST collected, to remit: {formatCurrency(gstCollected)}</div>
              </div>
            </div>

            {/* Total Expenses */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Total Expenses</h3>
                <div className="p-3 bg-brand-primary/80 rounded-xl text-red-400"><CreditCard size={20} /></div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight break-all">
                {formatCurrency(totalExpensesValue)}
              </p>
              <p className="mt-2 text-xs text-slate-500">All logged operating expenditures</p>
            </div>

            {/* Cost of goods purchased — previously missing from this screen */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Cost of Goods Purchased</h3>
                <div className="p-3 bg-brand-primary/80 rounded-xl text-amber-400"><ShoppingBag size={20} /></div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight break-all">
                {formatCurrency(purchaseCost)}
              </p>
              <div className="mt-2 text-xs text-slate-500 flex flex-wrap items-center gap-1">
                <span>Received: {formatCurrency(goodsReceivedValue)}</span>
                {purchaseReturnsValue > 0 && (<><span>•</span><span>Returned: {formatCurrency(purchaseReturnsValue)}</span></>)}
              </div>
            </div>

            {/* Vendor payables — the mirror of receivables below */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Vendor Payables</h3>
                <div className="p-3 bg-brand-primary/80 rounded-xl text-rose-400"><CreditCard size={20} /></div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-rose-400 tracking-tight break-all">
                {formatCurrency(vendorPayables)}
              </p>
              <p className="mt-2 text-xs text-slate-500">What Janki Herbals still owes its vendors</p>
            </div>

            {/* Net Profit */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className={`absolute top-0 right-0 w-32 h-32 ${netProfit >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'} rounded-full blur-3xl`}></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Net Profit</h3>
                <div className={`p-3 bg-brand-primary/80 rounded-xl ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <DollarSign size={20} />
                </div>
              </div>
              <p className={`text-2xl sm:text-3xl font-extrabold tracking-tight break-all ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(netProfit)}
              </p>
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                <span className={`font-semibold ${netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{profitMargin}% margin</span>
                <span>relative to earnings</span>
              </div>
              {/* Spelled out, because this number changed when the cost of
                  goods was brought in and it should be obvious why. */}
              <p className="mt-1.5 text-[10px] text-slate-600 leading-relaxed">
                Net sales {formatCurrency(totalRevenue)} &minus; expenses {formatCurrency(totalExpensesValue)} &minus; goods {formatCurrency(purchaseCost)}. GST is excluded: it is not earnings.
              </p>
            </div>

            {/* Outstanding Receivables */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Outstanding Invoices</h3>
                <div className="p-3 bg-brand-primary/80 rounded-xl text-amber-400"><Clock size={20} /></div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight break-all">
                {formatCurrency(outstandingAmount)}
              </p>
              <p className="mt-2 text-xs text-slate-500">{unpaidInvoices.length} invoices pending payment</p>
            </div>
          </div>

          {/* Charts section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cash Flow Trend Chart */}
            <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/5">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <TrendingUp size={20} className="text-brand-accent" />
                Income vs Expenses (Monthly)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={getMonthlyTrendData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis dataKey="month" {...CHART_AXIS} />
                    <YAxis {...CHART_AXIS} tickFormatter={(val) => `₹${val / 1000}k`} />
                    <Tooltip 
                      {...CHART_TOOLTIP}
                      formatter={(val) => `₹${val.toLocaleString()}`}
                      cursor={false}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="Income" fill={colorAt(2)} radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Expenses" fill={colorAt(7)} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Expense Categories Distribution */}
            <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <CreditCard size={20} className="text-brand-accent" />
                  Expenses Breakdown
                </h3>
                <div className="h-64">
                  {expenses.length > 0 ? (
                    <ResponsiveContainer width="100%" height={256}>
                      <PieChart>
                        <Pie
                          data={getExpenseCategoriesData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {getExpenseCategoriesData().map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={colorAt(idx)} />
                          ))}
                        </Pie>
                        <Tooltip 
                          {...CHART_TOOLTIP}
                          formatter={(val) => `₹${val.toLocaleString()}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-slate-500 text-sm">No expenses logged yet.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Legends list */}
              {expenses.length > 0 && (
                <div className="space-y-2 mt-4 max-h-36 overflow-y-auto custom-scrollbar">
                  {getExpenseCategoriesData().map((item, idx) => (
                    <div key={item.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorAt(idx) }}></div>
                        <span className="text-slate-400">{item.name}</span>
                      </div>
                      <span className="text-slate-200 font-semibold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* Status filters */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="flex gap-2">
              {['All', 'Paid', 'Unpaid', 'Overdue'].map(status => (
                <button
                  key={status}
                  onClick={() => setInvoiceFilter(status)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    invoiceFilter === status
                      ? 'bg-brand-accent/15 border-brand-accent text-brand-accent shadow-sm shadow-brand-accent/15'
                      : 'bg-brand-primary-lighter/40 border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
              {/* Proformas raised on delivery carry no GST until Accounts
                  converts them. The count is always shown so none is forgotten. */}
              <button
                onClick={() => setInvoiceFilter('Proforma')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  invoiceFilter === 'Proforma'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                    : proformaCount > 0
                      ? 'bg-amber-500/5 border-amber-500/30 text-amber-400 hover:text-amber-300'
                      : 'bg-brand-primary-lighter/40 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                Proforma drafts not yet converted ({proformaCount})
              </button>
            </div>
          </div>

          <InvoicesTable
            invoices={filteredInvoices}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            raisedBy={inv => attributionFor(inv, users).name}
            renderActions={renderInvoiceActions}
          />
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <ExpensesTable
            expenses={expenses}
            users={users}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            renderActions={exp => (
              <IconButton
                icon={Trash2}
                title="Delete this expense"
                size="sm"
                tone="danger"
                onClick={async () => {
                  if (await confirm({ title: 'Delete this expense record?', danger: true, confirmLabel: 'Delete' })) deleteExpense(exp.id);
                }}
              />
            )}
          />
        </div>
      )}

      {activeTab === 'credit' && (
        <CreditNotesTable
          creditNotes={creditNotes || []}
          users={users}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          renderActions={cn => (
            // A credit note issued for the wrong amount, or against the wrong
            // customer, used to be permanent.
            <IconButton icon={Trash2} title="Withdraw this credit note" size="sm" tone="danger" onClick={() => handleDeleteCreditNote(cn)} />
          )}
        />
      )}

      {/* Modal: Issue Credit Note */}
      {isCreditModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCreditModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="text-brand-accent" size={20} />Issue Credit Note</h3>
              <button onClick={() => setIsCreditModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreditSubmit} className="space-y-4">
              <div>
                <label htmlFor="accounting-against-invoice-optional" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Against Invoice (optional)</label>
                <select id="accounting-against-invoice-optional" value={creditForm.invoiceId} onChange={e => {
                  const inv = invoices.find(i => i.id === e.target.value);
                  setCreditForm(f => ({ ...f, invoiceId: e.target.value, customerName: inv ? inv.customerName : f.customerName, amount: inv ? String(Number(inv.amount || 0) + Number(inv.tax || 0)) : f.amount }));
                }} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white">
                  <option value="" className="bg-brand-primary text-slate-500">-- None / Manual --</option>
                  {invoices.map(i => <option key={i.id} value={i.id} className="bg-brand-primary">{i.id} — {i.customerName} ({formatCurrency(Number(i.amount || 0) + Number(i.tax || 0))})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="accounting-customer-name" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Customer Name *</label>
                <input id="accounting-customer-name" type="text" required value={creditForm.customerName} onChange={e => setCreditForm(f => ({ ...f, customerName: e.target.value }))} placeholder="e.g. Gujarat Super Stockist" className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="accounting-credit-amount" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Credit Amount (₹) *</label>
                  <input id="accounting-credit-amount" type="number" required min="1" value={creditForm.amount} onChange={e => setCreditForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600" />
                </div>
                <div>
                  <label htmlFor="accounting-reason" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Reason *</label>
                  <select id="accounting-reason" value={creditForm.reason} onChange={e => setCreditForm(f => ({ ...f, reason: e.target.value }))} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white">
                    {['Sales Return', 'Damaged Goods', 'Price Adjustment', 'Overbilling', 'Scheme Credit', 'Other'].map(r => <option key={r} value={r} className="bg-brand-primary">{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 text-xs text-slate-400">
                This reduces the customer's outstanding balance by the credit amount.
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                <button type="button" onClick={() => setIsCreditModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Issue Credit Note</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Modal: Generate Invoice */}
      {isInvoiceModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh] overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInvoiceModalOpen(false)}></div>
          
          {/* Modal Panel */}
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            {/* Sticky Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="text-brand-accent" size={20} />
                Generate New Invoice
              </h3>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleGenerateInvoiceSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                <div>
                  <span id="invoice-type-group" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Invoice Type</span>
                  <div role="group" aria-labelledby="invoice-type-group" className="grid grid-cols-2 gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderId('');
                        setCustomCustomerName('');
                        setCustomAmount('');
                      }}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        !selectedOrderId
                          ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                          : 'bg-brand-primary-lighter/40 border-white/5 text-slate-400'
                      }`}
                    >
                      Custom Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (uninvoicedOrders.length > 0) {
                          setSelectedOrderId(uninvoicedOrders[0].id);
                          setCustomCustomerName(uninvoicedOrders[0].customerName);
                          setCustomAmount(uninvoicedOrders[0].value);
                        } else {
                          toast("No uninvoiced orders available.", 'error');
                        }
                      }}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        selectedOrderId
                          ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                          : 'bg-brand-primary-lighter/40 border-white/5 text-slate-400'
                      }`}
                    >
                      Bill CRM Order
                    </button>
                  </div>
                </div>

                {selectedOrderId ? (
                  <div>
                    <label htmlFor="accounting-select-order" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Select Order</label>
                    <select id="accounting-select-order"
                      value={selectedOrderId}
                      onChange={(e) => {
                        setSelectedOrderId(e.target.value);
                        const order = orders.find(o => o.id === e.target.value);
                        if (order) {
                          setCustomCustomerName(order.customerName);
                          setCustomAmount(order.value);
                        }
                      }}
                      className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                    >
                      {uninvoicedOrders.map(o => (
                        <option key={o.id} value={o.id} className="bg-brand-primary-light text-slate-200">
                          {o.id} - {o.customerName} ({o.product} x {o.quantity}) - {formatCurrency(o.value)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="accounting-customer-name-2" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Customer Name</label>
                      <input id="accounting-customer-name-2"
                        type="text"
                        required
                        placeholder="e.g. Arjun Patel"
                        value={customCustomerName}
                        onChange={(e) => setCustomCustomerName(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="accounting-base-amount" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Base Amount (₹)</label>
                      <input id="accounting-base-amount"
                        type="number"
                        required
                        min="1"
                        placeholder="e.g. 50000"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="accounting-due-date" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Due Date</label>
                  <input id="accounting-due-date"
                    type="date"
                    required
                    value={invoiceDueDate}
                    onChange={(e) => setInvoiceDueDate(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                </div>

                {/* Billing something that has not shipped is legitimate — an
                    advance, a proforma — but it should never be silent. The
                    list offers every order without an invoice, whatever its
                    status, and this is the only place that says so. */}
                {(() => {
                  const selected = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;
                  if (!selected || selected.status === 'Delivered') return null;
                  return (
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                      <p className="text-[11px] text-amber-400 leading-relaxed">
                        <span className="font-semibold">{selected.id} has not been delivered — it is {selected.status}.</span>{' '}
                        Billing now raises the invoice before the goods have gone out. The order will not be
                        invoiced again when it is delivered, so this is the bill the customer receives.
                      </p>
                    </div>
                  );
                })()}

                {/* With or without GST */}
                <div>
                  <span id="bill-with-gst-group" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Bill with GST?</span>
                  <div role="group" aria-labelledby="bill-with-gst-group" className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInvoiceWithTax(true)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        invoiceWithTax
                          ? 'bg-brand-accent/15 text-brand-accent border-brand-accent/30'
                          : 'bg-brand-primary-lighter/40 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      With GST{invoicePreview.rateLabel ? ` (${invoicePreview.rateLabel})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceWithTax(false)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        !invoiceWithTax
                          ? 'bg-brand-accent/15 text-brand-accent border-brand-accent/30'
                          : 'bg-brand-primary-lighter/40 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      Without GST
                    </button>
                  </div>
                  {!invoiceWithTax && (
                    <p className="text-[10px] text-amber-400 mt-1.5">
                      No tax will be charged on this bill. Use this only where GST genuinely does not apply.
                    </p>
                  )}
                </div>

                {/* A custom invoice has no product to take a rate from. */}
                {!selectedOrderId && invoiceWithTax && (
                  <div>
                    <label htmlFor="accounting-custom-gst" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">GST rate</label>
                    <select id="accounting-custom-gst" required value={customGstPct} onChange={e => setCustomGstPct(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white">
                      <option value="" className="bg-brand-primary-light">Choose the rate…</option>
                      {[0, 5, 12, 18, 28].map(r => <option key={r} value={r} className="bg-brand-primary-light">{r}%</option>)}
                    </select>
                  </div>
                )}

                {invoicePreview.missing.length > 0 && (
                  <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3">
                    <p className="text-[11px] text-rose-300 leading-relaxed">
                      <span className="font-semibold">No GST rate in the catalogue for {invoicePreview.missing.join(', ')}.</span>{' '}
                      Set it under Product Catalogue before billing with GST — the rate is not guessed.
                    </p>
                  </div>
                )}

                {invoiceError && (
                  <p role="alert" className="text-sm font-medium text-red-400">⚠️ {invoiceError}</p>
                )}

                {/* The preview used to appear only when an amount was typed by
                    hand, so choosing an order showed no tax at all before the
                    invoice was raised. It now covers both. */}
                {(() => {
                  const { base, tax } = invoicePreview;
                  if (!base) return null;
                  return (
                    <div className="bg-brand-primary-lighter/40 rounded-xl p-3 border border-white/5 text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Base Amount:</span>
                        <span className="font-semibold text-slate-200">{formatCurrency(base)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST ({!invoiceWithTax ? 'not charged' : invoicePreview.rateLabel || 'rate needed'}):</span>
                        <span className="font-semibold text-slate-200">{formatCurrency(tax)}</span>
                      </div>
                      <div className="border-t border-white/5 pt-1.5 flex justify-between font-bold text-white text-sm">
                        <span>Total Invoiced Value:</span>
                        <span className="text-brand-accent">{formatCurrency(base + tax)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Sticky Footer */}
              <div className="flex gap-3 justify-end p-6 border-t border-white/5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 text-sm bg-brand-primary-lighter hover:bg-brand-primary-lighter/80 text-slate-400 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvoice || invoicePreview.missing.length > 0}
                  className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-50"
                >
                  {isSavingInvoice ? 'Saving…' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Log Expense */}
      {isExpenseModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh] overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsExpenseModalOpen(false)}></div>
          
          {/* Modal Panel */}
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            {/* Sticky Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="text-brand-accent" size={20} />
                Log Expense
              </h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleAddExpenseSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                <div>
                  <label htmlFor="accounting-category" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Category</label>
                  <select id="accounting-category"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                  >
                    <option value="Raw Materials" className="bg-brand-primary-light text-slate-200">Raw Materials</option>
                    <option value="Logistics" className="bg-brand-primary-light text-slate-200">Logistics & Shipping</option>
                    <option value="Marketing" className="bg-brand-primary-light text-slate-200">Marketing & Promotion</option>
                    <option value="Salaries" className="bg-brand-primary-light text-slate-200">Salaries & Commission</option>
                    <option value="Rent" className="bg-brand-primary-light text-slate-200">Office & Rent</option>
                    <option value="Other" className="bg-brand-primary-light text-slate-200">Other Operations</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="accounting-amount" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Amount (₹)</label>
                  <input id="accounting-amount"
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 15000"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600"
                  />
                </div>

                <div>
                  <label htmlFor="accounting-description" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Description</label>
                  <textarea id="accounting-description"
                    placeholder="Details about the transaction"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    rows="3"
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none"
                  />
                </div>

                <div>
                  <label htmlFor="accounting-date" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Date</label>
                  <input id="accounting-date"
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="flex gap-3 justify-end p-6 border-t border-white/5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 text-sm bg-brand-primary-lighter hover:bg-brand-primary-lighter/80 text-slate-400 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm btn-accent rounded-xl"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Print GST Invoice */}
      {printInvoice && createPortal(
        (() => {
          const order = getOrderForInvoice(printInvoice);
          const destinationState = order?.state || 'Gujarat';
          const destinationCity = order?.city || 'Ahmedabad';
          const isIntrastate = destinationState.toLowerCase() === 'gujarat';
          
          const baseAmount = Number(printInvoice.amount || 0);
          const gstAmount = Number(printInvoice.tax || 0);
          const grandTotal = baseAmount + gstAmount;

          const cgst = isIntrastate ? Math.round(gstAmount / 2) : 0;
          const sgst = isIntrastate ? Math.round(gstAmount / 2) : 0;
          const igst = !isIntrastate ? gstAmount : 0;

          // A proforma is a request for payment, not a tax invoice, and must
          // never be mistaken for one — on screen or on paper.
          const proforma = isProforma(printInvoice);
          const title = proforma ? 'PROFORMA INVOICE' : 'TAX INVOICE';

          // The invoice's own lines where it has them (every invoice since 039),
          // each with the HSN code and GST rate it was raised with. The old
          // template printed one line, HSN 33049910 and "9% + 9%" whatever the
          // products actually were.
          const storedLines = Array.isArray(printInvoice.lines) ? printInvoice.lines : [];
          const lines = storedLines.length > 0 ? storedLines : [{
            name: order?.product || 'Goods as per order',
            quantity: order?.quantity || 1,
            unitPrice: Math.round(baseAmount / (order?.quantity || 1)),
            amount: baseAmount,
            hsnCode: null,
            gstPct: null,
          }];
          // GST grouped by rate, for the summary.
          const byRate = {};
          lines.forEach(l => {
            if (l.gstPct === null || l.gstPct === undefined) return;
            const r = Number(l.gstPct);
            byRate[r] = byRate[r] || { taxable: 0, gst: 0 };
            byRate[r].taxable += Number(l.amount || 0);
            byRate[r].gst += Number(l.gstAmount ?? (Number(l.amount || 0) * r / 100));
          });
          const rateRows = Object.entries(byRate).sort((a, b) => Number(a[0]) - Number(b[0]));

          return (
            <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 overflow-y-auto bg-black/70 backdrop-blur-sm pt-[5vh] print-modal-wrapper">
              <div className="relative w-full max-w-3xl bg-white text-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 border border-slate-200 print-modal-box">
                
                {/* Header Actions (Not Printed) */}
                <div className="bg-slate-100 px-6 py-4 flex justify-between items-center border-b border-slate-200 no-print flex-shrink-0">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText size={18} className="text-brand-accent" />
                    {proforma ? 'Proforma' : 'Tax Invoice'} Preview ({printInvoice.id})
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-brand-accent hover:bg-brand-accent-light text-white rounded-lg transition-all shadow-sm shadow-brand-accent/20"
                    >
                      <Printer size={14} /> Print / Save PDF
                    </button>
                    <button
                      onClick={() => setPrintInvoice(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Printable Invoice Container */}
                <div id="printable-invoice-container" className="p-8 md:p-12 overflow-y-auto bg-white text-slate-800 leading-normal flex-1">
                  {/* Brand & Invoice title */}
                  <div className="flex justify-between items-start border-b pb-6 border-slate-200">
                    <div>
                      <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-pink-600">PRISMORA</h1>
                      <p className="text-xs text-slate-500 mt-1 font-medium font-sans">PREMIUM SKIN & BODY CARE</p>
                    </div>
                    <div className="text-right font-sans">
                      <h2 className="text-xl font-bold tracking-wider text-slate-900">{title}</h2>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{proforma ? 'Not a tax invoice' : 'Original for Recipient'}</p>
                    </div>
                  </div>

                  {proforma && (
                    <div className="mt-6 border-2 border-amber-500 rounded-xl px-4 py-3 text-center font-sans">
                      <p className="text-base font-black tracking-wide text-amber-700">PROFORMA – NOT A TAX INVOICE</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        No GST is charged on this document and no input tax credit can be claimed against it.
                        A GST tax invoice will be issued in its place.
                      </p>
                    </div>
                  )}

                  {/* Company & Billing Details */}
                  <div className="grid grid-cols-2 gap-8 my-8 text-xs font-sans">
                    {/* Sender Details */}
                    <div className="space-y-1">
                      <p className="font-bold text-slate-950 text-sm">PRISMORA PERSONAL CARE LTD.</p>
                      <p>402, Spectrum Towers, Chimanlal Girdharlal Rd</p>
                      <p>Ahmedabad, Gujarat - 380009</p>
                      <p className="font-semibold text-slate-700">GSTIN: 24AAACP4920M1Z4</p>
                      <p>Email: billing@prismora.com</p>
                    </div>

                    {/* Consignee/Buyer Details */}
                    <div className="space-y-1">
                      <p className="font-bold text-slate-400 tracking-wider uppercase">Billed To:</p>
                      <p className="font-bold text-slate-950 text-sm">{printInvoice.customerName}</p>
                      {printInvoice.contactName
                        ? <p>Attn: {printInvoice.contactName}</p>
                        : order?.companyName && order.companyName !== printInvoice.customerName && <p>{order.companyName}</p>}
                      <p>{destinationCity}, {destinationState}</p>
                      <p className="font-semibold text-slate-700">Place of Supply: {destinationState}</p>
                    </div>
                  </div>

                  {/* Invoice Meta details */}
                  <div className="bg-slate-50 border rounded-xl p-4 grid grid-cols-4 gap-4 text-center my-6 text-xs text-slate-600 border-slate-200 font-sans">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Invoice No.</p>
                      <p className="font-bold text-slate-950 font-mono mt-0.5">{printInvoice.id}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Invoice Date</p>
                      <p className="font-semibold text-slate-950 mt-0.5">{formatDate(printInvoice.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Due Date</p>
                      <p className="font-semibold text-slate-950 mt-0.5">{formatDate(printInvoice.dueDate)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Order ID</p>
                      <p className="font-semibold text-slate-950 font-mono mt-0.5">{printInvoice.orderId || 'Direct Bill'}</p>
                    </div>
                  </div>

                  {/* Table details */}
                  <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden my-8 text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                        <th className="p-3">#</th>
                        <th className="p-3">Product Description</th>
                        <th className="p-3 text-center">HSN Code</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Unit Price</th>
                        {!proforma && <th className="p-3 text-center">GST %</th>}
                        <th className="p-3 text-right">{proforma ? 'Amount' : 'Taxable Value'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => (
                        <tr key={idx} className="border-b border-slate-200 text-slate-800">
                          <td className="p-3">{idx + 1}</td>
                          <td className="p-3 font-semibold">{l.name}</td>
                          <td className="p-3 text-center font-mono text-[10px]">{l.hsnCode || '—'}</td>
                          <td className="p-3 text-center font-semibold">{l.quantity}</td>
                          <td className="p-3 text-right">{formatCurrency(l.unitPrice)}</td>
                          {!proforma && <td className="p-3 text-center">{l.gstPct === null || l.gstPct === undefined ? '—' : `${l.gstPct}%`}</td>}
                          <td className="p-3 text-right font-semibold">{formatCurrency(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Tax details breakdown */}
                  <div className="flex flex-col md:flex-row justify-between items-start gap-8 my-8 text-xs font-sans">
                    {/* Amount in words */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Total Amount in Words:</p>
                        <p className="font-semibold text-slate-950 italic mt-1">{numberToWords(grandTotal)}</p>
                      </div>
                      
                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-1">
                        <p className="font-bold text-slate-950 mb-1 text-[10px] uppercase tracking-wider">GST Tax Summary:</p>
                        {proforma ? (
                          <p className="text-slate-600">No GST on a proforma. GST is added when it is converted to a tax invoice.</p>
                        ) : rateRows.length === 0 ? (
                          <p className="text-slate-600">GST {formatCurrency(gstAmount)}.</p>
                        ) : rateRows.map(([rate, v]) => (
                          isIntrastate ? (
                            <div key={rate} className="flex justify-between text-slate-600">
                              <span>CGST {Number(rate) / 2}% + SGST {Number(rate) / 2}% on {formatCurrency(v.taxable)}</span>
                              <span>{formatCurrency(v.gst)}</span>
                            </div>
                          ) : (
                            <div key={rate} className="flex justify-between text-slate-600">
                              <span>IGST {rate}% on {formatCurrency(v.taxable)}</span>
                              <span>{formatCurrency(v.gst)}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>

                    {/* Calculations */}
                    <div className="w-full md:w-80 space-y-2 border-t pt-4 border-slate-100 md:border-t-0 md:pt-0">
                      <div className="flex justify-between text-slate-600">
                        <span>{proforma ? 'Subtotal:' : 'Total Taxable Value (Base):'}</span>
                        <span>{formatCurrency(baseAmount)}</span>
                      </div>
                      {proforma ? (
                        <div className="flex justify-between text-slate-600">
                          <span>GST:</span>
                          <span>Not charged (proforma)</span>
                        </div>
                      ) : isIntrastate ? (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>Central Tax (CGST):</span>
                            <span>{formatCurrency(cgst)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>State Tax (SGST):</span>
                            <span>{formatCurrency(sgst)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-slate-600">
                          <span>Integrated Tax (IGST):</span>
                          <span>{formatCurrency(igst)}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 my-2"></div>
                      <div className="flex justify-between font-black text-slate-950 text-sm">
                        <span>{proforma ? 'Amount due (no GST):' : 'Grand Total:'}</span>
                        <span className="text-brand-accent">{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer terms */}
                  <div className="border-t border-slate-200 pt-8 mt-12 grid grid-cols-2 gap-8 text-[10px] text-slate-500 font-sans">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-700">Terms & Conditions:</p>
                      <p>1. Interest @ 18% p.a. will be charged if payment is not made within 14 due days.</p>
                      <p>2. All disputes are subject to Ahmedabad jurisdiction only.</p>
                      <p>3. Goods once sold will not be taken back.</p>
                    </div>
                    <div className="text-right flex flex-col justify-end items-end space-y-4">
                      <div className="h-10 w-24 border-b border-dashed border-slate-300"></div>
                      <p className="font-bold text-slate-800 font-sans">For PRISMORA PERSONAL CARE LTD.</p>
                      <p className="text-[9px] text-slate-400">Authorized Signatory</p>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
};

export default Accounting;

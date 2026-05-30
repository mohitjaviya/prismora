import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  Wallet, TrendingUp, Plus, Trash2, Calendar, FileText, 
  CheckCircle, Clock, AlertCircle, ShoppingCart, ArrowUpRight, 
  ArrowDownRight, Check, X, CreditCard, DollarSign, Printer 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell 
} from 'recharts';

const CHART_COLORS = ['#D4186C', '#6366F1', '#A78BFA', '#38BDF8', '#34D399', '#FBBF24'];

const Accounting = () => {
  const { user, users, canAccessData } = useAuth();
  const { 
    orders: rawOrders, invoices: rawInvoices, expenses: rawExpenses, 
    addInvoice, updateInvoiceStatus, deleteInvoice,
    addExpense, deleteExpense 
  } = useData();

  // Route Guard: Anyone logged in can access, view is filtered dynamically
  if (!user) {
    return <Navigate to="/login" replace />;
  }

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
  const [activeTab, setActiveTab] = useState(user.role === 'Admin' ? 'overview' : 'invoices'); // 'overview' | 'invoices' | 'expenses'
  const [invoiceFilter, setInvoiceFilter] = useState('All'); // 'All' | 'Paid' | 'Unpaid' | 'Overdue'
  
  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [printInvoice, setPrintInvoice] = useState(null);

  // Form states
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');

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

  const totalRevenue = totalIncome + totalTax;

  const totalExpensesValue = expenses
    .reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const netProfit = totalRevenue - totalExpensesValue;
  const profitMargin = totalRevenue ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

  const unpaidInvoices = invoices.filter(inv => inv.status === 'Unpaid' || inv.status === 'Overdue');
  const outstandingAmount = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0) + Number(inv.tax || 0), 0);

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
    const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Default initial empty states
    monthsOrder.forEach(m => {
      data[m] = { month: m, Income: 0, Expenses: 0 };
    });

    invoices.forEach(inv => {
      if (inv.status === 'Paid' && inv.createdAt) {
        const m = new Date(inv.createdAt).toLocaleString('default', { month: 'short' });
        if (data[m]) {
          data[m].Income += Number(inv.amount || 0) + Number(inv.tax || 0);
        }
      }
    });

    expenses.forEach(exp => {
      if (exp.date) {
        const m = new Date(exp.date).toLocaleString('default', { month: 'short' });
        if (data[m]) {
          data[m].Expenses += Number(exp.amount || 0);
        }
      }
    });

    // Only display months with active income or expenses
    const activeMonths = monthsOrder.map(m => data[m]).filter(d => d.Income > 0 || d.Expenses > 0);
    return activeMonths.length > 0 ? activeMonths : monthsOrder.map(m => data[m]);
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

  // Handles custom/order invoice generation
  const handleGenerateInvoiceSubmit = (e) => {
    e.preventDefault();
    
    let customerName = customCustomerName;
    let amount = Number(customAmount);
    let orderId = null;

    if (selectedOrderId) {
      const order = orders.find(o => o.id === selectedOrderId);
      if (order) {
        customerName = order.customerName;
        amount = Number(order.value);
        orderId = order.id;
      }
    }

    if (!customerName || isNaN(amount) || amount <= 0) {
      alert("Please fill in valid details.");
      return;
    }

    const taxRate = 0.18; // 18% GST
    const calculatedTax = Math.round(amount * taxRate);

    addInvoice({
      orderId,
      customerName,
      amount,
      tax: calculatedTax,
      status: 'Unpaid',
      dueDate: invoiceDueDate ? new Date(invoiceDueDate).toISOString() : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days due default
      assignedTo: user.id
    });

    // Reset and close
    setSelectedOrderId('');
    setCustomCustomerName('');
    setCustomAmount('');
    setInvoiceDueDate('');
    setIsInvoiceModalOpen(false);
  };

  // Handles adding an expense
  const handleAddExpenseSubmit = (e) => {
    e.preventDefault();
    const amount = Number(expenseAmount);
    
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount.");
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
    return inv.status === invoiceFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="text-brand-accent animate-pulse" size={28} />
            Accounting Hub
          </h1>
          <p className="text-slate-400 text-sm">Monitor business income, track operational expenses, and analyze net margins.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-primary-light border border-white/10 hover:border-brand-accent/50 text-slate-200 rounded-xl transition-all"
          >
            <Plus size={16} /> Log Expense
          </button>
          <button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm btn-accent rounded-xl"
          >
            <Plus size={16} /> Generate Invoice
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-white/5 pb-px">
        {user?.role === 'Admin' && (
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
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && user?.role === 'Admin' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Total Revenue */}
            <div className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400">Total Income (Paid)</h3>
                <div className="p-3 bg-brand-primary/80 rounded-xl text-green-400"><TrendingUp size={20} /></div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight break-all">
                {formatCurrency(totalRevenue)}
              </p>
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                <span>Base: {formatCurrency(totalIncome)}</span>
                <span>•</span>
                <span>GST (18%): {formatCurrency(totalTax)}</span>
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getMonthlyTrendData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                      itemStyle={{ color: '#D4186C' }}
                      formatter={(val) => `₹${val.toLocaleString()}`}
                      cursor={false}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="Income" fill="#34D399" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={30} />
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
                <div className="h-64 flex items-center justify-center">
                  {expenses.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
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
                            <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                          formatter={(val) => `₹${val.toLocaleString()}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-slate-500 text-sm">No expenses logged yet.</p>
                  )}
                </div>
              </div>

              {/* Legends list */}
              {expenses.length > 0 && (
                <div className="space-y-2 mt-4 max-h-36 overflow-y-auto custom-scrollbar">
                  {getExpenseCategoriesData().map((item, idx) => (
                    <div key={item.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
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
            </div>
            <p className="text-xs text-slate-500">{filteredInvoices.length} invoices found</p>
          </div>

          {/* Invoices Table */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4">Invoice ID</th>
                    <th className="p-4">Customer Name</th>
                    <th className="p-4">Order ID</th>
                    <th className="p-4">Created Date</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4 text-right">Base Amt</th>
                    <th className="p-4 text-right">Tax (GST)</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {filteredInvoices.length > 0 ? (
                    filteredInvoices.map((inv) => {
                      const totalValue = Number(inv.amount || 0) + Number(inv.tax || 0);
                      return (
                        <tr key={inv.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                          <td className="p-4 font-bold text-white">{inv.id}</td>
                          <td className="p-4 font-medium">{inv.customerName}</td>
                          <td className="p-4 text-slate-400 font-mono text-xs">{inv.orderId || 'Custom'}</td>
                          <td className="p-4 text-slate-400">{formatDate(inv.createdAt)}</td>
                          <td className="p-4 text-slate-400">{formatDate(inv.dueDate)}</td>
                          <td className="p-4 text-right">{formatCurrency(inv.amount)}</td>
                          <td className="p-4 text-right text-slate-400">{formatCurrency(inv.tax)}</td>
                          <td className="p-4 text-right font-bold text-white">{formatCurrency(totalValue)}</td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              inv.status === 'Paid' 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : inv.status === 'Unpaid' 
                                  ? 'bg-amber-500/10 text-amber-400' 
                                  : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {inv.status === 'Paid' && <CheckCircle size={12} />}
                              {inv.status === 'Unpaid' && <Clock size={12} />}
                              {inv.status === 'Overdue' && <AlertCircle size={12} />}
                              {inv.status}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {inv.status !== 'Paid' && (
                                <button
                                  onClick={() => updateInvoiceStatus(inv.id, 'Paid')}
                                  className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                                  title="Mark as Paid"
                                >
                                  <Check size={16} />
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
                                <button
                                  onClick={() => setPrintInvoice(inv)}
                                  className="p-1 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"
                                  title="Print GST Invoice"
                                >
                                  <Printer size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("Delete this invoice?")) deleteInvoice(inv.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                  title="Delete Invoice"
                                >
                                  <Trash2 size={16} />
                                </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="10" className="p-8 text-center text-slate-500">
                        No invoices match this filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-6">
          {/* Expenses Table */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4">Expense ID</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Description</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {expenses.length > 0 ? (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                        <td className="p-4 font-bold text-white">{exp.id}</td>
                        <td className="p-4 text-slate-400">{formatDate(exp.date)}</td>
                        <td className="p-4 font-semibold text-brand-accent">{exp.category}</td>
                        <td className="p-4 text-slate-300 italic max-w-xs truncate" title={exp.description}>
                          {exp.description || 'No description provided'}
                        </td>
                        <td className="p-4 text-right font-bold text-white">{formatCurrency(exp.amount)}</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              if (confirm("Delete this expense record?")) deleteExpense(exp.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Delete Expense"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-500">
                        No expenses logged yet. Click "Log Expense" to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Invoice Type</label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
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
                          alert("No uninvoiced orders available.");
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
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Select Order</label>
                    <select
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
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Customer Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Arjun Patel"
                        value={customCustomerName}
                        onChange={(e) => setCustomCustomerName(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Base Amount (₹)</label>
                      <input
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Due Date</label>
                  <input
                    type="date"
                    required
                    value={invoiceDueDate}
                    onChange={(e) => setInvoiceDueDate(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                </div>

                {customAmount && (
                  <div className="bg-brand-primary-lighter/40 rounded-xl p-3 border border-white/5 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Base Amount:</span>
                      <span className="font-semibold text-slate-200">{formatCurrency(Number(customAmount))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST (18%):</span>
                      <span className="font-semibold text-slate-200">{formatCurrency(Number(customAmount) * 0.18)}</span>
                    </div>
                    <div className="border-t border-white/5 pt-1.5 flex justify-between font-bold text-white text-sm">
                      <span>Total Invoiced Value:</span>
                      <span className="text-brand-accent">{formatCurrency(Number(customAmount) * 1.18)}</span>
                    </div>
                  </div>
                )}
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
                  className="px-4 py-2 text-sm btn-accent rounded-xl"
                >
                  Create Invoice
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Category</label>
                  <select
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Amount (₹)</label>
                  <input
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Description</label>
                  <textarea
                    placeholder="Details about the transaction"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    rows="3"
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Date</label>
                  <input
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

          const productName = order?.product || 'Personal Care Products Package';
          const quantity = order?.quantity || 1;
          const unitPrice = Math.round(baseAmount / quantity);

          return (
            <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 overflow-y-auto bg-black/70 backdrop-blur-sm pt-[5vh] print-modal-wrapper">
              <div className="relative w-full max-w-3xl bg-white text-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 border border-slate-200 print-modal-box">
                
                {/* Header Actions (Not Printed) */}
                <div className="bg-slate-100 px-6 py-4 flex justify-between items-center border-b border-slate-200 no-print flex-shrink-0">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText size={18} className="text-brand-accent" />
                    Tax Invoice Preview ({printInvoice.id})
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
                      <h2 className="text-xl font-bold tracking-wider text-slate-900">TAX INVOICE</h2>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">Original for Recipient</p>
                    </div>
                  </div>

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
                      {order?.companyName && <p>{order.companyName}</p>}
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
                        <th className="p-3 text-right">Taxable Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-200 text-slate-800">
                        <td className="p-3">1</td>
                        <td className="p-3 font-semibold">{productName}</td>
                        <td className="p-3 text-center font-mono text-[10px]">33049910</td>
                        <td className="p-3 text-center font-semibold">{quantity}</td>
                        <td className="p-3 text-right">{formatCurrency(unitPrice)}</td>
                        <td className="p-3 text-right font-semibold">{formatCurrency(baseAmount)}</td>
                      </tr>
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
                        {isIntrastate ? (
                          <>
                            <div className="flex justify-between text-slate-600">
                              <span>CGST @ 9% on {formatCurrency(baseAmount)}</span>
                              <span>{formatCurrency(cgst)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>SGST @ 9% on {formatCurrency(baseAmount)}</span>
                              <span>{formatCurrency(sgst)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between text-slate-600">
                            <span>IGST @ 18% on {formatCurrency(baseAmount)}</span>
                            <span>{formatCurrency(igst)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Calculations */}
                    <div className="w-full md:w-80 space-y-2 border-t pt-4 border-slate-100 md:border-t-0 md:pt-0">
                      <div className="flex justify-between text-slate-600">
                        <span>Total Taxable Value (Base):</span>
                        <span>{formatCurrency(baseAmount)}</span>
                      </div>
                      {isIntrastate ? (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>Central Tax (CGST 9%):</span>
                            <span>{formatCurrency(cgst)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>State Tax (SGST 9%):</span>
                            <span>{formatCurrency(sgst)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-slate-600">
                          <span>Integrated Tax (IGST 18%):</span>
                          <span>{formatCurrency(igst)}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 my-2"></div>
                      <div className="flex justify-between font-black text-slate-950 text-sm">
                        <span>Grand Total:</span>
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

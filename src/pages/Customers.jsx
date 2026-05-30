import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Search, Filter, Download, Briefcase, MapPin, Package, ArrowUpDown, X, Calendar, CheckCircle, Clock, Truck } from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { createPortal } from 'react-dom';

const Customers = () => {
  const { orders, leads } = useData();
  const { user, users: allUsers, canAccessData } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'totalSpend', direction: 'desc' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [modalYearFilter, setModalYearFilter] = useState('All Time');
  const [modalProductFilter, setModalProductFilter] = useState('All Products');

  // Route Guard: Anyone logged in can access, view is filtered dynamically
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Filter orders and leads based on RBAC permissions
  const filteredOrders = useMemo(() => {
    return orders.filter(o => canAccessData(o.assignedTo));
  }, [orders, canAccessData]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => canAccessData(l.assignedTo));
  }, [leads, canAccessData]);

  // Aggregate customer data from Orders
  const customerData = useMemo(() => {
    const customerMap = {};

    filteredOrders.forEach(order => {
      const name = order.customerName;
      if (!name) return;

      if (!customerMap[name]) {
        customerMap[name] = {
          name,
          company: order.companyName || 'N/A',
          state: order.state,
          city: order.city,
          totalSpend: 0,
          totalOrders: 0,
          products: new Set(),
          rawOrders: [],
          assignedTo: order.assignedTo,
          // We can try to pull phone/email from Leads if they exist
          email: 'N/A',
          phone: 'N/A'
        };
      }
      
      customerMap[name].totalSpend += order.value;
      customerMap[name].totalOrders += 1;
      customerMap[name].products.add(order.product);
      customerMap[name].rawOrders.push(order);
      
      // Keep the most recent state/city just in case
      customerMap[name].state = order.state;
      customerMap[name].city = order.city;
    });

    // Enhance with Lead data if available
    filteredLeads.forEach(lead => {
      if (customerMap[lead.name]) {
        customerMap[lead.name].email = lead.email;
        customerMap[lead.name].phone = lead.phone;
      }
    });

    return Object.values(customerMap).map(c => ({
      ...c,
      products: Array.from(c.products)
    }));
  }, [filteredOrders, filteredLeads]);

  // Extract unique products and states for filters
  const availableProducts = useMemo(() => [...new Set(customerData.flatMap(c => c.products))], [customerData]);
  const availableStates = useMemo(() => [...new Set(customerData.map(c => c.state))], [customerData]);

  // Handle Sorting
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Filter and Sort the data
  const filteredAndSortedCustomers = useMemo(() => {
    let result = [...customerData];

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(lowerQuery));
    }
    
    if (productFilter) {
      result = result.filter(c => c.products.includes(productFilter));
    }

    if (stateFilter) {
      result = result.filter(c => c.state === stateFilter);
    }

    result.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [customerData, searchQuery, productFilter, stateFilter, sortConfig]);

  const handleExport = () => {
    const exportData = filteredAndSortedCustomers.map(c => ({
      CustomerName: c.name,
      Company: c.company,
      Email: c.email,
      Phone: c.phone,
      State: c.state,
      City: c.city,
      TotalOrders: c.totalOrders,
      LifetimeValue: c.totalSpend,
      ProductsPurchased: c.products.join(', '),
      AssignedSalesperson: allUsers.find(u => u.id === c.assignedTo)?.name || 'Unknown'
    }));
    downloadCSV(exportData, 'PRISMORA_Customers');
  };

  return (
    <div className="space-y-6 flex flex-col h-full animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase size={24} className="text-brand-accent" />
            Customer Directory
          </h1>
          <p className="text-slate-400 text-sm mt-1">Aggregated insights and lifetime value across all accounts.</p>
        </div>
        <button 
          onClick={handleExport}
          className="glass-panel hover:bg-brand-primary-lighter/80 text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5"
        >
          <Download size={18} className="text-brand-accent" />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden p-4 sm:p-6">
        {/* Filters Row */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search customers..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent transition-colors"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-4 md:w-1/2">
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={productFilter} 
                onChange={e => setProductFilter(e.target.value)} 
                className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-slate-200 appearance-none focus:ring-1 focus:ring-brand-accent"
              >
                <option value="" className="bg-brand-primary">All Products</option>
                {availableProducts.map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
              </select>
            </div>
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={stateFilter} 
                onChange={e => setStateFilter(e.target.value)} 
                className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-slate-200 appearance-none focus:ring-1 focus:ring-brand-accent"
              >
                <option value="" className="bg-brand-primary">All States</option>
                {availableStates.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-brand-primary-lighter/50 text-slate-400 border-b border-slate-700/50">
              <tr>
                <th className="px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-2">Customer <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('totalSpend')}>
                  <div className="flex items-center gap-2">Lifetime Value (₹) <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('totalOrders')}>
                  <div className="flex items-center gap-2">Orders <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-4 py-3 font-medium">Products Purchased</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('state')}>
                  <div className="flex items-center gap-2">Location <ArrowUpDown size={14} /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredAndSortedCustomers.length > 0 ? filteredAndSortedCustomers.map((customer, idx) => (
                <tr 
                  key={idx} 
                  onClick={() => setSelectedCustomer(customer)}
                  className="hover:bg-brand-primary-lighter/50 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-4">
                    <div className="font-medium text-white">{customer.name}</div>
                    <div className="text-xs text-brand-accent mt-0.5">{customer.company}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{customer.email !== 'N/A' ? customer.email : customer.phone}</div>
                  </td>
                  <td className="px-4 py-4 font-bold text-brand-accent">
                    ₹{customer.totalSpend.toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <span className="bg-white/5 border border-white/10 px-2.5 py-1 rounded text-xs font-medium">
                      {customer.totalOrders} {customer.totalOrders === 1 ? 'Order' : 'Orders'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                      {customer.products.slice(0, 3).map((prod, pIdx) => (
                        <span key={pIdx} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                          <Package size={10} /> {prod}
                        </span>
                      ))}
                      {customer.products.length > 3 && (
                        <span className="text-[10px] bg-slate-500/10 text-slate-400 px-2 py-0.5 rounded-full">
                          +{customer.products.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm">{customer.state}</div>
                    <div className="text-xs text-slate-500">{customer.city}</div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <Briefcase size={32} className="mx-auto mb-3 opacity-20" />
                    <p>No customers found matching your filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile/Tablet Card View */}
        <div className="lg:hidden space-y-4">
          {filteredAndSortedCustomers.length > 0 ? filteredAndSortedCustomers.map((customer, idx) => (
            <div 
              key={idx} 
              onClick={() => setSelectedCustomer(customer)}
              className="bg-brand-primary-lighter/30 hover:bg-brand-primary-lighter/50 transition-colors cursor-pointer border border-slate-700/50 rounded-xl p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-white">{customer.name}</h3>
                  <p className="text-xs text-brand-accent mt-0.5">{customer.company}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{customer.email !== 'N/A' ? customer.email : customer.phone}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-brand-accent">₹{customer.totalSpend.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">{customer.totalOrders} Orders</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {customer.products.map((prod, pIdx) => (
                  <span key={pIdx} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    {prod}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-3 border-t border-slate-700/50">
                <MapPin size={12} />
                {customer.city}, {customer.state}
              </div>
            </div>
          )) : (
            <div className="py-12 text-center text-slate-500">
              <Briefcase size={32} className="mx-auto mb-3 opacity-20" />
              <p>No customers found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (() => {
        // Compute available years for this customer's orders
        const availableYears = [...new Set(selectedCustomer.rawOrders.map(o => new Date(o.date).getFullYear()))].sort((a, b) => b - a);
        const availableProductsModal = [...new Set(selectedCustomer.rawOrders.map(o => o.product))].sort();
        
        // Filter orders by selected year and product
        const filteredModalOrders = selectedCustomer.rawOrders.filter(o => {
          const passYear = modalYearFilter === 'All Time' ? true : new Date(o.date).getFullYear().toString() === modalYearFilter;
          const passProduct = modalProductFilter === 'All Products' ? true : o.product === modalProductFilter;
          return passYear && passProduct;
        });

        // Calculate metrics for the filtered subset
        const filteredSpend = filteredModalOrders.reduce((sum, o) => sum + o.value, 0);
        const filteredOrderCount = filteredModalOrders.length;
        const filteredProducts = [...new Set(filteredModalOrders.map(o => o.product))];

        return createPortal(
          <div className="fixed inset-0 bg-brand-primary/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="bg-brand-primary-light border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in-up">
              <div className="p-6 border-b border-white/10 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedCustomer.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-semibold text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded">{selectedCustomer.company}</span>
                    <span className="text-slate-400 text-sm">• {selectedCustomer.email !== 'N/A' ? selectedCustomer.email : selectedCustomer.phone} • {selectedCustomer.city}, {selectedCustomer.state}</span>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedCustomer(null); setModalYearFilter('All Time'); setModalProductFilter('All Products'); }}
                  className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Modal Controls */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <h3 className="text-lg font-bold text-white">Performance Overview</h3>
                  <div className="flex gap-3">
                    <div className="relative">
                      <select 
                        value={modalProductFilter}
                        onChange={e => setModalProductFilter(e.target.value)}
                        className="glass-input rounded-lg pl-3 pr-8 py-1.5 text-sm text-slate-200 appearance-none focus:ring-1 focus:ring-brand-accent bg-brand-primary/50 border border-white/10 max-w-[200px] truncate"
                      >
                        <option value="All Products">All Products</option>
                        {availableProductsModal.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select 
                        value={modalYearFilter}
                        onChange={e => setModalYearFilter(e.target.value)}
                        className="glass-input rounded-lg pl-3 pr-8 py-1.5 text-sm text-slate-200 appearance-none focus:ring-1 focus:ring-brand-accent bg-brand-primary/50 border border-white/10"
                      >
                        <option value="All Time">All Time</option>
                        {availableYears.map(year => (
                          <option key={year} value={year.toString()}>{year}</option>
                        ))}
                      </select>
                      <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-brand-primary p-4 rounded-xl border border-white/5">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Spend ({modalYearFilter})</p>
                    <p className="text-xl font-bold text-brand-accent">₹{filteredSpend.toLocaleString()}</p>
                  </div>
                  <div className="bg-brand-primary p-4 rounded-xl border border-white/5">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Orders ({modalYearFilter})</p>
                    <p className="text-xl font-bold text-white">{filteredOrderCount}</p>
                  </div>
                  <div className="bg-brand-primary p-4 rounded-xl border border-white/5 md:col-span-2">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Products ({modalYearFilter})</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {filteredProducts.map(p => (
                        <span key={p} className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">{p}</span>
                      ))}
                      {filteredProducts.length === 0 && <span className="text-xs text-slate-500">No products in this period</span>}
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white mb-4">Order History ({modalYearFilter})</h3>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-brand-primary">
                      <tr>
                        <th className="px-4 py-3 font-medium">Order ID</th>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 font-medium">Value</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-brand-primary-lighter/30">
                      {filteredModalOrders.sort((a, b) => new Date(b.date) - new Date(a.date)).map(order => (
                        <tr key={order.id} className="hover:bg-brand-primary transition-colors">
                          <td className="px-4 py-3 font-medium text-white">{order.id}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={14} className="text-slate-400" />
                              {new Date(order.date).toLocaleDateString('en-IN')}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{order.product}</div>
                            <div className="text-xs text-slate-500">Qty: {order.quantity}</div>
                          </td>
                          <td className="px-4 py-3 font-bold text-brand-accent">
                            ₹{order.value.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 w-max ${
                              order.status === 'Delivered' ? 'bg-green-500/10 text-green-400' :
                              order.status === 'Processing' ? 'bg-blue-500/10 text-blue-400' :
                              order.status === 'Shipped' ? 'bg-purple-500/10 text-purple-400' :
                              'bg-yellow-500/10 text-yellow-400'
                            }`}>
                              {order.status === 'Delivered' && <CheckCircle size={12} />}
                              {order.status === 'Processing' && <Clock size={12} />}
                              {order.status === 'Shipped' && <Truck size={12} />}
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredModalOrders.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                            No orders found for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
};

export default Customers;


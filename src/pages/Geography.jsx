import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { ArrowUpDown } from 'lucide-react';

const Geography = () => {
  const { orders } = useData();
  const { user, canAccessData } = useAuth();
  
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' });

  // Only consider orders, we can derive state/city from them easily.
  const visibleOrders = orders.filter(o => canAccessData(o.assignedTo));

  const geoData = useMemo(() => {
    const map = {};
    visibleOrders.forEach(order => {
      const key = `${order.state}-${order.city}`;
      if (!map[key]) {
        map[key] = { state: order.state, city: order.city, orders: 0, revenue: 0, units: 0 };
      }
      map[key].orders += 1;
      map[key].revenue += order.value;
      map[key].units += order.quantity;
    });

    const data = Object.values(map);

    data.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [visibleOrders, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Geographic Insights</h1>
        <p className="text-slate-400 text-sm">Analyze sales performance by state and city.</p>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-brand-primary-lighter/50 text-slate-400 border-b border-slate-700/50">
              <tr>
                <th className="px-6 py-4 font-medium cursor-pointer hover:text-white" onClick={() => requestSort('state')}>
                  <div className="flex items-center gap-1">State <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-6 py-4 font-medium cursor-pointer hover:text-white" onClick={() => requestSort('city')}>
                  <div className="flex items-center gap-1">City <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-6 py-4 font-medium cursor-pointer hover:text-white" onClick={() => requestSort('orders')}>
                  <div className="flex items-center gap-1">Total Orders <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-6 py-4 font-medium cursor-pointer hover:text-white" onClick={() => requestSort('units')}>
                  <div className="flex items-center gap-1">Units Sold <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-6 py-4 font-medium cursor-pointer hover:text-white" onClick={() => requestSort('revenue')}>
                  <div className="flex items-center gap-1">Revenue (₹) <ArrowUpDown size={14} /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {geoData.length > 0 ? geoData.map((row, idx) => (
                <tr key={idx} className="hover:bg-brand-primary-lighter/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{row.state}</td>
                  <td className="px-6 py-4">{row.city}</td>
                  <td className="px-6 py-4">{row.orders}</td>
                  <td className="px-6 py-4">{row.units}</td>
                  <td className="px-6 py-4 font-medium text-brand-accent">₹{row.revenue.toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    No geographic data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Geography;


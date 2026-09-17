import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Tags, Download } from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { PageHeader, DataTable, Button } from '../components/ui';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

export default function PriceList() {
  const { productCatalog } = useData();
  const { user } = useAuth();

  const priceField = user?.role === 'Dealer' ? 'dealerPrice' : user?.role === 'Retailer' ? 'retailerPrice' : 'distributorPrice';
  const tierLabel = user?.role === 'Dealer' ? 'dealer' : user?.role === 'Retailer' ? 'retailer' : 'distributor';

  // Sorted by name as the default order. The table can be sorted by any column
  // from its header now, so this is only where it starts.
  const rows = useMemo(
    () => [...productCatalog].sort((a, b) => a.name.localeCompare(b.name)),
    [productCatalog],
  );

  const handleExport = () => downloadCSV(rows.map(p => ({
    Product: p.name, Category: p.category, HSN: p.hsnCode, UOM: p.uom,
    MRP: p.mrp, 'Your Price': p[priceField], 'GST %': p.gstPct,
  })), 'PRISMORA_Price_List');

  const columns = [
    {
      key: 'name', header: 'Product', sort: p => p.name || '',
      render: p => (
        <>
          <div className="font-semibold text-white">{p.name}</div>
          <div className="text-[11px] text-slate-500">{p.category}</div>
        </>
      ),
    },
    {
      key: 'hsn', header: 'HSN Code', hideBelow: 'md', sort: p => p.hsnCode || '',
      render: p => <span className="font-mono text-slate-400">{p.hsnCode}</span>,
    },
    {
      key: 'uom', header: 'UOM', hideBelow: 'sm', sort: p => p.uom || '',
      render: p => <span className="text-slate-400">{p.uom}</span>,
    },
    {
      key: 'mrp', header: 'MRP', align: 'right', sort: p => Number(p.mrp) || 0,
      render: p => <span className="text-slate-500 line-through">{formatCurrency(p.mrp)}</span>,
    },
    {
      key: 'price', header: 'Your Price', align: 'right', sort: p => Number(p[priceField]) || 0,
      render: p => <span className="font-bold text-brand-accent">{formatCurrency(p[priceField])}</span>,
    },
    {
      key: 'gst', header: 'GST', align: 'right', hideBelow: 'sm', sort: p => Number(p.gstPct) || 0,
      render: p => <span className="text-slate-400">{p.gstPct}%</span>,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Tags}
        title="Price List"
        subtitle={`Your ${tierLabel} pricing tier for all active products.`}
        actions={<Button icon={Download} onClick={handleExport}>Export</Button>}
      />

      <DataTable
        title="Products"
        columns={columns}
        rows={rows}
        rowKey={p => p.id}
        search={p => `${p.name} ${p.category} ${p.hsnCode || ''}`}
        searchPlaceholder="Search product or category"
        empty={{
          icon: Tags,
          title: 'No products in the catalogue',
          hint: 'Prices are read from the Product Catalogue under Masters. Add a product there and its tier prices appear here.',
        }}
      />
    </div>
  );
}

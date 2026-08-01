import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { isSchemeEligible, getSchemeMatchValue } from '../utils/schemeUtils';

const DataContext = createContext();

// Synchronously hydrate state from the browser's cached copy so the UI renders
// instantly on load; fetchData() then refreshes from Supabase in the background.
const lsInit = (key) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
};

export const DataProvider = ({ children }) => {
  // ── Original CRM State (hydrated from cache for instant load) ────────────
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
  const [sfaExpenses, setSfaExpenses] = useState(() => lsInit('prismora_sfa_expenses'));
  const [vendorPayments, setVendorPayments] = useState(() => lsInit('prismora_vendor_payments'));

  // ── Distributor Portal State ────────────────────────────────────────────
  const [distributorPayments, setDistributorPayments] = useState(() => lsInit('prismora_distributor_payments'));
  const [schemeClaims, setSchemeClaims] = useState(() => lsInit('prismora_scheme_claims'));
  const [distributorIncentives, setDistributorIncentives] = useState(() => lsInit('prismora_distributor_incentives'));

  const DEFAULT_CATALOG = [
    { id: 'P1', name: 'Herbal Hair Oil 100ml', category: 'Hair Care', hsnCode: '30049011', gstPct: 12, mrp: 250, distributorPrice: 150, dealerPrice: 180, retailerPrice: 200, uom: 'BOTTLE', createdAt: new Date().toISOString() },
    { id: 'P2', name: 'Aloevera Skin Gel 150g', category: 'Skin Care', hsnCode: '30049012', gstPct: 12, mrp: 180, distributorPrice: 100, dealerPrice: 125, retailerPrice: 140, uom: 'TUBE', createdAt: new Date().toISOString() },
    { id: 'P3', name: 'Tulsi Cough Syrup 100ml', category: 'Wellness', hsnCode: '30049013', gstPct: 5, mrp: 120, distributorPrice: 70, dealerPrice: 85, retailerPrice: 95, uom: 'BOTTLE', createdAt: new Date().toISOString() },
    { id: 'P4', name: 'Neem Face Wash 100ml', category: 'Skin Care', hsnCode: '30049014', gstPct: 18, mrp: 150, distributorPrice: 90, dealerPrice: 105, retailerPrice: 120, uom: 'BOTTLE', createdAt: new Date().toISOString() },
    { id: 'P5', name: 'Triphala Capsules 60s', category: 'Wellness', hsnCode: '30049015', gstPct: 12, mrp: 300, distributorPrice: 180, dealerPrice: 210, retailerPrice: 240, uom: 'BOTTLE', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_INVENTORY = [
    { id: 'INV-1', product: 'Herbal Hair Oil 100ml', batchNumber: 'HHO-2026-01', expiryDate: '2028-06-01T12:00:00.000Z', quantity: 500, reserved: 50, transit: 0, damaged: 5, reorderLevel: 100, warehouse: 'Main Warehouse', unitCost: 85, createdAt: new Date().toISOString() },
    { id: 'INV-2', product: 'Aloevera Skin Gel 150g', batchNumber: 'ASG-2026-02', expiryDate: '2028-03-01T12:00:00.000Z', quantity: 45, reserved: 10, transit: 30, damaged: 0, reorderLevel: 100, warehouse: 'Main Warehouse', unitCost: 60, createdAt: new Date().toISOString() },
    { id: 'INV-3', product: 'Tulsi Cough Syrup 100ml', batchNumber: 'TCS-2026-03', expiryDate: '2026-09-01T12:00:00.000Z', quantity: 200, reserved: 0, transit: 0, damaged: 2, reorderLevel: 100, warehouse: 'Main Warehouse', unitCost: 40, createdAt: new Date().toISOString() },
    { id: 'INV-4', product: 'Neem Face Wash 100ml', batchNumber: 'NFW-2026-04', expiryDate: '2027-08-15T12:00:00.000Z', quantity: 0, reserved: 0, transit: 0, damaged: 0, reorderLevel: 50, warehouse: 'Main Warehouse', unitCost: 50, createdAt: new Date().toISOString() },
    { id: 'INV-5', product: 'Triphala Capsules 60s', batchNumber: 'TRP-2026-05', expiryDate: '2028-12-01T12:00:00.000Z', quantity: 350, reserved: 0, transit: 50, damaged: 0, reorderLevel: 75, warehouse: 'Main Warehouse', unitCost: 110, createdAt: new Date().toISOString() }
  ];

  const DEFAULT_DISTRIBUTORS = [
    { id: 'DIST-1', name: 'Gujarat Super Stockist', gstin: '24AABCG1234D1Z3', state: 'Gujarat', city: 'Ahmedabad', territory: 'Gujarat North Hub', phone: '9876501234', email: 'info@gujstockist.com', contactPerson: 'Nilesh Patel', outstandingAmount: 45000, creditLimit: 200000, status: 'Active', createdAt: new Date().toISOString() },
    { id: 'DIST-2', name: 'Maharashtra Prime Dist.', gstin: '27AABCM9876F1Z1', state: 'Maharashtra', city: 'Mumbai', territory: 'Mumbai Central', phone: '9876502345', email: 'ops@mahaprime.com', contactPerson: 'Rahul Mehta', outstandingAmount: 120000, creditLimit: 500000, status: 'Active', createdAt: new Date().toISOString() },
    { id: 'DIST-3', name: 'Karnataka Wellness Dist.', gstin: '29AABCK5432H1Z7', state: 'Karnataka', city: 'Bangalore', territory: 'Bangalore Zone', phone: '9876503456', email: 'orders@karndist.com', contactPerson: 'Priya Nair', outstandingAmount: 0, creditLimit: 300000, status: 'Active', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_DEALERS = [
    { id: 'DEAL-1', name: 'Mohan Dealers', gstin: '24AABCM5678D1Z2', parentDistributorId: 'DIST-1', state: 'Gujarat', city: 'Vadodara', territory: 'Gujarat North Hub', phone: '9876504567', email: 'mohan@dealers.com', contactPerson: 'Mohan Patel', outstandingAmount: 0, creditLimit: 100000, status: 'Active', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_RETAILERS = [
    { id: 'RET-1', name: 'Geeta Retailers', gstin: '24AABCG9012D1Z8', parentDealerId: 'DEAL-1', state: 'Gujarat', city: 'Vadodara', territory: 'Gujarat North Hub', phone: '9876505678', email: 'geeta@retailers.com', contactPerson: 'Geeta Shah', outstandingAmount: 0, creditLimit: 50000, status: 'Active', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_SCHEMES = [
    { id: 'SCH-1', name: 'Monsoon Ayurvedic Special', type: 'Flat Discount', discountPct: 10, minOrderValue: 50000, applicableTo: 'Distributor', applicableProducts: [], validFrom: '2026-06-01', validTo: '2026-08-31', status: 'Active', description: '10% flat discount on Ayurvedic packages above ₹50,000 during monsoon season', createdAt: new Date().toISOString() },
    { id: 'SCH-2', name: 'Festive Herbal Booster Offer', type: 'Cash Discount', discountPct: 5, minOrderValue: 10000, applicableTo: 'Retailer', applicableProducts: [], validFrom: '2026-10-01', validTo: '2026-11-15', status: 'Active', description: '5% cash discount for herbal retailers during Diwali season', createdAt: new Date().toISOString() },
    { id: 'SCH-3', name: 'Dealer Growth Incentive', type: 'Flat Discount', discountPct: 7, minOrderValue: 20000, applicableTo: 'Dealer', applicableProducts: [], validFrom: '2026-01-01', validTo: '2026-12-31', status: 'Active', description: '7% incentive for dealers on orders above ₹20,000', createdAt: new Date().toISOString() },
    { id: 'SCH-4', name: 'Retailer Loyalty Bonus', type: 'Flat Discount', discountPct: 4, minOrderValue: 5000, applicableTo: 'Retailer', applicableProducts: [], validFrom: '2026-01-01', validTo: '2026-12-31', status: 'Active', description: '4% incentive for retailers on orders above ₹5,000', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_COMPLAINTS = [
    { id: 'CMP-1', customerName: 'Apex Distributors', customerPhone: '9876500111', product: 'Herbal Hair Oil 100ml', batchNumber: 'HHO-2026-01', complaintType: 'Damaged Batch packaging', description: 'Outer cardboard casing of 5 bottles found crushed on delivery.', status: 'Registered', resolution: '', assignedTo: 'U-sales-1', createdAt: new Date().toISOString() },
    { id: 'CMP-2', customerName: 'Arogya Medical Store', customerPhone: '9876500222', product: 'Tulsi Cough Syrup 100ml', batchNumber: 'TCS-2026-03', complaintType: 'Quantity mismatch', description: 'Shorthand receipt of 3 bottles in box. Invoiced 20.', status: 'Resolved', resolution: 'Credited value of 3 bottles to distributor account.', assignedTo: 'U-sales-2', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_TERRITORIES = [
    { id: 'T-1', name: 'Gujarat North Hub', state: 'Gujarat', districts: ['Anand', 'Vadodara', 'Ahmedabad'], executiveId: 'U-sales-1', createdAt: new Date().toISOString() },
    { id: 'T-2', name: 'Delhi Hub', state: 'Delhi', districts: ['New Delhi', 'North Delhi', 'West Delhi'], executiveId: 'U-sales-2', createdAt: new Date().toISOString() },
    { id: 'T-3', name: 'Mumbai Central', state: 'Maharashtra', districts: ['Mumbai City', 'Mumbai Suburban'], executiveId: 'U-sales-3', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_BEAT_PLANS = [
    { id: 'B-1', executiveId: 'U-sales-1', date: new Date().toISOString().split('T')[0], territory: 'Gujarat North Hub', outlets: ['Radhe Ayurvedic', 'Vrindavan Wellness', 'Janki Retailers'], status: 'Planned', createdAt: new Date().toISOString() },
    { id: 'B-2', executiveId: 'U-sales-2', date: new Date().toISOString().split('T')[0], territory: 'Delhi Hub', outlets: ['Delhi Herbal Emporium', 'Capital Wellness'], status: 'Visited', createdAt: new Date().toISOString() },
    { id: 'B-3', executiveId: 'U-sales-3', date: new Date(Date.now() - 24*60*60*1000).toISOString().split('T')[0], territory: 'Mumbai Central', outlets: ['Bombay Herbals', 'Metro Retailers'], status: 'Visited', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_ATTENDANCE = [
    { id: 'ATT-1', userId: 'U-sales-1', date: new Date().toISOString().split('T')[0], status: 'Present', checkInTime: '09:15 AM', checkOutTime: null, notes: 'Started beat visits at Anand' },
    { id: 'ATT-2', userId: 'U-sales-2', date: new Date().toISOString().split('T')[0], status: 'Present', checkInTime: '09:30 AM', checkOutTime: '05:30 PM', notes: 'Completed visits at Delhi Hub' },
    { id: 'ATT-3', userId: 'U-sales-3', date: new Date(Date.now() - 24*60*60*1000).toISOString().split('T')[0], status: 'Present', checkInTime: '09:10 AM', checkOutTime: '06:00 PM', notes: 'Mumbai sales beats completed' }
  ];

  const DEFAULT_VISIT_REPORTS = [
    { id: 'VR-1', executiveId: 'U-sales-1', outletName: 'Radhe Ayurvedic', outletContact: '9876543210', visitDate: new Date().toISOString().split('T')[0], productsShown: ['Herbal Hair Oil 100ml', 'Triphala Capsules 60s'], orderPlaced: true, orderId: 'O-1001', nextFollowUp: '2026-07-15', notes: 'Owner placed order for hair oil, interested in face washes next check.' },
    { id: 'VR-2', executiveId: 'U-sales-2', outletName: 'Delhi Herbal Emporium', outletContact: '9876543220', visitDate: new Date().toISOString().split('T')[0], productsShown: ['Tulsi Cough Syrup 100ml'], orderPlaced: false, orderId: null, nextFollowUp: null, notes: 'Sufficient stocks present. Revisit in next cycle.' }
  ];

  const DEFAULT_LEADS = [
    { id: 'L1', name: 'Ayush Pharmacy', company: 'Ayush Wellness', phone: '9876543210', email: 'contact@ayush.com', productInterest: ['Herbal Hair Oil 100ml'], leadSource: 'Web Directory', assignedTo: 'U-sales-1', status: 'Contacted', followUpDate: new Date().toISOString(), notes: 'Very interested in stocking hair oil. Asked for distributor price catalog.', dealValue: 25000, createdAt: new Date(Date.now() - 3*24*60*60*1000).toISOString() },
    { id: 'L2', name: 'Natures Cure Store', company: 'Natures Cure Retail', phone: '9876543220', email: 'sales@naturescure.com', productInterest: ['Triphala Capsules 60s', 'Tulsi Cough Syrup 100ml'], leadSource: 'Trade Show', assignedTo: 'U-sales-2', status: 'Qualified', followUpDate: new Date(Date.now() + 2*24*60*60*1000).toISOString(), notes: 'Interested in wellness combo packs. Bulk pricing terms sent.', dealValue: 48000, createdAt: new Date(Date.now() - 5*24*60*60*1000).toISOString() }
  ];

  const DEFAULT_ORDERS = [
    { id: 'O1', customerName: 'Gujarat Super Stockist', companyName: 'Gujarat Stockist Group', product: 'Herbal Hair Oil 100ml', quantity: 200, value: 30000, state: 'Gujarat', city: 'Ahmedabad', status: 'Delivered', assignedTo: 'U-sales-1', date: new Date(Date.now() - 2*24*60*60*1000).toISOString(), createdAt: new Date(Date.now() - 2*24*60*60*1000).toISOString() },
    { id: 'O2', customerName: 'Maharashtra Prime Dist.', companyName: 'Prime Distributors Ltd.', product: 'Triphala Capsules 60s', quantity: 150, value: 27000, state: 'Maharashtra', city: 'Mumbai', status: 'Processing', assignedTo: 'U-sales-3', date: new Date().toISOString(), createdAt: new Date().toISOString() },
    { id: 'O3', customerName: 'Karnataka Wellness Dist.', companyName: 'Wellness Dist. Corp', product: 'Tulsi Cough Syrup 100ml', quantity: 100, value: 7000, state: 'Karnataka', city: 'Bangalore', status: 'Pending', assignedTo: 'U-sales-4', date: new Date().toISOString(), createdAt: new Date().toISOString() }
  ];

  const DEFAULT_PURCHASE_ORDERS = [
    { id: 'PO-1', vendorId: 'V1', vendorName: 'Janki Herbals', items: [{ name: 'Herbal Hair Oil 100ml', quantity: 500, unitCost: 85, total: 42500 }, { name: 'Aloevera Skin Gel 150g', quantity: 300, unitCost: 60, total: 18000 }], total: 60500, status: 'Completed', expectedDate: new Date(Date.now() - 4*24*60*60*1000).toISOString(), notes: 'Initial raw shipment purchase', assignedTo: 'U-admin', createdAt: new Date(Date.now() - 7*24*60*60*1000).toISOString() },
    { id: 'PO-2', vendorId: 'V1', vendorName: 'Janki Herbals', items: [{ name: 'Tulsi Cough Syrup 100ml', quantity: 200, unitCost: 40, total: 8000 }], total: 8000, status: 'Ordered', expectedDate: new Date(Date.now() + 3*24*60*60*1000).toISOString(), notes: 'Replenishment for winter cough syrup stocks', assignedTo: 'U-admin', createdAt: new Date(Date.now() - 1*24*60*60*1000).toISOString() }
  ];

  const DEFAULT_GRN = [
    { id: 'GRN-1', poId: 'PO-1', vendorName: 'Janki Herbals', items: [{ name: 'Herbal Hair Oil 100ml', quantity: 500, unitCost: 85, total: 42500 }, { name: 'Aloevera Skin Gel 150g', quantity: 300, unitCost: 60, total: 18000 }], receivedDate: new Date(Date.now() - 4*24*60*60*1000).toISOString(), notes: 'All packaging clean and intact. Accepted.', receivedBy: 'U-admin', createdAt: new Date(Date.now() - 4*24*60*60*1000).toISOString() }
  ];

  const DEFAULT_INVOICES = [
    { id: 'INV-1001', orderId: 'O1', customerName: 'Gujarat Super Stockist', amount: 30000, tax: 3600, status: 'Paid', dueDate: new Date(Date.now() + 10*24*60*60*1000).toISOString(), assignedTo: 'U-sales-1', createdAt: new Date(Date.now() - 2*24*60*60*1000).toISOString() },
    { id: 'INV-1002', orderId: 'O2', customerName: 'Maharashtra Prime Dist.', amount: 27000, tax: 3240, status: 'Unpaid', dueDate: new Date(Date.now() - 18*24*60*60*1000).toISOString(), assignedTo: 'U-sales-3', createdAt: new Date(Date.now() - 18*24*60*60*1000).toISOString() },
    { id: 'INV-1003', orderId: 'O3', customerName: 'Karnataka Wellness Dist.', amount: 7000, tax: 350, status: 'Unpaid', dueDate: new Date(Date.now() + 14*24*60*60*1000).toISOString(), assignedTo: 'U-sales-4', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_EXPENSES = [
    { id: 'EXP-1', category: 'Raw Materials', amount: 60500, description: 'PO-1 Shipment fulfillment pay to Janki Herbals', date: new Date(Date.now() - 4*24*60*60*1000).toISOString(), assignedTo: 'U-admin', createdAt: new Date(Date.now() - 4*24*60*60*1000).toISOString() },
    { id: 'EXP-2', category: 'Logistics', amount: 4500, description: 'Delivery truck fuel for Gujarat stockist shipment', date: new Date(Date.now() - 2*24*60*60*1000).toISOString(), assignedTo: 'U-sales-1', createdAt: new Date(Date.now() - 2*24*60*60*1000).toISOString() },
    { id: 'EXP-3', category: 'Marketing', amount: 15000, description: 'Ayurvedic wellness social media promo campaign', date: new Date(Date.now() - 10*24*60*60*1000).toISOString(), assignedTo: 'U-admin', createdAt: new Date(Date.now() - 10*24*60*60*1000).toISOString() }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // ── Original fetches ──────────────────────────────────────────────────
    // Fetch Leads with local merge fallback
    let fetchedLeads = [];
    try {
      const { data, error } = await supabase.from('leads').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedLeads = data || [];
    } catch (err) {
      console.warn("Supabase fetch leads failed, using local fallback.", err);
    }
    const localLeadsStr = localStorage.getItem('prismora_leads');
    if (localLeadsStr) {
      const localLeads = JSON.parse(localLeadsStr);
      const remoteIds = new Set(fetchedLeads.map(l => l.id));
      const localOnly = localLeads.filter(l => !remoteIds.has(l.id));
      fetchedLeads = [...localOnly, ...fetchedLeads];
    } else if (fetchedLeads.length === 0) {
      fetchedLeads = DEFAULT_LEADS;
      localStorage.setItem('prismora_leads', JSON.stringify(fetchedLeads));
    }
    setLeads(fetchedLeads);

    // Fetch Orders with local merge fallback
    let fetchedOrders = [];
    try {
      const { data, error } = await supabase.from('orders').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedOrders = data || [];
    } catch (err) {
      console.warn("Supabase fetch orders failed, using local fallback.", err);
    }
    const localOrdersStr = localStorage.getItem('prismora_orders');
    if (localOrdersStr) {
      const localOrders = JSON.parse(localOrdersStr);
      const remoteIds = new Set(fetchedOrders.map(o => o.id));
      const localOnly = localOrders.filter(o => !remoteIds.has(o.id));
      fetchedOrders = [...localOnly, ...fetchedOrders];
    } else if (fetchedOrders.length === 0) {
      fetchedOrders = DEFAULT_ORDERS;
      localStorage.setItem('prismora_orders', JSON.stringify(fetchedOrders));
    }
    setOrders(fetchedOrders);

    const { data: eventsData } = await supabase.from('events').select('*').order('timestamp', { ascending: false });
    if (eventsData) setEventLog(eventsData);

    let fetchedCatalog = [];
    try {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      fetchedCatalog = data || [];
      if (fetchedCatalog.length === 0) {
        const local = localStorage.getItem('prismora_product_catalog');
        fetchedCatalog = local ? JSON.parse(local) : DEFAULT_CATALOG;
        localStorage.setItem('prismora_product_catalog', JSON.stringify(fetchedCatalog));
      }
    } catch {
      const local = localStorage.getItem('prismora_product_catalog');
      fetchedCatalog = local ? JSON.parse(local) : DEFAULT_CATALOG;
      if (!local) localStorage.setItem('prismora_product_catalog', JSON.stringify(fetchedCatalog));
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
    setProductCatalog(normalizedCatalog);
    setProducts(normalizedCatalog.map(p => p.name));
    localStorage.setItem('prismora_product_catalog', JSON.stringify(normalizedCatalog));

    // Fetch Invoices with fallback
    let fetchedInvoices = [];
    try {
      const { data, error } = await supabase.from('invoices').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedInvoices = data || [];
      if (fetchedInvoices.length === 0) {
        const local = localStorage.getItem('prismora_invoices');
        fetchedInvoices = local ? JSON.parse(local) : DEFAULT_INVOICES;
        localStorage.setItem('prismora_invoices', JSON.stringify(fetchedInvoices));
      }
    } catch (err) {
      console.warn('Supabase invoices table fetch failed, using localStorage fallback.', err);
      const local = localStorage.getItem('prismora_invoices');
      fetchedInvoices = local ? JSON.parse(local) : DEFAULT_INVOICES;
      if (!local) localStorage.setItem('prismora_invoices', JSON.stringify(fetchedInvoices));
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

    setInvoices(processedInvoices);
    localStorage.setItem('prismora_invoices', JSON.stringify(processedInvoices));

    // ── Credit Notes ──
    let fetchedCreditNotes = [];
    try {
      const { data, error } = await supabase.from('credit_notes').select('*').order('createdAt', { ascending: false });
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
    setCreditNotes(fetchedCreditNotes);

    // Async update transitioned invoices back to Supabase
    processedInvoices.forEach(async (inv) => {
      const original = fetchedInvoices.find(orig => orig.id === inv.id);
      if (original && original.status === 'Unpaid' && inv.status === 'Overdue') {
        try { await supabase.from('invoices').update({ status: 'Overdue' }).eq('id', inv.id); } catch { /* ok */ }
      }
    });

    // Fetch Expenses with fallback
    let fetchedExpenses = [];
    try {
      const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (error) throw error;
      fetchedExpenses = data || [];
      if (fetchedExpenses.length === 0) {
        const local = localStorage.getItem('prismora_expenses');
        fetchedExpenses = local ? JSON.parse(local) : DEFAULT_EXPENSES;
        localStorage.setItem('prismora_expenses', JSON.stringify(fetchedExpenses));
      }
    } catch (err) {
      console.warn('Supabase expenses table fetch failed, using localStorage fallback.', err);
      const local = localStorage.getItem('prismora_expenses');
      fetchedExpenses = local ? JSON.parse(local) : DEFAULT_EXPENSES;
      if (!local) localStorage.setItem('prismora_expenses', JSON.stringify(fetchedExpenses));
    }
    setExpenses(fetchedExpenses);

    // ── Phase 1 fetches — localStorage-backed fallbacks ──────────────────

    // Default seed data for when tables don't exist yet
    const DEFAULT_VENDOR = { id: 'V1', name: 'Janki Herbals', gstin: '24AAACJ1234M1Z5', phone: '9876543200', email: 'orders@jankiherbals.com', address: '112, GIDC Industrial Estate, Anand, Gujarat - 388001', contactPerson: 'Janki Shah', outstandingAmount: 0, status: 'Active', createdAt: new Date().toISOString() };

    // ── Inventory ──
    let fetchedInventory = [];
    try {
      const { data, error } = await supabase.from('inventory').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedInventory = data || [];
      if (fetchedInventory.length === 0) {
        const local = localStorage.getItem('prismora_inventory');
        fetchedInventory = local ? JSON.parse(local) : DEFAULT_INVENTORY;
        localStorage.setItem('prismora_inventory', JSON.stringify(fetchedInventory));
      }
    } catch {
      const local = localStorage.getItem('prismora_inventory');
      fetchedInventory = local ? JSON.parse(local) : DEFAULT_INVENTORY;
      if (!local) localStorage.setItem('prismora_inventory', JSON.stringify(fetchedInventory));
    }
    setInventory(fetchedInventory);

    // ── Vendors ──
    let fetchedVendors = [];
    try {
      const { data, error } = await supabase.from('vendors').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedVendors = data || [];
      if (fetchedVendors.length === 0) {
        const local = localStorage.getItem('prismora_vendors');
        fetchedVendors = local ? JSON.parse(local) : [DEFAULT_VENDOR];
        localStorage.setItem('prismora_vendors', JSON.stringify(fetchedVendors));
      }
    } catch {
      const local = localStorage.getItem('prismora_vendors');
      fetchedVendors = local ? JSON.parse(local) : [DEFAULT_VENDOR];
      if (!local) localStorage.setItem('prismora_vendors', JSON.stringify(fetchedVendors));
    }
    setVendors(fetchedVendors);

    // ── Vendor Payments ──
    let fetchedVendorPayments = [];
    try {
      const { data, error } = await supabase.from('vendor_payments').select('*').order('createdAt', { ascending: false });
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
    setVendorPayments(fetchedVendorPayments);

    // ── Purchase Returns ──
    let fetchedReturns = [];
    try {
      const { data, error } = await supabase.from('purchase_returns').select('*').order('createdAt', { ascending: false });
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
    setPurchaseReturns(fetchedReturns);

    // ── Purchase Orders ──
    let fetchedPOs = [];
    try {
      const { data, error } = await supabase.from('purchase_orders').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedPOs = data || [];
      if (fetchedPOs.length === 0) {
        const local = localStorage.getItem('prismora_purchase_orders');
        fetchedPOs = local ? JSON.parse(local) : DEFAULT_PURCHASE_ORDERS;
        localStorage.setItem('prismora_purchase_orders', JSON.stringify(fetchedPOs));
      }
    } catch {
      const local = localStorage.getItem('prismora_purchase_orders');
      fetchedPOs = local ? JSON.parse(local) : DEFAULT_PURCHASE_ORDERS;
      if (!local) localStorage.setItem('prismora_purchase_orders', JSON.stringify(fetchedPOs));
    }
    setPurchaseOrders(fetchedPOs);

    // ── GRN ──
    let fetchedGRN = [];
    try {
      const { data, error } = await supabase.from('grn').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedGRN = data || [];
      if (fetchedGRN.length === 0) {
        const local = localStorage.getItem('prismora_grn');
        fetchedGRN = local ? JSON.parse(local) : DEFAULT_GRN;
        localStorage.setItem('prismora_grn', JSON.stringify(fetchedGRN));
      }
    } catch {
      const local = localStorage.getItem('prismora_grn');
      fetchedGRN = local ? JSON.parse(local) : DEFAULT_GRN;
      if (!local) localStorage.setItem('prismora_grn', JSON.stringify(fetchedGRN));
    }
    setGrn(fetchedGRN);

    // ── Distributors ──
    let fetchedDist = [];
    try {
      const { data, error } = await supabase.from('distributors').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedDist = data || [];
      if (fetchedDist.length === 0) {
        const local = localStorage.getItem('prismora_distributors');
        fetchedDist = local ? JSON.parse(local) : DEFAULT_DISTRIBUTORS;
        localStorage.setItem('prismora_distributors', JSON.stringify(fetchedDist));
      }
    } catch {
      const local = localStorage.getItem('prismora_distributors');
      fetchedDist = local ? JSON.parse(local) : DEFAULT_DISTRIBUTORS;
      if (!local) localStorage.setItem('prismora_distributors', JSON.stringify(fetchedDist));
    }
    setDistributors(fetchedDist);

    // ── Dealers ──
    let fetchedDealers = [];
    try {
      const { data, error } = await supabase.from('dealers').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedDealers = data || [];
      if (fetchedDealers.length === 0) {
        const local = localStorage.getItem('prismora_dealers');
        fetchedDealers = local ? JSON.parse(local) : DEFAULT_DEALERS;
        localStorage.setItem('prismora_dealers', JSON.stringify(fetchedDealers));
      }
    } catch {
      const local = localStorage.getItem('prismora_dealers');
      fetchedDealers = local ? JSON.parse(local) : DEFAULT_DEALERS;
      if (!local) localStorage.setItem('prismora_dealers', JSON.stringify(fetchedDealers));
    }
    setDealers(fetchedDealers);

    // ── Retailers ──
    let fetchedRetailers = [];
    try {
      const { data, error } = await supabase.from('retailers').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedRetailers = data || [];
      if (fetchedRetailers.length === 0) {
        const local = localStorage.getItem('prismora_retailers');
        fetchedRetailers = local ? JSON.parse(local) : DEFAULT_RETAILERS;
        localStorage.setItem('prismora_retailers', JSON.stringify(fetchedRetailers));
      }
    } catch {
      const local = localStorage.getItem('prismora_retailers');
      fetchedRetailers = local ? JSON.parse(local) : DEFAULT_RETAILERS;
      if (!local) localStorage.setItem('prismora_retailers', JSON.stringify(fetchedRetailers));
    }
    setRetailers(fetchedRetailers);

    // ── Schemes ──
    let fetchedSchemes = [];
    try {
      const { data, error } = await supabase.from('schemes').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedSchemes = data || [];
      if (fetchedSchemes.length === 0) {
        const local = localStorage.getItem('prismora_schemes');
        fetchedSchemes = local ? JSON.parse(local) : DEFAULT_SCHEMES;
        localStorage.setItem('prismora_schemes', JSON.stringify(fetchedSchemes));
      }
    } catch {
      const local = localStorage.getItem('prismora_schemes');
      fetchedSchemes = local ? JSON.parse(local) : DEFAULT_SCHEMES;
      if (!local) localStorage.setItem('prismora_schemes', JSON.stringify(fetchedSchemes));
    }
    setSchemes(fetchedSchemes);

    try {
      const { data, error } = await supabase.from('complaints').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      const fetchedComplaints = data || [];
      if (fetchedComplaints.length === 0) {
        const local = localStorage.getItem('prismora_complaints');
        const finalComplaints = local ? JSON.parse(local) : DEFAULT_COMPLAINTS;
        setComplaints(finalComplaints);
        localStorage.setItem('prismora_complaints', JSON.stringify(finalComplaints));
      } else {
        setComplaints(fetchedComplaints);
      }
    } catch {
      const local = localStorage.getItem('prismora_complaints');
      const finalComplaints = local ? JSON.parse(local) : DEFAULT_COMPLAINTS;
      setComplaints(finalComplaints);
      if (!local) localStorage.setItem('prismora_complaints', JSON.stringify(finalComplaints));
    }

    // ── Territories ──
    let fetchedTerritories = [];
    try {
      const { data, error } = await supabase.from('territories').select('*');
      if (error) throw error;
      fetchedTerritories = data || [];
      if (fetchedTerritories.length === 0) {
        const local = localStorage.getItem('prismora_territories');
        fetchedTerritories = local ? JSON.parse(local) : DEFAULT_TERRITORIES;
        localStorage.setItem('prismora_territories', JSON.stringify(fetchedTerritories));
      }
    } catch {
      const local = localStorage.getItem('prismora_territories');
      fetchedTerritories = local ? JSON.parse(local) : DEFAULT_TERRITORIES;
      if (!local) localStorage.setItem('prismora_territories', JSON.stringify(fetchedTerritories));
    }
    setTerritories(fetchedTerritories);

    // ── SFA Beat Plans ──
    let fetchedBeats = [];
    try {
      const { data, error } = await supabase.from('beat_plans').select('*').order('date', { ascending: false });
      if (error) throw error;
      fetchedBeats = data || [];
      if (fetchedBeats.length === 0) {
        const local = localStorage.getItem('prismora_beat_plans');
        fetchedBeats = local ? JSON.parse(local) : DEFAULT_BEAT_PLANS;
        localStorage.setItem('prismora_beat_plans', JSON.stringify(fetchedBeats));
      }
    } catch {
      const local = localStorage.getItem('prismora_beat_plans');
      fetchedBeats = local ? JSON.parse(local) : DEFAULT_BEAT_PLANS;
      if (!local) localStorage.setItem('prismora_beat_plans', JSON.stringify(fetchedBeats));
    }
    setBeatPlans(fetchedBeats);

    // ── SFA Attendance ──
    let fetchedAttendance = [];
    try {
      const { data, error } = await supabase.from('attendance').select('*').order('date', { ascending: false });
      if (error) throw error;
      fetchedAttendance = data || [];
      if (fetchedAttendance.length === 0) {
        const local = localStorage.getItem('prismora_attendance');
        fetchedAttendance = local ? JSON.parse(local) : DEFAULT_ATTENDANCE;
        localStorage.setItem('prismora_attendance', JSON.stringify(fetchedAttendance));
      }
    } catch {
      const local = localStorage.getItem('prismora_attendance');
      fetchedAttendance = local ? JSON.parse(local) : DEFAULT_ATTENDANCE;
      if (!local) localStorage.setItem('prismora_attendance', JSON.stringify(fetchedAttendance));
    }
    setAttendance(fetchedAttendance);

    // ── SFA Visit Reports ──
    let fetchedVisits = [];
    try {
      const { data, error } = await supabase.from('visit_reports').select('*').order('visitDate', { ascending: false });
      if (error) throw error;
      fetchedVisits = data || [];
      if (fetchedVisits.length === 0) {
        const local = localStorage.getItem('prismora_visit_reports');
        fetchedVisits = local ? JSON.parse(local) : DEFAULT_VISIT_REPORTS;
        localStorage.setItem('prismora_visit_reports', JSON.stringify(fetchedVisits));
      }
    } catch {
      const local = localStorage.getItem('prismora_visit_reports');
      fetchedVisits = local ? JSON.parse(local) : DEFAULT_VISIT_REPORTS;
      if (!local) localStorage.setItem('prismora_visit_reports', JSON.stringify(fetchedVisits));
    }
    setVisitReports(fetchedVisits);

    // ── Distributor Payments ──
    let fetchedPayments = [];
    try {
      const { data, error } = await supabase.from('distributor_payments').select('*').order('createdAt', { ascending: false });
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
    setDistributorPayments(fetchedPayments);

    // ── Scheme Claims ──
    let fetchedClaims = [];
    try {
      const { data, error } = await supabase.from('scheme_claims').select('*').order('createdAt', { ascending: false });
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
    setSchemeClaims(fetchedClaims);

    // ── Distributor Incentives ──
    let fetchedIncentives = [];
    try {
      const { data, error } = await supabase.from('distributor_incentives').select('*').order('createdAt', { ascending: false });
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
    setDistributorIncentives(fetchedIncentives);
  };

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
    const newId = `L${maxId + 1}`;
    const newLead = { ...lead, id: newId, createdAt: new Date().toISOString() };
    const next = [newLead, ...leads];
    setLeads(next);
    localStorage.setItem('prismora_leads', JSON.stringify(next));
    try { await supabase.from('leads').insert([newLead]); } catch { /* ok */ }
    logEvent('lead_new', `New Lead added: ${lead.name}`, lead.assignedTo, newId);
  };

  const updateLead = async (id, updatedData) => {
    const oldLead = leads.find(l => l.id === id);
    let next = leads.map(l => l.id === id ? { ...l, ...updatedData } : l);
    
    let shouldCreateOrder = false;
    let shouldCancelOrder = false;
    
    if (oldLead && oldLead.status !== updatedData.status) {
      const isConversionStatus = (s) => ['Converted', 'First Order', 'Active'].includes(s);
      const wasConverted = isConversionStatus(oldLead.status);
      const isConvertedNow = isConversionStatus(updatedData.status);
      
      if (isConvertedNow && !wasConverted && !oldLead.orderCreated) {
        shouldCreateOrder = true;
        updatedData.orderCreated = true;
        next = leads.map(l => l.id === id ? { ...l, ...updatedData } : l);
      } else if (!isConvertedNow && wasConverted) {
        shouldCancelOrder = true;
        updatedData.orderCreated = false;
        next = leads.map(l => l.id === id ? { ...l, ...updatedData } : l);
      }
    }

    setLeads(next);
    localStorage.setItem('prismora_leads', JSON.stringify(next));
    try { await supabase.from('leads').update(updatedData).eq('id', id); } catch { /* ok */ }
    
    if (oldLead && oldLead.status !== updatedData.status) {
      if (shouldCreateOrder) {
        logEvent('lead_converted', `Lead Converted: ${updatedData.name || oldLead.name}`, updatedData.assignedTo || oldLead.assignedTo, id);
        
        // ── Auto-create corresponding Order ──────────────────────────────────
        const finalLead = { ...oldLead, ...updatedData };
        const assignedSp = finalLead.assignedTo || 'U-sales-1';

        const productInterest = Array.isArray(finalLead.productInterest) 
          ? finalLead.productInterest 
          : (finalLead.productInterest ? [finalLead.productInterest] : []);
        const targetProduct = productInterest[0] || 'Herbal Hair Oil 100ml';

        const newOrder = {
          customerName: finalLead.name,
          companyName: finalLead.company || '',
          product: targetProduct,
          quantity: 1,
          value: Number(finalLead.dealValue || 0),
          state: finalLead.state || 'Gujarat',
          city: finalLead.city || 'Ahmedabad',
          status: 'Pending',
          assignedTo: assignedSp,
          date: new Date().toISOString(),
          phone: finalLead.phone || '',
          email: finalLead.email || ''
        };

        // Reuse the exact addOrder logic inline to prevent duplicate maxId logic issues
        const maxId = orders.reduce((max, o) => {
          const num = parseInt(o.id.replace('O', ''), 10);
          return !isNaN(num) && num > max ? num : max;
        }, 0);
        const newOrderId = `O${maxId + 1}`;
        const newOrderObj = { ...newOrder, id: newOrderId, createdAt: new Date().toISOString() };
        
        setOrders(prev => {
          const nextOrders = [newOrderObj, ...prev];
          localStorage.setItem('prismora_orders', JSON.stringify(nextOrders));
          return nextOrders;
        });
        
        try { await supabase.from('orders').insert([newOrderObj]); } catch { /* ok */ }
        logEvent('order_created', `Auto-order ${newOrderId} created from converted lead`, assignedSp, newOrderId);
      } else if (shouldCancelOrder) {
        const targetOrder = orders.find(o => 
          o.customerName === oldLead.name && 
          o.companyName === (oldLead.company || '') && 
          o.status === 'Pending'
        );
        if (targetOrder) {
          logEvent('lead_rollback', `Lead rolled back from conversion: ${oldLead.name}. Auto-created pending order ${targetOrder.id} removed.`, updatedData.assignedTo || oldLead.assignedTo, id);
          
          setOrders(prev => {
            const nextOrders = prev.filter(o => o.id !== targetOrder.id);
            localStorage.setItem('prismora_orders', JSON.stringify(nextOrders));
            return nextOrders;
          });
          
          try {
            await supabase.from('orders').delete().eq('id', targetOrder.id);
          } catch (err) {
            console.error("Failed to delete rolled back order from Supabase:", err);
          }
        }
      } else if (updatedData.status === 'Lost') {
        logEvent('lead_lost', `Lead Lost: ${updatedData.name || oldLead.name}`, updatedData.assignedTo || oldLead.assignedTo, id);
      }
    }
  };

  const deleteLead = async (id) => {
    const next = leads.filter(l => l.id !== id);
    setLeads(next);
    localStorage.setItem('prismora_leads', JSON.stringify(next));
    try { await supabase.from('leads').delete().eq('id', id); } catch { /* ok */ }
  };

  // ── Orders ───────────────────────────────────────────────────────────────
  const addOrder = async (order) => {
    const maxId = orders.reduce((max, o) => {
      const num = parseInt(o.id.replace('O', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `O${maxId + 1}`;
    const newOrder = { ...order, id: newId, createdAt: new Date().toISOString() };
    const next = [newOrder, ...orders];
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    try { await supabase.from('orders').insert([newOrder]); } catch { /* ok */ }
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
        .sort((a, b) => new Date(a.expiryDate || 0) - new Date(b.expiryDate || 0));

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
        try { await supabase.from('inventory').update({ quantity: newQty }).eq('id', batch.id); } catch { /* ok */ }
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
    try { await supabase.from('orders').update(updatedData).eq('id', id); } catch { /* ok */ }
    if (oldOrder && oldOrder.status !== updatedData.status) {
      if (updatedData.status === 'Processing') {
        logEvent('order_processing', `Order Processing: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Ready for Dispatch') {
        logEvent('order_ready_for_dispatch', `Order Ready for Dispatch: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Shipped') {
        logEvent('order_shipped', `Order Shipped: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Delivered') {
        logEvent('order_delivered', `Order Delivered: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
        const finalOrder = { ...oldOrder, ...updatedData, id };
        await deductInventoryForOrder(finalOrder);
        if (finalOrder.distributorId || finalOrder.dealerId || finalOrder.retailerId) await billPartyForOrder(finalOrder);
      }
    }
  };

  // Partial delivery: record that `deliverQty` more units of a (single-product)
  // order were physically delivered now. Deducts that stock, tracks cumulative
  // deliveredQty, and flips the order to "Partially Delivered" until the full
  // ordered quantity is met — at which point it becomes "Delivered" and bills.
  const deliverPartial = async (id, deliverQty) => {
    const order = orders.find(o => o.id === id);
    if (!order || deliverQty <= 0) return;
    const totalQty = Number(order.quantity || 0);
    const already = Number(order.deliveredQty || 0);
    const newDelivered = Math.min(totalQty, already + Number(deliverQty));
    const actualNow = newDelivered - already;
    if (actualNow <= 0) return;
    const fullyDone = newDelivered >= totalQty;
    const updatedData = { deliveredQty: newDelivered, status: fullyDone ? 'Delivered' : 'Partially Delivered' };

    const next = orders.map(o => o.id === id ? { ...o, ...updatedData } : o);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    try { await supabase.from('orders').update(updatedData).eq('id', id); } catch { /* ok */ }

    // Deduct only the units delivered in this instalment (single product)
    await deductInventoryForOrder({ ...order, items: undefined, product: order.product, quantity: actualNow, id });
    logEvent('order_partial_delivery', `Order ${id}: delivered ${actualNow} of ${totalQty} (${newDelivered}/${totalQty} cumulative)`, order.assignedTo, id);

    // Bill only once fully delivered (avoids partial-invoice complexity)
    if (fullyDone && (order.distributorId || order.dealerId || order.retailerId)) {
      await billPartyForOrder({ ...order, ...updatedData });
    }
  };

  // Generates an invoice for a delivered distributor/dealer order and adds its
  // value to that party's Outstanding balance — without this, orders never
  // show up as money owed anywhere in the app.
  const billPartyForOrder = async (order) => {
    const newInvoiceId = `INV-${Date.now()}`;
    const newInvoice = {
      id: newInvoiceId,
      orderId: order.id,
      customerName: order.customerName,
      amount: Number(order.value || 0),
      tax: 0,
      status: 'Unpaid',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      assignedTo: order.assignedTo,
      createdAt: new Date().toISOString()
    };
    setInvoices(prev => [newInvoice, ...prev]);
    localStorage.setItem('prismora_invoices', JSON.stringify([newInvoice, ...invoices]));
    try { await supabase.from('invoices').insert([newInvoice]); } catch { /* ok */ }
    logEvent('invoice_new', `Invoice generated for ${order.customerName}: ${newInvoiceId}`, order.assignedTo, newInvoiceId);

    if (order.distributorId) {
      const dist = distributors.find(d => d.id === order.distributorId);
      if (dist) {
        const newOutstanding = (dist.outstandingAmount || 0) + Number(order.value || 0);
        const nextDist = distributors.map(d => d.id === dist.id ? { ...d, outstandingAmount: newOutstanding } : d);
        setDistributors(nextDist);
        localStorage.setItem('prismora_distributors', JSON.stringify(nextDist));
        try { await supabase.from('distributors').update({ outstandingAmount: newOutstanding }).eq('id', dist.id); } catch { /* ok */ }
      }
    } else if (order.dealerId) {
      const dealer = dealers.find(d => d.id === order.dealerId);
      if (dealer) {
        const newOutstanding = (dealer.outstandingAmount || 0) + Number(order.value || 0);
        const nextDealers = dealers.map(d => d.id === dealer.id ? { ...d, outstandingAmount: newOutstanding } : d);
        setDealers(nextDealers);
        localStorage.setItem('prismora_dealers', JSON.stringify(nextDealers));
        try { await supabase.from('dealers').update({ outstandingAmount: newOutstanding }).eq('id', dealer.id); } catch { /* ok */ }
      }
    } else if (order.retailerId) {
      const retailer = retailers.find(r => r.id === order.retailerId);
      if (retailer) {
        const newOutstanding = (retailer.outstandingAmount || 0) + Number(order.value || 0);
        const nextRetailers = retailers.map(r => r.id === retailer.id ? { ...r, outstandingAmount: newOutstanding } : r);
        setRetailers(nextRetailers);
        localStorage.setItem('prismora_retailers', JSON.stringify(nextRetailers));
        try { await supabase.from('retailers').update({ outstandingAmount: newOutstanding }).eq('id', retailer.id); } catch { /* ok */ }
      }
    }
  };

  const deleteOrder = async (id) => {
    const next = orders.filter(o => o.id !== id);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    try { await supabase.from('orders').delete().eq('id', id); } catch { /* ok */ }
  };

  // Lets a distributor self-acknowledge physical receipt of an order —
  // separate from internal staff marking it "Delivered".
  const confirmOrderReceipt = async (id) => {
    const order = orders.find(o => o.id === id);
    const receivedAt = new Date().toISOString();
    const next = orders.map(o => o.id === id ? { ...o, receivedByDistributor: true, receivedAt } : o);
    setOrders(next);
    localStorage.setItem('prismora_orders', JSON.stringify(next));
    try { await supabase.from('orders').update({ receivedByDistributor: true, receivedAt }).eq('id', id); } catch { /* ok */ }
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
    try { await supabase.from('orders').insert([splitOrderObj]); } catch { /* ok */ }
    try { await supabase.from('orders').update(updatedOriginal).eq('id', id); } catch { /* ok */ }
    logEvent('order_split', `Order ${id} split — ${updatedOriginal.quantity} unit(s) proceeding now, ${splitOrderObj.quantity} unit(s) moved to new order ${newOrderId} pending restock`, order.assignedTo, id);
  };

  // ── Products ─────────────────────────────────────────────────────────────
  const addProduct = async (productData) => {
    const newId = `P${Date.now()}`;
    const newProduct = { ...productData, id: newId, createdAt: new Date().toISOString() };
    
    setProductCatalog(prev => {
      const next = [newProduct, ...prev];
      localStorage.setItem('prismora_product_catalog', JSON.stringify(next));
      return next;
    });
    
    setProducts(prev => {
      if (!prev.includes(productData.name)) {
        return [...prev, productData.name];
      }
      return prev;
    });

    try { await supabase.from('products').insert([newProduct]); }
    catch { /* ok */ }
    logEvent('product_added', `Added product: ${productData.name}`, null, newId);
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

    try { await supabase.from('products').update(updatedData).eq('id', id); }
    catch { /* ok */ }
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

    try { await supabase.from('products').delete().eq('id', id); }
    catch { /* ok */ }
  };

  // ── Invoices ─────────────────────────────────────────────────────────────
  const addInvoice = async (invoiceData) => {
    const maxId = invoices.reduce((max, inv) => {
      const num = parseInt(inv.id.replace('INV-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `INV-${maxId + 1}`;
    const newInvoice = { ...invoiceData, id: newId, createdAt: new Date().toISOString() };
    setInvoices(prev => [newInvoice, ...prev]);
    try {
      const { error } = await supabase.from('invoices').insert([newInvoice]);
      if (error) {
        if (error.code === '42703' || (error.message && error.message.includes('assignedTo'))) {
          const { assignedTo, ...cleanInvoice } = newInvoice;
          const { error: retryError } = await supabase.from('invoices').insert([cleanInvoice]);
          if (retryError) throw retryError;
        } else throw error;
      }
      const local = localStorage.getItem('prismora_invoices');
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem('prismora_invoices', JSON.stringify([newInvoice, ...existing]));
    } catch (err) {
      console.warn('Failed to insert invoice to Supabase. Saving to localStorage.', err);
      const local = localStorage.getItem('prismora_invoices');
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem('prismora_invoices', JSON.stringify([newInvoice, ...existing]));
    }
    logEvent('invoice_new', `Invoice generated for ${invoiceData.customerName}: ${newId}`, invoiceData.assignedTo, newId);
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
    try { await supabase.from('credit_notes').insert([newCN]); } catch { /* ok */ }

    const amount = Number(cnData.amount || 0);
    const name = (cnData.customerName || '').toLowerCase();
    const applyCredit = (list, setter, table) => {
      const match = list.find(p => (p.name || '').toLowerCase() === name);
      if (!match) return false;
      const newOutstanding = Math.max(0, (match.outstandingAmount || 0) - amount);
      const next = list.map(p => p.id === match.id ? { ...p, outstandingAmount: newOutstanding } : p);
      setter(next);
      localStorage.setItem(`prismora_${table}`, JSON.stringify(next));
      try { supabase.from(table).update({ outstandingAmount: newOutstanding }).eq('id', match.id); } catch { /* ok */ }
      return true;
    };
    // Match against whichever channel the customer belongs to
    applyCredit(distributors, setDistributors, 'distributors') ||
      applyCredit(dealers, setDealers, 'dealers') ||
      applyCredit(retailers, setRetailers, 'retailers');

    logEvent('credit_note', `Credit note ${newId} issued to ${cnData.customerName} for ₹${amount} (${cnData.reason || 'adjustment'})`, cnData.recordedBy, newId);
  };

  // ── Expenses ─────────────────────────────────────────────────────────────
  const addExpense = async (expenseData) => {
    const maxId = expenses.reduce((max, exp) => {
      const num = parseInt(exp.id.replace('EXP-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `EXP-${maxId + 1}`;
    const newExpense = { ...expenseData, id: newId, createdAt: new Date().toISOString() };
    setExpenses(prev => [newExpense, ...prev]);
    try { await supabase.from('expenses').insert([newExpense]); }
    catch (err) { console.warn('Failed to insert expense to Supabase.', err); }
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
    try { await supabase.from('inventory').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteInventoryItem = async (id) => {
    const item = inventory.find(i => i.id === id);
    setInventory(prev => {
      const next = prev.filter(i => i.id !== id);
      localStorage.setItem('prismora_inventory', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('inventory').delete().eq('id', id); }
    catch { /* ok */ }
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
    try { await supabase.from('inventory').update({ quantity: newQty }).eq('id', id); }
    catch { /* ok */ }
    logEvent('stock_adjusted', `Stock ${adjustment > 0 ? '+' : ''}${adjustment} for ${item.product}: ${reason}`, null, id);
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

    try { await supabase.from('inventory').update({ quantity: newSrcQty }).eq('id', batchId); } catch { /* ok */ }
    if (dest) { try { await supabase.from('inventory').update({ quantity: dest.quantity + qty }).eq('id', dest.id); } catch { /* ok */ } }
    else { try { await supabase.from('inventory').insert([newDestItem]); } catch { /* ok */ } }
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
    try { await supabase.from('vendors').insert([newVendor]); }
    catch { /* ok */ }
    logEvent('vendor_added', `Vendor added: ${vendorData.name}`, null, newId);
  };

  const updateVendor = async (id, updatedData) => {
    setVendors(prev => {
      const next = prev.map(v => v.id === id ? { ...v, ...updatedData } : v);
      localStorage.setItem('prismora_vendors', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('vendors').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteVendor = async (id) => {
    setVendors(prev => {
      const next = prev.filter(v => v.id !== id);
      localStorage.setItem('prismora_vendors', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('vendors').delete().eq('id', id); }
    catch { /* ok */ }
  };

  // ── Purchase Orders ───────────────────────────────────────────────────────
  const addPurchaseOrder = async (poData) => {
    const maxId = purchaseOrders.reduce((max, po) => {
      const num = parseInt(po.id.replace('PO-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `PO-${maxId + 1}`;
    const newPO = { ...poData, id: newId, status: 'Draft', createdAt: new Date().toISOString() };
    setPurchaseOrders(prev => {
      const next = [newPO, ...prev];
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('purchase_orders').insert([newPO]); }
    catch { /* ok */ }
    logEvent('po_created', `Purchase Order ${newId} created for ${poData.vendorName}`, poData.assignedTo, newId);
  };

  const updatePurchaseOrderStatus = async (id, status) => {
    setPurchaseOrders(prev => {
      const next = prev.map(po => po.id === id ? { ...po, status } : po);
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('purchase_orders').update({ status }).eq('id', id); }
    catch { /* ok */ }
    logEvent('po_status_update', `Purchase Order ${id} → ${status}`, null, id);
  };

  const deletePurchaseOrder = async (id) => {
    setPurchaseOrders(prev => {
      const next = prev.filter(po => po.id !== id);
      localStorage.setItem('prismora_purchase_orders', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('purchase_orders').delete().eq('id', id); }
    catch { /* ok */ }
  };

  // ── GRN ───────────────────────────────────────────────────────────────────
  const addGRN = async (grnData) => {
    const maxId = grn.reduce((max, g) => {
      const num = parseInt(g.id.replace('GRN-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `GRN-${maxId + 1}`;
    const newGRN = { ...grnData, id: newId, createdAt: new Date().toISOString() };
    setGrn(prev => {
      const next = [newGRN, ...prev];
      localStorage.setItem('prismora_grn', JSON.stringify(next));
      return next;
    });
    try {
      await supabase.from('grn').insert([newGRN]);
      if (grnData.poId) updatePurchaseOrderStatus(grnData.poId, 'GRN Done');
    } catch { if (grnData.poId) updatePurchaseOrderStatus(grnData.poId, 'GRN Done'); }
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
      try { await supabase.from('vendors').update({ outstandingAmount: newOutstanding }).eq('id', vendor.id); } catch { /* ok */ }
    }
  };

  // ── Vendor Payments ───────────────────────────────────────────────────────
  const addVendorPayment = async (paymentData) => {
    const newId = `VPAY-${Date.now()}`;
    const newPayment = { ...paymentData, id: newId, createdAt: new Date().toISOString() };
    setVendorPayments(prev => {
      const next = [newPayment, ...prev];
      localStorage.setItem('prismora_vendor_payments', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('vendor_payments').insert([newPayment]); } catch { /* ok */ }

    const vendor = vendors.find(v => v.id === paymentData.vendorId);
    if (vendor) {
      const newOutstanding = Math.max(0, (vendor.outstandingAmount || 0) - Number(paymentData.amount || 0));
      const nextVendors = vendors.map(v => v.id === vendor.id ? { ...v, outstandingAmount: newOutstanding } : v);
      setVendors(nextVendors);
      localStorage.setItem('prismora_vendors', JSON.stringify(nextVendors));
      try { await supabase.from('vendors').update({ outstandingAmount: newOutstanding }).eq('id', vendor.id); } catch { /* ok */ }
    }
    logEvent('vendor_payment', `Payment of ₹${paymentData.amount} recorded for ${vendor?.name || paymentData.vendorId}`, paymentData.recordedBy, newId);
  };

  // ── Purchase Returns ──────────────────────────────────────────────────────
  // Returning goods to a vendor reduces what we owe them (a credit on the
  // vendor ledger) and takes the returned units back out of inventory.
  const addPurchaseReturn = async (returnData) => {
    const newId = `PR-${Date.now()}`;
    const returnValue = (returnData.items || []).reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitCost || 0)), 0);
    const newReturn = { ...returnData, id: newId, value: returnValue, createdAt: new Date().toISOString() };
    setPurchaseReturns(prev => {
      const next = [newReturn, ...prev];
      localStorage.setItem('prismora_purchase_returns', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('purchase_returns').insert([newReturn]); } catch { /* ok */ }

    // Credit the vendor payable (we owe them less now)
    const vendor = vendors.find(v => v.id === returnData.vendorId);
    if (vendor && returnValue > 0) {
      const newOutstanding = Math.max(0, (vendor.outstandingAmount || 0) - returnValue);
      const nextVendors = vendors.map(v => v.id === vendor.id ? { ...v, outstandingAmount: newOutstanding } : v);
      setVendors(nextVendors);
      localStorage.setItem('prismora_vendors', JSON.stringify(nextVendors));
      try { await supabase.from('vendors').update({ outstandingAmount: newOutstanding }).eq('id', vendor.id); } catch { /* ok */ }
    }

    // Remove the returned units from inventory (goods physically leave)
    (returnData.items || []).forEach(item => {
      const qty = Number(item.quantity || 0);
      if (qty <= 0) return;
      const invItem = inventory.find(inv => inv.product?.toLowerCase() === item.product?.toLowerCase() && inv.quantity > 0);
      if (invItem) adjustStock(invItem.id, -qty, `Purchase return to ${vendor?.name || returnData.vendorName || 'vendor'}`);
    });

    logEvent('purchase_return', `Return ${newId} to ${vendor?.name || returnData.vendorName} — ₹${returnValue}`, returnData.recordedBy, newId);
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
    try { await supabase.from('distributors').insert([newDist]); }
    catch { /* ok */ }
    logEvent('distributor_added', `New distributor: ${distData.name} (${distData.territory})`, null, newId);
    return newId;
  };

  const updateDistributor = async (id, updatedData) => {
    setDistributors(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updatedData } : d);
      localStorage.setItem('prismora_distributors', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('distributors').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteDistributor = async (id) => {
    setDistributors(prev => {
      const next = prev.filter(d => d.id !== id);
      localStorage.setItem('prismora_distributors', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('distributors').delete().eq('id', id); }
    catch { /* ok */ }
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
    try { await supabase.from('dealers').insert([newDealer]); }
    catch { /* ok */ }
    logEvent('dealer_added', `New dealer: ${dealerData.name} (${dealerData.territory})`, null, newId);
    return newId;
  };

  const updateDealer = async (id, updatedData) => {
    setDealers(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updatedData } : d);
      localStorage.setItem('prismora_dealers', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('dealers').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteDealer = async (id) => {
    setDealers(prev => {
      const next = prev.filter(d => d.id !== id);
      localStorage.setItem('prismora_dealers', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('dealers').delete().eq('id', id); }
    catch { /* ok */ }
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
    try { await supabase.from('retailers').insert([newRetailer]); }
    catch { /* ok */ }
    logEvent('retailer_added', `New retailer: ${retailerData.name} (${retailerData.territory})`, null, newId);
    return newId;
  };

  const updateRetailer = async (id, updatedData) => {
    setRetailers(prev => {
      const next = prev.map(r => r.id === id ? { ...r, ...updatedData } : r);
      localStorage.setItem('prismora_retailers', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('retailers').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteRetailer = async (id) => {
    setRetailers(prev => {
      const next = prev.filter(r => r.id !== id);
      localStorage.setItem('prismora_retailers', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('retailers').delete().eq('id', id); }
    catch { /* ok */ }
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
    try { await supabase.from('schemes').insert([newScheme]); }
    catch { /* ok */ }
    logEvent('scheme_created', `Scheme created: ${schemeData.name}`, null, newId);
  };

  const updateScheme = async (id, updatedData) => {
    setSchemes(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updatedData } : s);
      localStorage.setItem('prismora_schemes', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('schemes').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteScheme = async (id) => {
    setSchemes(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem('prismora_schemes', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('schemes').delete().eq('id', id); }
    catch { /* ok */ }
  };

  // ── Complaints ────────────────────────────────────────────────────────────
  const addComplaint = async (complaintData) => {
    const maxId = complaints.reduce((max, c) => {
      const num = parseInt(c.id.replace('CMP-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `CMP-${maxId + 1}`;
    const newComplaint = { ...complaintData, id: newId, status: 'Registered', createdAt: new Date().toISOString() };
    setComplaints(prev => {
      const next = [newComplaint, ...prev];
      localStorage.setItem('prismora_complaints', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('complaints').insert([newComplaint]); }
    catch { /* ok */ }
    logEvent('complaint_registered', `Complaint ${newId}: ${complaintData.complaintType} by ${complaintData.customerName}`, complaintData.assignedTo, newId);
  };

  const updateComplaintStatus = async (id, status, resolution = '') => {
    setComplaints(prev => {
      const next = prev.map(c => c.id === id ? { ...c, status, resolution } : c);
      localStorage.setItem('prismora_complaints', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('complaints').update({ status, resolution }).eq('id', id); }
    catch { /* ok */ }
    logEvent('complaint_updated', `Complaint ${id} → ${status}`, null, id);
  };

  const deleteComplaint = async (id) => {
    setComplaints(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem('prismora_complaints', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('complaints').delete().eq('id', id); }
    catch { /* ok */ }
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
    try { await supabase.from('territories').insert([newTerritory]); }
    catch { /* ok */ }
    logEvent('territory_created', `Territory created: ${territoryData.name}`, null, newId);
  };

  const updateTerritory = async (id, updatedData) => {
    setTerritories(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updatedData } : t);
      localStorage.setItem('prismora_territories', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('territories').update(updatedData).eq('id', id); }
    catch { /* ok */ }
  };

  const deleteTerritory = async (id) => {
    setTerritories(prev => {
      const next = prev.filter(t => t.id !== id);
      localStorage.setItem('prismora_territories', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('territories').delete().eq('id', id); }
    catch { /* ok */ }
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
    try { await supabase.from('beat_plans').insert([newBeat]); } catch { /* ok */ }
    logEvent('beat_plan_created', `Beat Plan assigned for date ${beatData.date}`, beatData.executiveId, newId);
  };

  const updateBeatPlanStatus = async (id, status) => {
    setBeatPlans(prev => {
      const next = prev.map(b => b.id === id ? { ...b, status } : b);
      localStorage.setItem('prismora_beat_plans', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('beat_plans').update({ status }).eq('id', id); } catch { /* ok */ }
  };

  // ── SFA Attendance ────────────────────────────────────────────────────────
  const addAttendanceRecord = async (attendanceData) => {
    const newId = `ATT-${Date.now()}`;
    const newRecord = { ...attendanceData, id: newId, createdAt: new Date().toISOString() };
    setAttendance(prev => {
      const next = [newRecord, ...prev];
      localStorage.setItem('prismora_attendance', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('attendance').insert([newRecord]); } catch { /* ok */ }
    logEvent('attendance_checkin', `User checked in: ${attendanceData.status}`, attendanceData.userId, newId);
  };

  const updateAttendanceRecord = async (id, updatedData) => {
    setAttendance(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updatedData } : a);
      localStorage.setItem('prismora_attendance', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('attendance').update(updatedData).eq('id', id); } catch { /* ok */ }
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
    try { await supabase.from('visit_reports').insert([newReport]); } catch { /* ok */ }
    logEvent('visit_submitted', `Visit report logged for outlet: ${visitData.outletName}`, visitData.executiveId, newId);
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
    try { await supabase.from('sfa_expenses').insert([newExp]); } catch { /* ok */ }
  };

  const updateSFAExpense = async (id, updatedData) => {
    setSfaExpenses(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...updatedData } : e);
      localStorage.setItem('prismora_sfa_expenses', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('sfa_expenses').update(updatedData).eq('id', id); } catch { /* ok */ }
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
    try { await supabase.from('distributor_payments').insert([newPayment]); } catch { /* ok */ }

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
    try { await supabase.from('distributor_payments').insert([newPayment]); } catch { /* ok */ }

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
    try { await supabase.from('distributor_payments').insert([newPayment]); } catch { /* ok */ }

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
    try { await supabase.from('scheme_claims').insert([newClaim]); } catch { /* ok */ }
    logEvent('scheme_claim_submitted', `Scheme claim submitted for ${claimData.schemeName}`, null, newId);
  };

  const updateSchemeClaimStatus = async (id, status, reviewNotes = '') => {
    setSchemeClaims(prev => {
      const next = prev.map(c => c.id === id ? { ...c, status, reviewNotes } : c);
      localStorage.setItem('prismora_scheme_claims', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('scheme_claims').update({ status, reviewNotes }).eq('id', id); } catch { /* ok */ }
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
      try { await supabase.from('distributor_incentives').insert([newIncentive]); } catch { /* ok */ }
      logEvent('incentive_earned', `Incentive earned on order ${order.id} via scheme ${scheme.name}`, null, newId);
    });
  };

  const markIncentivePaid = async (id) => {
    setDistributorIncentives(prev => {
      const next = prev.map(i => i.id === id ? { ...i, status: 'Paid' } : i);
      localStorage.setItem('prismora_distributor_incentives', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('distributor_incentives').update({ status: 'Paid' }).eq('id', id); } catch { /* ok */ }
  };

  return (
    <DataContext.Provider value={{
      // Original CRM
      leads, orders, eventLog, products, productCatalog, invoices, expenses,
      addLead, updateLead, deleteLead,
      addOrder, updateOrder, deleteOrder, confirmOrderReceipt, splitOrder, deliverPartial,
      addProduct, updateProduct, deleteProduct,
      addInvoice, updateInvoiceStatus, deleteInvoice,
      creditNotes, addCreditNote,
      addExpense, deleteExpense,
      // Phase 1 Enterprise
      inventory, vendors, purchaseOrders, grn, distributors, dealers, retailers, schemes, complaints,
      addInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, transferStock,
      addVendor, updateVendor, deleteVendor,
      vendorPayments, addVendorPayment,
      purchaseReturns, addPurchaseReturn,
      addPurchaseOrder, updatePurchaseOrderStatus, deletePurchaseOrder,
      addGRN,
      addDistributor, updateDistributor, deleteDistributor,
      addDealer, updateDealer, deleteDealer,
      addRetailer, updateRetailer, deleteRetailer,
      addScheme, updateScheme, deleteScheme,
      addComplaint, updateComplaintStatus, deleteComplaint,
      // Phase 2 Enterprise
      territories, addTerritory, updateTerritory, deleteTerritory,
      beatPlans, addBeatPlan, updateBeatPlanStatus,
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

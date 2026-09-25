import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole, isAdminRole, isManagerRole } from '../context/AuthContext';
import { attributionFor } from '../utils/attribution';
import { isUnassigned } from '../utils/orderRouting';
import { format } from 'date-fns';
import { Plus, Edit2, Trash2, Download, Package, CheckCircle, ShoppingCart, ClipboardCheck, Undo2, X } from 'lucide-react';
import { PageHeader, DataTable, Button, IconButton, Badge, Select } from '../components/ui';
import { createPortal } from 'react-dom';
import { downloadCSV } from '../utils/exportUtils';
import { allParties } from '../utils/distributorUtils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { optionsFor, badgeStyle } from '../utils/masterLists';
import { canRecordReceipt, describeReceipt, receiptSourceOf, validateReceipt, RECEIPT_EVIDENCE } from '../utils/receipts';
import { useToast, useConfirm } from '../context/DialogContext';
import { missingDelivery } from '../utils/delivery';
import LastChanged from '../components/audit/LastChanged';


// Which role "owns" moving an order into a given status — enforces the
// Sales → Warehouse → Dispatch fulfillment hierarchy. Super Admin/Admin can
// always override.
const STATUS_STAGE_OWNERS = {
  'Processing': ['Sales Executive', 'Sales Manager', 'Sales', 'Manager'],
  'Ready for Dispatch': ['Warehouse Manager'],
  'Shipped': ['Dispatch Team'],
  'Delivered': ['Dispatch Team'],
  'Cancelled': ['Sales Executive', 'Sales Manager', 'Sales', 'Manager'],
};
const ADMIN_OVERRIDE_ROLES = ['Super Admin', 'Admin'];

const canSetOrderStatus = (role, targetStatus) => {
  if (ADMIN_OVERRIDE_ROLES.includes(role)) return true;
  if (targetStatus === 'Pending') return true;
  return (STATUS_STAGE_OWNERS[targetStatus] || []).includes(role);
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

const Orders = () => {
  const { orders, addOrder, updateOrder, deleteOrder, products, addProduct, leads, inventory, splitOrder, deliverPartial, recordOrderReceipt, clearOrderReceipt, distributors, dealers, retailers, productCatalog, masters } = useData();
  // From Master Lists. The stepper and the dropdown show the label; every
  // check in this file — STATUS_OWNERS, the stock guards, the delivery
  // branches — still compares the stored key, which cannot be renamed.
  const statusOptions = optionsFor(masters, 'order_status');
  const statuses = statusOptions.map(o => o.key);
  const labelForStatus = (k) => (statusOptions.find(o => o.key === k) || {}).label || k;
  const { user, users: mockUsers, canAccessData, getAssignableUsers } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [statusError, setStatusError] = useState('');
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);

  // Recording a receipt on a customer's behalf. Staff only: a party signed into
  // their own portal confirms it themselves, and that is the stronger claim.
  const toast = useToast();
  const confirm = useConfirm();
  const canStaffRecordReceipt = !['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [receiptForm, setReceiptForm] = useState({ evidence: '', note: '' });
  const [savingReceipt, setSavingReceipt] = useState(false);

  const openReceipt = (order) => {
    setReceiptOrder(order);
    setReceiptForm({ evidence: '', note: '' });
  };

  const withdrawReceipt = async (order) => {
    const ok = await confirm({
      title: 'Withdraw this receipt?',
      body: `${describeReceipt(order)}. Withdrawing it puts order ${order.id} back to awaiting acknowledgement, and the evidence is removed.`,
      confirmLabel: 'Withdraw',
      danger: true,
    });
    if (!ok) return;
    if (await clearOrderReceipt(order.id)) toast(`Receipt withdrawn from ${order.id}.`, 'success');
    else toast('The receipt could not be withdrawn. The reason is in the browser console.', 'error');
  };

  const submitReceipt = async (e) => {
    e.preventDefault();
    const check = validateReceipt(receiptForm);
    if (!check.ok) { toast(check.error, 'error'); return; }

    setSavingReceipt(true);
    const { ok, proofSaved, needsMigration } = await recordOrderReceipt(receiptOrder.id, {
      evidence: receiptForm.evidence,
      note: receiptForm.note,
      recordedBy: user?.name || 'Staff',
    });
    setSavingReceipt(false);

    if (needsMigration) {
      toast('The database cannot yet record who confirmed a delivery, so this would be filed as the customer’s own confirmation rather than yours. Run ADD_RECEIPT_EVIDENCE.sql first. Nothing has been changed.', 'error');
      return;
    }
    if (!ok) {
      toast('The receipt could not be saved, so nothing has been recorded. The reason is in the browser console.', 'error');
      return;
    }
    setReceiptOrder(null);
    // Saying it out loud rather than letting the evidence vanish quietly: the
    // tick is on an existing column and survives, the proof needs the migration.
    toast(proofSaved
      ? `Receipt recorded for ${receiptOrder.customerName}.`
      : 'Receipt recorded, but the evidence could not be saved — run ADD_RECEIPT_EVIDENCE.sql to keep it.',
      proofSaved ? 'success' : 'error');
  };
  const [splitQuantities, setSplitQuantities] = useState({});
  const [isPartialModalOpen, setIsPartialModalOpen] = useState(false);
  const [partialQty, setPartialQty] = useState('');
  const [partialError, setPartialError] = useState('');
  const [isDelivering, setIsDelivering] = useState(false);

  // Warehouse Manager / Dispatch Team fulfill orders across every sales rep,
  // so they aren't restricted to the row-level "my own orders" visibility
  // that applies to Sales roles.
  const isFulfillmentRole = user?.role === 'Warehouse Manager' || user?.role === 'Dispatch Team';
  const baseVisibleOrders = orders.filter(o => isFulfillmentRole || canAccessData(o.assignedTo));

  const getAvailableQty = (productName) => inventory
    .filter(b => b.product === productName)
    .reduce((sum, b) => sum + Math.max(0, (b.quantity || 0) - (b.reserved || 0)), 0);

  // Rate depends on which tier the order is billed to — a distributor pays
  // distributorPrice, not MRP. Falls back to MRP for a direct customer with no
  // channel-partner link.
  const getUnitRate = (productName, order) => {
    const p = (productCatalog || []).find(x => x.name === productName);
    if (!p) return 0;
    if (order?.distributorId) return Number(p.distributorPrice || 0);
    if (order?.dealerId) return Number(p.dealerPrice || 0);
    if (order?.retailerId) return Number(p.retailerPrice || 0);
    return Number(p.mrp || 0);
  };

  const rateLabel = (order) =>
    order?.distributorId ? 'distributor price'
      : order?.dealerId ? 'dealer price'
        : order?.retailerId ? 'retailer price'
          : 'MRP';

  // Once stock has physically moved or the order has been billed, quantity is
  // frozen: editing it would desynchronise inventory and the invoice already
  // raised. Amendments go through Split or a fresh order instead.
  const isQuantityLocked = () => {
    if (!editingOrder) return false;
    if (Number(formData.deliveredQty || 0) > 0) return true;
    return ['Shipped', 'Partially Delivered', 'Delivered'].includes(formData.status);
  };

  const getStockShortfalls = (order) => {
    // For a single-product order already part-delivered, only what's still
    // outstanding needs to be in stock — not the original full quantity.
    const lineItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
      : [{ name: order.product, quantity: Number(order.quantity || 0) - Number(order.deliveredQty || 0) }];
    return lineItems
      .map(li => ({ ...li, available: getAvailableQty(li.name) }))
      .filter(li => li.name && li.available < li.quantity);
  };

  // An order cannot leave Pending until there is somewhere to send it. The
  // rule lives in utils/delivery.js; Leads' convert step asks for the same two
  // fields up front, and this stays as the check for orders that skipped it.
  const missingDeliveryFor = (target) => missingDelivery(formData, target);

  const attemptSetStatus = (targetStatus) => {
    if (!canSetOrderStatus(user?.role, targetStatus)) {
      const owners = STATUS_STAGE_OWNERS[targetStatus];
      setStatusError(`Only ${owners ? owners.join('/') : 'Admin'} can set this status.`);
      return;
    }
    // A cancelled order is void. The stepper hides its buttons, but the status
    // dropdown stays live, so without this a cancelled order could be pushed
    // straight to Delivered — deducting stock and billing for a void order.
    if (formData.status === 'Cancelled' && targetStatus !== 'Cancelled') {
      setStatusError('This order was cancelled. Create a new order instead of reviving it.');
      return;
    }
    const missingDelivery = missingDeliveryFor(targetStatus);
    if (missingDelivery) {
      setStatusError(`This order needs ${missingDelivery} before it can leave Pending. Fill it in below — dispatch cannot deliver to a city alone.`);
      return;
    }
    // Block ALL forward fulfillment stages when stock is short — you can't
    // dispatch, ship, or deliver goods you don't physically have. (Delivered
    // was previously unguarded, allowing "delivery" with no stock.)
    if (['Ready for Dispatch', 'Shipped', 'Delivered'].includes(targetStatus)) {
      const shortfalls = getStockShortfalls(formData);
      if (shortfalls.length > 0) {
        setStatusError(`Insufficient stock to ${targetStatus === 'Delivered' ? 'deliver' : 'dispatch'} — ${shortfalls.map(s => `${s.name} (need ${s.quantity}, have ${s.available})`).join('; ')}. Split the order to fulfil what's available.`);
        return;
      }
    }
    setStatusError('');
    setFormData(prev => ({ ...prev, status: targetStatus }));
  };

  // Offer split whenever an order that hasn't shipped yet is short on stock and
  // at least one unit can actually ship now.
  const canSplitOrder = () => {
    if (!editingOrder || !['Pending', 'Processing', 'Ready for Dispatch'].includes(formData.status)) return false;
    const shortfalls = getStockShortfalls(formData);
    if (shortfalls.length === 0) return false;
    const lineItems = Array.isArray(formData.items) && formData.items.length > 0
      ? formData.items.map(i => ({ name: i.name }))
      : [{ name: formData.product }];
    return lineItems.some(li => getAvailableQty(li.name) > 0);
  };

  const orderLineItems = (order) => Array.isArray(order.items) && order.items.length > 0
    ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
    : [{ name: order.product, quantity: Number(order.quantity || 0) }];

  const openSplitModal = () => {
    if (!editingOrder) return;
    const defaults = {};
    orderLineItems(formData).forEach(li => {
      defaults[li.name] = Math.min(li.quantity, Math.max(0, getAvailableQty(li.name)));
    });
    setSplitQuantities(defaults);
    setIsSplitModalOpen(true);
  };

  const confirmSplitOrder = async () => {
    if (!editingOrder) return;
    // A refused split used to close both dialogs as though it had worked.
    const result = await splitOrder(editingOrder.id, splitQuantities);
    if (result && !result.ok) {
      toast(result.error || 'The order could not be split.', 'error');
      return;
    }
    setIsSplitModalOpen(false);
    closeModal();
  };

  // Partial delivery applies to single-product orders (multi-item orders use Split)
  const isSingleProduct = (order) => !(Array.isArray(order.items) && order.items.length > 1);
  const orderRemainingQty = (order) => Number(order.quantity || 0) - Number(order.deliveredQty || 0);
  const deliveryPct = (delivered, total) => Number(total) > 0 ? Math.min(100, Math.round((Number(delivered || 0) / Number(total)) * 100)) : 0;

  const canPartialDeliver = () => {
    if (!editingOrder || !isSingleProduct(formData)) return false;
    if (['Delivered', 'Cancelled'].includes(formData.status)) return false;
    const remaining = orderRemainingQty(formData);
    const avail = getAvailableQty(formData.product);
    return remaining > 0 && avail > 0 && avail < remaining; // short but some stock
  };

  const openPartialModal = () => {
    if (!editingOrder) return;
    const suggested = Math.min(orderRemainingQty(formData), Math.max(0, getAvailableQty(formData.product)));
    setPartialQty(String(suggested));
    setPartialError('');
    setIsPartialModalOpen(true);
  };

  const confirmPartialDelivery = async () => {
    if (!editingOrder || isDelivering) return;
    const qty = Number(partialQty);
    if (qty <= 0) return;
    setPartialError('');
    setIsDelivering(true);
    try {
      // Awaited so a rejected delivery (e.g. not enough stock) surfaces here
      // instead of the modal closing as though it succeeded.
      const result = await deliverPartial(editingOrder.id, qty);
      if (result && !result.ok) {
        setPartialError(result.error || 'Could not record this delivery.');
        return;
      }
      setIsPartialModalOpen(false);
      closeModal();
    } finally {
      setIsDelivering(false);
    }
  };

  // Sales roles hand off fulfillment entirely — they get one action
  // ("Assign to Warehouse Manager") instead of the full pipeline stepper.
  const isSalesOnlyRole = STATUS_STAGE_OWNERS['Processing'].includes(user?.role);
  const visibleOrders = (salespersonFilter
    ? baseVisibleOrders.filter(o => o.assignedTo === salespersonFilter)
    : baseVisibleOrders)
    .sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      const numA = parseInt(a.id.replace('O', ''), 10) || 0;
      const numB = parseInt(b.id.replace('O', ''), 10) || 0;
      return numB - numA;
    });

  useEffect(() => {
    const searchId = searchParams.get('searchId');
    if (searchId) {
      const targetOrder = visibleOrders.find(o => o.id === searchId);
      if (targetOrder) {
        setTimeout(() => {
          const element = document.getElementById(`order-row-${searchId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setHighlightedRowId(searchId);
            setTimeout(() => setHighlightedRowId(null), 3000);
          }
        }, 100);
        navigate('/orders', { replace: true });
      }
    }
  }, [searchParams, visibleOrders, navigate]);

  const [formData, setFormData] = useState({
    customerName: '', companyName: '', product: '', quantity: '', value: '',
    state: '', city: '', deliveryAddress: '', deliveryPincode: '', status: 'Pending',
    assignedTo: isSalesRole(user?.role) ? user.id : '',
    date: '', phone: '', email: ''
  });

  // Who an order can be for.
  //
  // There is no customers table in this system — a customer is just a name on
  // an order, enriched from leads. So the list has to be assembled from three
  // places, because a first-time customer who came from a lead is not a channel
  // partner and exists nowhere else:
  //   - channel partners, which also bind the order to their portal and pricing
  //   - leads, which is where a brand-new customer starts
  //   - names already used on past orders, for repeat business
  const customerOptions = useMemo(() => {
    const parties = allParties(distributors, dealers, retailers).map(p => ({
      key: `party:${p.id}`, group: `${p.partyType}s`, label: p.name, kind: 'party', ref: p,
    }));

    const taken = new Set(parties.map(p => p.label.trim().toLowerCase()).filter(Boolean));

    const leadOpts = (leads || [])
      .filter(l => l.name && !taken.has(l.name.trim().toLowerCase()))
      .map(l => {
        taken.add(l.name.trim().toLowerCase());
        return {
          key: `lead:${l.id}`, group: 'From leads', kind: 'lead', ref: l,
          label: l.company ? `${l.name} — ${l.company}` : l.name,
        };
      });

    const pastOpts = [];
    (orders || []).forEach(o => {
      const name = (o.customerName || '').trim();
      if (!name || taken.has(name.toLowerCase())) return;
      taken.add(name.toLowerCase());
      pastOpts.push({ key: `past:${name}`, group: 'Previous customers', label: name, kind: 'past', ref: o });
    });

    return [...parties, ...leadOpts, ...pastOpts];
  }, [distributors, dealers, retailers, leads, orders]);

  const [customerChoice, setCustomerChoice] = useState('');
  // Most orders are for someone new, so the list stays out of the way until it
  // is asked for. Ticking this reveals it.
  const [useExistingCustomer, setUseExistingCustomer] = useState(false);
  const boundPartyId = formData.distributorId || formData.dealerId || formData.retailerId || '';

  // An order can carry a partner's name without carrying their id — anything
  // raised before the picker existed, or converted from a lead. The name alone
  // does nothing: the order still will not reach their portal, ledger or stock.
  // Offer the link rather than making it silently, since it changes where the
  // order shows up and which price tier applies.
  const suggestedParty = (() => {
    if (boundPartyId) return null;
    const name = (formData.customerName || '').trim().toLowerCase();
    if (!name) return null;
    return customerOptions.find(o => o.kind === 'party' && o.label.trim().toLowerCase() === name) || null;
  })();

  const toggleExistingCustomer = (checked) => {
    setUseExistingCustomer(checked);
    if (!checked) {
      // Hiding the list must also release the order, or it would stay bound to
      // a partner the form no longer shows.
      setCustomerChoice('');
      setFormData(prev => ({ ...prev, distributorId: undefined, dealerId: undefined, retailerId: undefined }));
    }
  };

  const selectCustomer = (key) => {
    setCustomerChoice(key);
    const clearLinks = { distributorId: undefined, dealerId: undefined, retailerId: undefined };

    if (!key) { setFormData(prev => ({ ...prev, ...clearLinks })); return; }
    const opt = customerOptions.find(o => o.key === key);
    if (!opt) return;

    if (opt.kind === 'party') {
      const p = opt.ref;
      setFormData(prev => ({
        ...prev,
        customerName: p.name,
        companyName: p.name,
        phone: p.phone || prev.phone || '',
        email: p.email || prev.email || '',
        state: p.state || prev.state || '',
        city: p.city || prev.city || '',
        // Their registered address is the default, not a lock — a consignment
        // often goes to a godown rather than the office on file.
        deliveryAddress: p.address || prev.deliveryAddress || '',
        deliveryPincode: p.pincode || prev.deliveryPincode || '',
        distributorId: p.partyType === 'Distributor' ? p.id : undefined,
        dealerId: p.partyType === 'Dealer' ? p.id : undefined,
        retailerId: p.partyType === 'Retailer' ? p.id : undefined,
      }));
      return;
    }

    if (opt.kind === 'lead') {
      const l = opt.ref;
      const interest = Array.isArray(l.productInterest) ? l.productInterest[0] : (l.productInterest || '');
      setFormData(prev => ({
        ...prev,
        ...clearLinks,
        customerName: l.name,
        companyName: l.company || '',
        phone: l.phone || '',
        email: l.email || '',
        state: l.state || prev.state || '',
        city: l.city || prev.city || '',
        product: prev.product || interest || '',
        value: prev.value || l.dealValue || '',
      }));
      return;
    }

    // A previous customer: carry forward what the last order recorded about them.
    const o = opt.ref;
    setFormData(prev => ({
      ...prev,
      ...clearLinks,
      customerName: o.customerName || '',
      companyName: o.companyName || '',
      phone: o.phone || '',
      email: o.email || '',
      state: o.state || prev.state || '',
      city: o.city || prev.city || '',
    }));
  };

  // Which entry in the Customer list an existing order corresponds to. Without
  // this an order always reopened showing "New customer", even when it was
  // plainly for a known distributor — which reads as though the link had been
  // lost.
  const customerChoiceFor = (order) => {
    if (!order) return '';
    const partyId = order.distributorId || order.dealerId || order.retailerId;
    if (partyId) return `party:${partyId}`;
    const name = (order.customerName || '').trim();
    if (!name) return '';
    const lead = (leads || []).find(l => (l.name || '').trim().toLowerCase() === name.toLowerCase());
    if (lead) return `lead:${lead.id}`;
    return `past:${name}`;
  };

  const handleOpenModal = (order = null) => {
    setStatusError('');
    const choice = customerChoiceFor(order);
    setCustomerChoice(choice);
    setUseExistingCustomer(Boolean(choice));
    if (order) {
      setEditingOrder(order);
      setFormData({
        phone: '',
        email: '',
        ...order,
        date: order.date ? order.date.split('T')[0] : ''
      });
      const safeProducts = products || [];
      if (order.product && !safeProducts.includes(order.product)) {
        setIsCustomProduct(true);
      } else {
        setIsCustomProduct(false);
      }
    } else {
      setEditingOrder(null);
      setIsCustomProduct(false);
      setFormData({
        customerName: '', companyName: '', product: '', quantity: '', value: '',
        state: '', city: '', deliveryAddress: '', deliveryPincode: '', status: 'Pending',
        assignedTo: isSalesRole(user?.role) ? user.id : '',
        date: new Date().toISOString().split('T')[0],
        phone: '', email: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsCustomProduct(false);
    setStatusError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // An order already cleared for fulfilment can have its quantity raised
    // above what's in stock. The status guard only runs on a status *change*,
    // so without re-checking here the order would sit at "Ready for Dispatch"
    // promising units that don't exist.
    const missingDelivery = missingDeliveryFor(formData.status);
    if (missingDelivery) {
      setStatusError(`This order needs ${missingDelivery} before it can leave Pending.`);
      return;
    }

    if (editingOrder && ['Ready for Dispatch', 'Shipped', 'Delivered'].includes(formData.status)) {
      const shortfalls = getStockShortfalls(formData);
      if (shortfalls.length > 0) {
        setStatusError(
          `Cannot save — this quantity exceeds available stock: ${shortfalls
            .map(s => `${s.name} (need ${s.quantity}, have ${s.available})`)
            .join('; ')}. Reduce the quantity, or move the order back to Processing.`
        );
        return;
      }
    }

    // Save custom product to global catalog if new
    if (formData.product && formData.product.trim() !== '') {
      addProduct(formData.product);
    }

    const dataToSave = {
      ...formData,
      quantity: Number(formData.quantity),
      value: Number(formData.value),
      date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString()
    };

    // Awaited: delivering now takes the stock and raises the invoice in the
    // database, and is refused whole when it cannot — not enough stock, most
    // often. The form stays open with the reason instead of closing as though
    // the order had gone.
    if (editingOrder) {
      const result = await updateOrder(editingOrder.id, dataToSave);
      if (result && !result.ok) {
        setStatusError(result.error || 'This change could not be saved.');
        toast(result.error || 'This change could not be saved.', 'error');
        return;
      }
    } else {
      const newId = await addOrder(dataToSave);
      if (!newId) {
        toast('The order could not be saved.', 'error');
        return;
      }
    }
    closeModal();
  };

  // A status configured through Master Lists brings its own colour. The switch
  // below stays as the fallback for the ones that predate it — and for
  // 'Partially Delivered', which is derived rather than chosen.
  const statusStyle = (status) => {
    const o = statusOptions.find(x => x.key === status);
    return o?.color ? badgeStyle(o.color) : null;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Processing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Ready for Dispatch': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'Shipped': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Partially Delivered': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
      case 'Delivered': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Cancelled': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getSalespersonName = (id) => {
    const sp = mockUsers.find(u => u.id === id);
    return sp ? sp.name : 'Unknown';
  };

  const handleExport = () => {
    const formattedData = visibleOrders.map(o => ({
      ...o,
      Company: o.companyName || 'N/A',
      date: o.date ? format(new Date(o.date), 'yyyy-MM-dd') : 'None',
      salesperson: mockUsers.find(u => u.id === o.assignedTo)?.name || 'Unassigned'
    }));
    downloadCSV(formattedData, 'PRISMORA_Orders');
  };

  const safeDate = (d) => {
    if (!d) return 'N/A';
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? 'N/A' : format(parsed, 'dd MMM yyyy');
  };

  const orderColumns = [
    {
      key: 'id', header: 'Order / Date', sort: o => o.id,
      render: o => (
        <>
          <div className="font-semibold text-white">{o.id}</div>
          <div className="text-[11px] text-slate-500">{safeDate(o.date)}</div>
          {o.splitFromOrderId && (
            <div className="text-[10px] font-semibold text-cyan-400 mt-1">&#8627; Split from {o.splitFromOrderId}</div>
          )}
          {o.splitIntoOrderId && (
            <div className="text-[10px] font-semibold text-cyan-400 mt-1">&rarr; Backorder: {o.splitIntoOrderId}</div>
          )}
        </>
      ),
    },
    {
      key: 'customer', header: 'Customer & Location', sort: o => o.customerName || '',
      // The contact and address lines stand down on a phone. They pushed the
      // value and status columns off the side of the screen, and those are the
      // two things you actually open this list to see.
      render: o => (
        <>
          <div className="font-semibold text-white">{o.customerName}</div>
          {(o.phone || o.email) && (
            <div className="hidden sm:block text-[11px] text-brand-accent mt-0.5 truncate">
              {o.phone || '—'} &middot; {o.email || '—'}
            </div>
          )}
          <div className="hidden sm:block text-[11px] text-slate-500 mt-0.5 truncate">{o.companyName || 'N/A'}</div>
          <div className="text-[11px] text-slate-500 truncate">{[o.city, o.state].filter(Boolean).join(', ')}</div>
        </>
      ),
    },
    {
      key: 'product', header: 'Product', hideBelow: 'md', sort: o => o.product || '',
      render: o => (
        <>
          <div className="text-brand-accent">{o.product}</div>
          <div className="text-[11px] text-slate-500">Qty: {o.quantity}</div>
        </>
      ),
    },
    {
      key: 'value', header: 'Value', align: 'right', sort: o => Number(o.value) || 0,
      render: o => <span className="font-semibold text-white">&#8377;{Number(o.value || 0).toLocaleString('en-IN')}</span>,
    },
    ...(isSalesRole(user?.role) ? [] : [{
      key: 'salesperson', header: 'Salesperson', hideBelow: 'lg',
      sort: o => getSalespersonName(o.assignedTo) || '',
      render: o => (isUnassigned(o)
        // Nobody owns it. Without saying so it reads as a blank cell, and an
        // order nobody can see is an order nobody works.
        ? <span className="text-amber-400 font-semibold text-xs">Unassigned</span>
        : <span className="text-slate-400">{getSalespersonName(o.assignedTo)}</span>),
    }, {
      // Not the same column as Salesperson. That is who owns the order; this is
      // who raised it — which on a portal order is the partner themselves, and
      // is what tells a self-service order from one keyed in over the phone.
      key: 'raisedBy', header: 'Raised by', hideBelow: 'lg',
      sort: o => attributionFor(o, mockUsers).name,
      render: o => <span className="text-slate-400">{attributionFor(o, mockUsers).name}</span>,
    }]),
    {
      key: 'status', header: 'Status', sort: o => o.status || '',
      render: o => (
        <>
          <Badge color={statusStyle(o.status) ? statusStyle(o.status).color : undefined}>{o.status}</Badge>
          {o.status === 'Partially Delivered' && (
            <div className="mt-1.5 w-28">
              <div className="flex items-center justify-between text-[10px] font-semibold text-teal-400">
                <span>{deliveryPct(o.deliveredQty, o.quantity)}%</span>
                <span className="text-slate-500">{o.quantity - (o.deliveredQty || 0)} left</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-teal-400" style={{ width: `${deliveryPct(o.deliveredQty, o.quantity)}%` }} />
              </div>
            </div>
          )}
          {o.receivedByDistributor && (
            // Who confirmed it matters: the customer saying "it arrived" and an
            // employee saying "they told me it arrived" are different claims.
            <div
              className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${
                receiptSourceOf(o) === 'staff' ? 'text-amber-400' : 'text-emerald-400'}`}
              title={describeReceipt(o) || undefined}
            >
              <CheckCircle size={10} />
              {receiptSourceOf(o) === 'staff' ? 'Receipt recorded by staff' : 'Receipt confirmed'}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'actions', header: '', align: 'right', width: 'w-24',
      render: o => (
        <div className="flex items-center justify-end gap-0.5">
          {/* A customer created by staff has no portal, so nobody could ever
              record that their delivery landed. */}
          {canStaffRecordReceipt && canRecordReceipt(o) && (
            <IconButton icon={ClipboardCheck} title="Record receipt" size="sm" tone="success"
              onClick={e => { e.stopPropagation(); openReceipt(o); }} />
          )}
          {canStaffRecordReceipt && receiptSourceOf(o) === 'staff' && (
            <IconButton icon={Undo2} title="Withdraw the receipt you recorded" size="sm"
              onClick={e => { e.stopPropagation(); withdrawReceipt(o); }} />
          )}
          <IconButton icon={Edit2} title="Edit order" size="sm" tone="accent"
            onClick={e => { e.stopPropagation(); handleOpenModal(o); }} />
          <IconButton icon={Trash2} title="Delete order" size="sm" tone="danger"
            onClick={e => { e.stopPropagation(); deleteOrder(o.id); }} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 flex flex-col h-full">
      <PageHeader
        icon={ShoppingCart}
        title="Order Management"
        subtitle="Track and monitor all product orders."
        actions={
          <>
            {(isAdminRole(user?.role) || isManagerRole(user?.role)) && (
              <Select
                value={salespersonFilter}
                onChange={e => setSalespersonFilter(e.target.value)}
                className="w-40"
              >
                <option value="">All Salespeople</option>
                {getAssignableUsers().map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            )}
            <Button icon={Download} onClick={handleExport}>Export</Button>
            <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>Add Order</Button>
          </>
        }
      />

      <DataTable
        title="Orders"
        columns={orderColumns}
        rows={visibleOrders}
        rowKey={o => o.id}
        rowId={o => `order-row-${o.id}`}
        rowClassName={o => (highlightedRowId === o.id ? 'bg-brand-accent/15' : '')}
        onRowClick={o => handleOpenModal(o)}
        search={o => `${o.id} ${o.customerName} ${o.companyName || ''} ${o.product} ${o.city || ''} ${o.state || ''} ${o.status}`}
        searchPlaceholder="Search order, customer, product"
        empty={{
          icon: ShoppingCart,
          title: 'No orders yet',
          hint: 'Orders appear here once one is raised, either from this screen or by converting a lead.',
          action: <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>Add Order</Button>,
        }}
      />

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-brand-primary/80 backdrop-blur-sm">
          <div className="bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-brand-primary-light z-10">
              <h2 className="text-xl font-bold text-white">{editingOrder ? 'Edit Order' : 'Add New Order'}</h2>
              {editingOrder && <LastChanged record={editingOrder} users={mockUsers} className="mt-0.5" />}
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Status Timeline Stepper (only for existing orders) */}
              {editingOrder && (
                <div className="bg-brand-primary-lighter/40 rounded-xl p-4 border border-white/5 mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-3">Order Status Journey</span>
                  {formData.status === 'Cancelled' ? (
                    <div className="flex items-center justify-center gap-2 text-red-400 font-bold text-sm bg-red-500/10 border border-red-500/20 py-2.5 rounded-lg">
                      ⚠️ This order has been Cancelled
                    </div>
                  ) : isSalesOnlyRole ? (
                    formData.status === 'Pending' ? (
                      <div className="flex items-center justify-between gap-3">
                        <span style={statusStyle(formData.status) || undefined} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle(formData.status) ? "" : getStatusColor(formData.status)}`}>{labelForStatus(formData.status)}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => attemptSetStatus('Cancelled')} className="px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Cancel Order</button>
                          <button type="button" onClick={() => attemptSetStatus('Processing')} className="btn-accent px-4 py-2 rounded-lg text-xs font-bold">Assign to Warehouse Manager</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span style={statusStyle(formData.status) || undefined} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle(formData.status) ? "" : getStatusColor(formData.status)}`}>{labelForStatus(formData.status)}</span>
                        <span className="text-xs text-slate-400">This order is now with the Warehouse/Dispatch team — you can no longer change its status.</span>
                      </div>
                    )
                  ) : (
                    <div className="relative flex items-start justify-between">
                      {/* Stepper Progress Line */}
                      <div className="absolute left-[16px] right-[16px] top-[16px] -translate-y-1/2 h-0.5 bg-slate-700 pointer-events-none">
                        <div
                          className="h-full bg-brand-accent transition-all duration-500"
                          style={{
                            width: `${(statuses.filter(s => s !== 'Cancelled').indexOf(formData.status) / (statuses.filter(s => s !== 'Cancelled').length - 1)) * 100
                              }%`
                          }}
                        />
                      </div>

                      {/* Steps */}
                      {statuses.filter(s => s !== 'Cancelled').map((status, idx) => {
                        const activeIdx = statuses.filter(s => s !== 'Cancelled').indexOf(formData.status);
                        const isCompleted = idx < activeIdx;
                        const isActive = idx === activeIdx;

                        const isAllowed = canSetOrderStatus(user?.role, status);

                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => attemptSetStatus(status)}
                            className={`relative z-10 flex flex-col items-center group focus:outline-none ${!isAllowed ? 'opacity-50' : ''}`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-300 ${isActive
                                  ? 'bg-brand-accent border-brand-accent text-white shadow-lg shadow-brand-accent/30 scale-110'
                                  : isCompleted
                                    ? 'bg-brand-primary border-brand-accent text-brand-accent'
                                    : 'bg-brand-primary border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                                }`}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            <span
                              className={`text-[10px] leading-tight mt-2 font-medium text-center transition-colors ${isActive
                                  ? 'text-brand-accent font-bold'
                                  : isCompleted
                                    ? 'text-slate-300'
                                    : 'text-slate-500 group-hover:text-slate-400'
                                }`}
                            >
                              {labelForStatus(status)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {statusError && (
                <div className="flex flex-col gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 font-medium -mt-2">
                  <div className="flex items-start gap-2">⚠️ {statusError}</div>
                  <div className="flex flex-wrap gap-2">
                    {canPartialDeliver() && (
                      <button type="button" onClick={openPartialModal} className="px-3 py-1.5 text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg transition-colors">
                        Deliver {getAvailableQty(formData.product)} Now (Partial)
                      </button>
                    )}
                    {canSplitOrder() && (
                      <button type="button" onClick={openSplitModal} className="px-3 py-1.5 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors">
                        Split into Backorder
                      </button>
                    )}
                  </div>
                </div>
              )}

              {editingOrder && formData.splitFromOrderId && (
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3 text-sm text-cyan-400 font-medium -mt-2">
                  This order was split from <strong>{formData.splitFromOrderId}</strong> (backordered remainder awaiting restock).
                </div>
              )}

              {editingOrder && formData.splitIntoOrderId && (
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3 text-sm text-cyan-400 font-medium -mt-2">
                  Remaining quantity that couldn't be fulfilled was split into <strong>{formData.splitIntoOrderId}</strong>.
                </div>
              )}

              {editingOrder && formData.receivedByDistributor && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400 font-medium -mt-2">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  Distributor confirmed receipt on {formData.receivedAt ? format(new Date(formData.receivedAt), 'MMM dd, yyyy') : 'N/A'}
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 cursor-pointer w-fit mb-2">
                  <input
                    type="checkbox"
                    checked={useExistingCustomer}
                    onChange={e => toggleExistingCustomer(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand-accent cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Existing customer</span>
                </label>

                {!useExistingCustomer && (
                  <p className="text-[11px] text-slate-500">
                    Type the customer's name below. Tick the box to pick someone you have dealt with before.
                  </p>
                )}

                {useExistingCustomer && (
                <select
                  value={boundPartyId ? `party:${boundPartyId}` : customerChoice}
                  onChange={e => selectCustomer(e.target.value)}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="" className="bg-brand-primary">Select a customer…</option>
                  {['Distributors', 'Dealers', 'Retailers', 'From leads', 'Previous customers'].map(group => {
                    const inGroup = customerOptions.filter(o => o.group === group);
                    if (inGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={group}>
                        {inGroup.map(o => (
                          <option key={o.key} value={o.key} className="bg-brand-primary">{o.label}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                )}
                {useExistingCustomer && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Channel partners bind the order to their portal, ledger and tier pricing. Leads and previous
                    customers just fill in their details.
                  </p>
                )}
                {suggestedParty && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                    <span className="text-[11px] text-amber-300 leading-snug">
                      This order names <strong>{suggestedParty.label}</strong>, who is a {suggestedParty.ref.partyType.toLowerCase()},
                      but it is not linked to their record — so it will not appear on their portal or ledger.
                    </span>
                    <button
                      type="button"
                      onClick={() => selectCustomer(suggestedParty.key)}
                      className="ml-auto px-3 py-1 text-[11px] font-bold rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors whitespace-nowrap"
                    >
                      Link to {suggestedParty.ref.partyType.toLowerCase()}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label htmlFor="orders-customer-name" className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Customer Name *</label>
                  <input id="orders-customer-name"
                    required
                    type="text"
                    disabled={Boolean(boundPartyId)}
                    value={formData.customerName}
                    onChange={e => {
                      const val = e.target.value;
                      const norm = val.trim().toLowerCase();
                      // Link to an actual channel-partner record when the typed name matches
                      // one exactly — without this, the order carries no distributorId/
                      // dealerId/retailerId and never shows up on that partner's own portal,
                      // even though the customer name looks identical on screen.
                      const matchedDistributor = distributors?.find(d => d.name?.toLowerCase() === norm);
                      const matchedDealer = !matchedDistributor && dealers?.find(d => d.name?.toLowerCase() === norm);
                      const matchedRetailer = !matchedDistributor && !matchedDealer && retailers?.find(r => r.name?.toLowerCase() === norm);
                      const matchedParty = matchedDistributor || matchedDealer || matchedRetailer;
                      const matchedLead = !matchedParty && leads?.find(l => l.name?.toLowerCase() === norm);

                      if (matchedParty) {
                        setFormData(prev => ({
                          ...prev,
                          customerName: val,
                          companyName: prev.companyName || matchedParty.name || '',
                          phone: prev.phone || matchedParty.phone || matchedParty.contactPhone || '',
                          email: prev.email || matchedParty.email || '',
                          state: prev.state || matchedParty.state || '',
                          city: prev.city || matchedParty.city || '',
                          distributorId: matchedDistributor ? matchedDistributor.id : undefined,
                          dealerId: matchedDealer ? matchedDealer.id : undefined,
                          retailerId: matchedRetailer ? matchedRetailer.id : undefined,
                        }));
                      } else if (matchedLead) {
                        setFormData(prev => ({
                          ...prev,
                          customerName: val,
                          companyName: prev.companyName || matchedLead.company || '',
                          phone: prev.phone || matchedLead.phone || '',
                          email: prev.email || matchedLead.email || '',
                          state: prev.state || matchedLead.state || '',
                          city: prev.city || matchedLead.city || '',
                          product: prev.product || (Array.isArray(matchedLead.productInterest) ? matchedLead.productInterest[0] : (matchedLead.productInterest || '')),
                          value: prev.value || matchedLead.dealValue || ''
                        }));
                      } else {
                        // No match on this keystroke — clear any stale party link from a
                        // previous exact match so the order doesn't stay bound to a party
                        // whose name the user has since edited away from.
                        setFormData(prev => ({
                          ...prev,
                          customerName: val,
                          distributorId: undefined,
                          dealerId: undefined,
                          retailerId: undefined,
                        }));
                      }
                    }}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent"
                  />
                  {(formData.distributorId || formData.dealerId || formData.retailerId) && (
                    <p className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle size={11} />
                      Linked to {formData.distributorId ? 'distributor' : formData.dealerId ? 'dealer' : 'retailer'} record — will appear on their portal.
                      Switch the Customer field to "one-off" to type a different name.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="orders-company-name" className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Company Name</label>
                  <input id="orders-company-name" type="text" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent" />
                </div>
                <div>
                  <label htmlFor="orders-contact-phone" className="block text-xs font-medium text-slate-300 mb-1.5">Contact Phone</label>
                  <input id="orders-contact-phone" type="text" placeholder="e.g. 9876543210" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label htmlFor="orders-contact-email" className="block text-xs font-medium text-slate-300 mb-1.5">Contact Email</label>
                  <input id="orders-contact-email" type="email" placeholder="e.g. client@prismora.com" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                {!(Array.isArray(formData.items) && formData.items.length > 0) && (
                  <div className="col-span-2">
                    <label htmlFor="orders-product" className="block text-sm font-medium text-slate-300 mb-1.5">Product</label>
                    {isCustomProduct ? (
                      <div className="flex gap-2">
                        <input id="orders-product"
                          type="text"
                          required
                          value={formData.product}
                          onChange={e => setFormData({ ...formData, product: e.target.value })}
                          className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                          placeholder="Type new product name..."
                          autoFocus
                        />
                        <button type="button" onClick={() => { setIsCustomProduct(false); setFormData({ ...formData, product: '' }); }} className="px-3 py-2 bg-brand-primary border border-slate-700/50 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">✕</button>
                      </div>
                    ) : (
                      <select
                        value={formData.product || ''}
                        onChange={e => {
                          if (e.target.value === '__ADD_NEW__') {
                            setIsCustomProduct(true);
                            setFormData({ ...formData, product: '' });
                          } else {
                            // Rate is product-specific, so switching product
                            // re-derives the value from the current quantity.
                            const name = e.target.value;
                            const rate = getUnitRate(name, formData);
                            const qty = Number(formData.quantity || 0);
                            setFormData(prev => ({
                              ...prev,
                              product: name,
                              value: rate > 0 && qty > 0 ? String(Math.round(qty * rate)) : prev.value,
                            }));
                          }
                        }}
                        className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                      >
                        <option value="" className="bg-brand-primary text-slate-500">-- Select a product --</option>
                        {(products || []).map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                        <option value="__ADD_NEW__" className="bg-brand-primary text-brand-accent font-bold">+ Add Custom Product</option>
                      </select>
                    )}
                    {formData.product && !isCustomProduct && (() => {
                      const avail = getAvailableQty(formData.product);
                      return (
                        <p className={`mt-1.5 text-xs font-medium ${avail > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {avail > 0 ? `✓ ${avail.toLocaleString('en-IN')} available in stock` : '⚠ Out of stock'}
                        </p>
                      );
                    })()}
                  </div>
                )}
                {Array.isArray(formData.items) && formData.items.length > 0 && (
                  <div className="col-span-2">
                    <span id="itemised-breakdown-group" className="block text-sm font-medium text-slate-300 mb-1.5">Itemized Breakdown</span>
                    <div role="group" aria-labelledby="itemised-breakdown-group" className="border border-slate-700/50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                            <th className="p-2.5 text-left">Product</th>
                            <th className="p-2.5 text-right">Qty</th>
                            <th className="p-2.5 text-right">Rate</th>
                            <th className="p-2.5 text-right">Total</th>
                            <th className="p-2.5 text-right">Available</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 text-slate-300">
                          {formData.items.map((item, idx) => {
                            const avail = getAvailableQty(item.name);
                            return (
                              <tr key={idx}>
                                <td className="p-2.5 flex items-center gap-1.5"><Package size={12} className="text-brand-accent flex-shrink-0" />{item.name}</td>
                                <td className="p-2.5 text-right">{item.quantity}</td>
                                <td className="p-2.5 text-right">₹{Number(item.unitPrice || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2.5 text-right font-medium text-white">₹{Number(item.total || 0).toLocaleString('en-IN')}</td>
                                <td className={`p-2.5 text-right font-medium ${avail >= item.quantity ? 'text-emerald-400' : 'text-red-400'}`}>{avail.toLocaleString('en-IN')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="orders-quantity" className="block text-sm font-medium text-slate-300 mb-1.5">Quantity</label>
                  <input id="orders-quantity"
                    type="number"
                    required
                    min="1"
                    disabled={isQuantityLocked()}
                    value={formData.quantity}
                    onChange={e => {
                      const qty = e.target.value;
                      // Recompute value from qty x tier rate. Only fires when
                      // quantity or product changes, so a manually negotiated
                      // value entered afterwards is left alone.
                      const rate = getUnitRate(formData.product, formData);
                      setFormData(prev => ({
                        ...prev,
                        quantity: qty,
                        value: rate > 0 && qty !== '' ? String(Math.round(Number(qty) * rate)) : prev.value,
                      }));
                    }}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {isQuantityLocked() && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      Locked — stock has already moved against this order. Use Split or raise a new order to change quantity.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="orders-order-value" className="block text-sm font-medium text-slate-300 mb-1.5">Order Value (₹)</label>
                  <input id="orders-order-value" type="number" required value={formData.value} onChange={e => setFormData({ ...formData, value: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                  {getUnitRate(formData.product, formData) > 0 && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Auto-calculated at ₹{getUnitRate(formData.product, formData).toLocaleString('en-IN')} / unit ({rateLabel(formData)}). Editable if negotiated.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="orders-state" className="block text-sm font-medium text-slate-300 mb-1.5">State *</label>
                  <select id="orders-state"
                    required
                    value={formData.state}
                    onChange={e => setFormData({ ...formData, state: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                  >
                    <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s} className="bg-brand-primary">{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="orders-city" className="block text-sm font-medium text-slate-300 mb-1.5">City *</label>
                  <input id="orders-city" type="text" required value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="e.g. Mumbai, Pune..." className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label htmlFor="orders-pincode" className="block text-sm font-medium text-slate-300 mb-1.5">Pincode *</label>
                  <input id="orders-pincode" type="text" inputMode="numeric" maxLength={6} value={formData.deliveryPincode || ''} onChange={e => setFormData({ ...formData, deliveryPincode: e.target.value.replace(/\D/g, '') })} placeholder="e.g. 388001" className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div className="col-span-2">
                  <label htmlFor="orders-delivery-address" className="block text-sm font-medium text-slate-300 mb-1.5">Delivery Address *</label>
                  <textarea id="orders-delivery-address"
                    rows="2"
                    value={formData.deliveryAddress || ''}
                    onChange={e => setFormData({ ...formData, deliveryAddress: e.target.value })}
                    placeholder="Building, street, area — where this consignment should be delivered"
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white resize-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Dispatch cannot deliver to a city alone. Choosing a channel partner fills in their registered
                    address; change it here if this consignment goes somewhere else.
                  </p>
                  {(!String(formData.deliveryAddress || '').trim() || !String(formData.deliveryPincode || '').trim()) && (
                    <p className="mt-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      Required before this order can leave <strong>Pending</strong>. Whoever carries it would otherwise
                      have only {formData.city || 'a city'}{formData.state ? `, ${formData.state}` : ''} to go on.
                    </p>
                  )}
                </div>

                {!isSalesRole(user?.role) && (
                  <div>
                    <label htmlFor="orders-assign-to" className="block text-sm font-medium text-slate-300 mb-1.5">Assign To</label>
                    <select id="orders-assign-to" value={formData.assignedTo} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white">
                      <option value="" className="bg-brand-primary">Select Salesperson</option>
                      {getAssignableUsers().map(u => (
                        <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!(editingOrder && isSalesOnlyRole) && (
                  <div>
                    <label htmlFor="orders-status" className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                    <select id="orders-status" value={formData.status} onChange={e => attemptSetStatus(e.target.value)} className="w-full glass-input rounded-lg px-4 py-2.5 text-white">
                      {statusOptions.map(o => <option key={o.key} value={o.key} className="bg-brand-primary">{o.label}</option>)}
                    </select>
                    {statusError && (
                      <p className="mt-1.5 text-xs font-medium text-red-400">⚠️ {statusError}</p>
                    )}
                  </div>
                )}
                <div>
                  <label htmlFor="orders-order-date" className="block text-sm font-medium text-slate-300 mb-1.5">Order Date</label>
                  <input id="orders-order-date" type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700/50">
                <button type="button" onClick={closeModal} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-brand-accent text-brand-primary font-bold rounded-lg hover:bg-brand-accent-light hover:shadow-lg hover:shadow-brand-accent/20 transition-all">
                  {editingOrder ? 'Update Order' : 'Save Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
        , document.body)}

      {isPartialModalOpen && editingOrder && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPartialModalOpen(false)} />
          <div className="relative bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-md z-10">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Partial Delivery — {editingOrder.id}</h2>
              <button onClick={() => setIsPartialModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 text-xs text-slate-400 space-y-1">
                <div className="flex justify-between"><span>Product:</span><span className="text-white font-medium">{formData.product}</span></div>
                <div className="flex justify-between"><span>Ordered:</span><span className="text-white font-medium">{formData.quantity}</span></div>
                <div className="flex justify-between"><span>Already delivered:</span><span className="text-white font-medium">{formData.deliveredQty || 0}</span></div>
                <div className="flex justify-between"><span>Remaining:</span><span className="text-white font-medium">{orderRemainingQty(formData)}</span></div>
                <div className="flex justify-between"><span>In stock now:</span><span className="text-brand-accent font-bold">{getAvailableQty(formData.product)}</span></div>
              </div>
              <div>
                <label htmlFor="orders-quantity-to-deliver-now" className="block text-sm font-medium text-slate-300 mb-1.5">Quantity to deliver now *</label>
                <input id="orders-quantity-to-deliver-now" type="number" min="1" max={Math.min(orderRemainingQty(formData), getAvailableQty(formData.product))} value={partialQty}
                  onChange={e => setPartialQty(e.target.value)} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" autoFocus />
                <p className="mt-1.5 text-xs text-slate-500">Max {Math.min(orderRemainingQty(formData), getAvailableQty(formData.product))} (limited by stock & remaining qty). The rest stays pending on this order.</p>
              </div>
              {Number(partialQty) > 0 && (
                <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 text-sm text-teal-400 font-medium space-y-2">
                  <div className="flex items-center justify-between">
                    <span>
                      After this: {(Number(formData.deliveredQty || 0) + Number(partialQty))} / {formData.quantity} delivered
                    </span>
                    <span className="font-bold">
                      {deliveryPct(Number(formData.deliveredQty || 0) + Number(partialQty), formData.quantity)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-400"
                      style={{ width: `${deliveryPct(Number(formData.deliveredQty || 0) + Number(partialQty), formData.quantity)}%` }}
                    />
                  </div>
                  <div>
                    {(Number(formData.deliveredQty || 0) + Number(partialQty)) >= Number(formData.quantity) ? 'Order will be fully Delivered.' : 'Order will be Partially Delivered.'}
                  </div>
                </div>
              )}
              {partialError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300 font-medium">
                  {partialError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button type="button" onClick={() => setIsPartialModalOpen(false)} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
              <button
                type="button"
                onClick={confirmPartialDelivery}
                disabled={isDelivering}
                className="px-5 py-2 bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all"
              >
                {isDelivering ? 'Recording…' : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {receiptOrder && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReceiptOrder(null)} />
          <form onSubmit={submitReceipt} className="relative bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg z-10">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Record receipt</h2>
                <p className="text-xs text-slate-500 mt-0.5">{receiptOrder.id} — {receiptOrder.customerName}</p>
              </div>
              <IconButton icon={X} title="Close" onClick={() => setReceiptOrder(null)} />
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                For a customer who has no portal to confirm it in. This is recorded as
                your word that the delivery arrived, not theirs, so say how you know.
              </p>
              <div>
                <label htmlFor="receipt-evidence" className="block text-xs font-semibold text-slate-400 mb-1.5">How do you know? *</label>
                <Select id="receipt-evidence" required value={receiptForm.evidence}
                  onChange={e => setReceiptForm(f => ({ ...f, evidence: e.target.value }))}>
                  <option value="">— Select —</option>
                  {RECEIPT_EVIDENCE.map(x => <option key={x} value={x}>{x}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="receipt-note" className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Detail {receiptForm.evidence === 'Other' ? '*' : '(optional)'}
                </label>
                <textarea id="receipt-note" rows="2" value={receiptForm.note}
                  onChange={e => setReceiptForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. spoke to Mr Patel, all 12 cartons accounted for"
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setReceiptOrder(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={savingReceipt}>
                {savingReceipt ? 'Recording…' : 'Record receipt'}
              </Button>
            </div>
          </form>
        </div>, document.body)}

      {isSplitModalOpen && editingOrder && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSplitModalOpen(false)} />
          <div className="relative bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg z-10">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Split Order {editingOrder.id}</h2>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">Enter how many units of each product to ship now. The rest moves into a new backorder that stays in Processing until it's restocked.</p>
              {orderLineItems(formData).map(li => (
                <div key={li.name} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">{li.name}</p>
                    <p className="text-xs text-slate-500">Ordered: {li.quantity} · Available: {getAvailableQty(li.name)}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={li.quantity}
                    value={splitQuantities[li.name] ?? 0}
                    onChange={e => {
                      const val = Math.max(0, Math.min(li.quantity, Number(e.target.value)));
                      setSplitQuantities(prev => ({ ...prev, [li.name]: val }));
                    }}
                    className="w-28 glass-input rounded-lg px-3 py-2 text-white text-right"
                  />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button type="button" onClick={() => setIsSplitModalOpen(false)} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
              <button type="button" onClick={confirmSplitOrder} className="px-5 py-2 bg-brand-accent text-brand-primary font-bold rounded-lg hover:bg-brand-accent-light transition-all">Confirm Split</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
};

export default Orders;


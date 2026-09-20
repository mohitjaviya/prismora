import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole, isAdminRole, isManagerRole } from '../context/AuthContext';
import { format, differenceInDays } from 'date-fns';
import { Plus, Edit2, Trash2, AlertCircle, LayoutGrid, List, Download, X, User, Phone, Mail, FileText, Calendar, Building, Package, DollarSign, MapPin } from 'lucide-react';
import { useToast } from '../context/DialogContext';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { downloadCSV } from '../utils/exportUtils';
import { optionsFor, colorForKey, labelForKey } from '../utils/masterLists';
import { territoryFields, territoryName } from '../utils/territory';
import { PageHeader, DataTable, Button, IconButton, Badge, Select } from '../components/ui';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { STATE_DISTRICTS } from '../utils/indianStatesDistricts';

// Moving a lead into any of these means the customer has committed, which is
// when an order is raised. Kept in one place because the drag handler and the
// edit form both have to recognise it.
const CONVERSION_STATUSES = ['Converted', 'First Order', 'Active'];
const isConversion = (status) => CONVERSION_STATUSES.includes(status);

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

const Leads = () => {
  const { leads, addLead, updateLead, deleteLead, products, addProduct, convertLeadToOrder, productCatalog, masters, territories } = useData();
  const toast = useToast();

  // Statuses and sources come from Master Lists. The fallback when nothing is
  // configured lives in masterLists.js, which is also the single record of
  // which keys the code itself depends on.
  const statusOptions = optionsFor(masters, 'lead_status');
  const sourceOptions = optionsFor(masters, 'lead_source');
  const { user, users: mockUsers, canAccessData, getAssignableUsers } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [selectedLeadView, setSelectedLeadView] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'board'
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState('');

  const baseVisibleLeads = leads.filter(l => canAccessData(l.assignedTo));
  const visibleLeads = (salespersonFilter
    ? baseVisibleLeads.filter(l => l.assignedTo === salespersonFilter)
    : baseVisibleLeads)
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      const numA = parseInt(a.id.replace('L', ''), 10) || 0;
      const numB = parseInt(b.id.replace('L', ''), 10) || 0;
      return numB - numA;
    });

  useEffect(() => {
    const searchId = searchParams.get('searchId');
    if (searchId) {
      const targetLead = visibleLeads.find(l => l.id === searchId);
      if (targetLead) {
        setTimeout(() => {
          const element = document.getElementById(viewMode === 'table' ? `lead-row-${searchId}` : `lead-board-${searchId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setHighlightedRowId(searchId);
            setTimeout(() => setHighlightedRowId(null), 3000);
          }
        }, 100);
        navigate('/leads', { replace: true });
      }
    }
  }, [searchParams, visibleLeads, navigate, viewMode]);

  const [formData, setFormData] = useState({
    name: '', company: '', phone: '', email: '', productInterest: [],
    leadSource: '', assignedTo: isSalesRole(user?.role) ? user.id : '',
    status: 'Lead Created', followUpDate: '', notes: '', dealValue: '',
    state: '', city: '', district: '', territory: '', territoryId: '', leadType: '', attachments: []
  });

  const handleOpenModal = (lead = null) => {
    if (lead) {
      setEditingLead(lead);
      // Normalize productInterest to always be an array
      const pi = lead.productInterest;
      const piArray = Array.isArray(pi) ? pi : (pi ? [pi] : []);
      setFormData({
        state: '',
        city: '',
        district: '',
        territory: '',
        territoryId: '',
        leadType: '',
        attachments: [],
        ...lead,
        productInterest: piArray,
        followUpDate: lead.followUpDate ? lead.followUpDate.split('T')[0] : ''
      });
      setIsCustomProduct(false);
    } else {
      setEditingLead(null);
      setIsCustomProduct(false);
      setFormData({
        name: '', company: '', phone: '', email: '', productInterest: [],
        leadSource: '', assignedTo: isSalesRole(user?.role) ? user.id : '',
        status: 'Lead Created', followUpDate: '', notes: '', dealValue: '',
        state: '', city: '', district: '', territory: '', territoryId: '', leadType: '', attachments: []
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsCustomProduct(false);
  };

  // ── Converting a lead into an order ──────────────────────────────────────
  // A lead records which products interest a customer, never how many. The
  // order used to be raised automatically from that, which meant guessing: one
  // unit of the first product, priced at the whole deal value. This asks.
  const [convertingLead, setConvertingLead] = useState(null);
  const [convertStatus, setConvertStatus] = useState('First Order');
  const [convertItems, setConvertItems] = useState([]);
  const [convertError, setConvertError] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const priceFor = (name) => {
    const p = (productCatalog || []).find(c => c.name === name);
    return Number(p?.distributorPrice ?? p?.mrp ?? 0);
  };

  const beginConversion = (lead, targetStatus) => {
    const interest = Array.isArray(lead.productInterest)
      ? lead.productInterest
      : (lead.productInterest ? [lead.productInterest] : []);
    const rows = interest.filter(Boolean).map(name => ({ name, quantity: '', unitPrice: priceFor(name) }));
    setConvertItems(rows.length > 0 ? rows : [{ name: '', quantity: '', unitPrice: 0 }]);
    setConvertStatus(targetStatus);
    setConvertError('');
    setConvertingLead(lead);
  };

  const updateConvertItem = (idx, patch) => {
    setConvertItems(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const nextRow = { ...row, ...patch };
      // Picking a different product refreshes the price, unless it was edited.
      if (patch.name !== undefined) nextRow.unitPrice = priceFor(patch.name);
      return nextRow;
    }));
  };

  const convertTotal = convertItems.reduce(
    (sum, i) => sum + (Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0
  );
  const convertUnits = convertItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

  const confirmConversion = async () => {
    if (!convertingLead || isConverting) return;
    setIsConverting(true);
    setConvertError('');
    try {
      const result = await convertLeadToOrder(convertingLead, convertItems, convertStatus);
      if (result && !result.ok) { setConvertError(result.error || 'Could not raise the order.'); return; }
      setConvertingLead(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formData.status === 'Converted') {
      if (!formData.state || !formData.state.trim() || !formData.city || !formData.city.trim()) {
        toast("⚠️ Cannot convert lead: Please select a State and enter a City first.", 'error');
        return;
      }
    }

    // Save any custom typed product to the global catalog
    (formData.productInterest || []).forEach(p => addProduct(p));

    const dataToSave = {
      ...formData,
      followUpDate: formData.followUpDate ? new Date(formData.followUpDate).toISOString() : null,
      dealValue: Number(formData.dealValue)
    };

    // A status change into conversion is confirmed separately, so save the rest
    // of the edits against the current status and let the confirm step move it.
    const wantsConversion = editingLead
      && isConversion(formData.status)
      && !isConversion(editingLead.status)
      && !editingLead.orderCreated;

    if (editingLead) {
      updateLead(editingLead.id, wantsConversion ? { ...dataToSave, status: editingLead.status } : dataToSave);
    } else {
      addLead(dataToSave);
    }
    const target = formData.status;
    closeModal();
    if (wantsConversion) beginConversion({ ...editingLead, ...dataToSave, status: editingLead.status }, target);
  };

  const handleExport = () => {
    const formattedData = visibleLeads.map(l => ({
      ...l,
      followUpDate: l.followUpDate ? format(new Date(l.followUpDate), 'yyyy-MM-dd') : 'None',
      salesperson: mockUsers.find(u => u.id === l.assignedTo)?.name || 'Unassigned'
    }));
    downloadCSV(formattedData, 'PRISMORA_Leads');
  };

  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    if (isConversion(destination.droppableId)) {
      const targetLead = leads.find(l => l.id === draggableId);
      if (!targetLead || !targetLead.state || !targetLead.state.trim() || !targetLead.city || !targetLead.city.trim()) {
        toast("⚠️ Cannot convert lead: Please edit the lead and set both State and City before converting.", 'error');
        return;
      }
      // Confirm the quantities before any order exists.
      if (!targetLead.orderCreated) { beginConversion(targetLead, destination.droppableId); return; }
    }

    // The droppableId is the status string
    updateLead(draggableId, { status: destination.droppableId });
  };

  // Colours come from Master Lists, where whoever added the status chose one.
  // This used to be a switch of nine hardcoded cases, so a status added on the
  // Masters screen arrived here grey and looked broken.
  const statusColor = (status) => colorForKey(masters, 'lead_status', status);

  const columns = [
    {
      key: 'name', header: 'Name & Company', sort: l => l.name,
      render: l => (
        <>
          <div className="font-semibold text-white">{l.name}</div>
          <div className="text-[11px] text-slate-500">{l.company}</div>
        </>
      ),
    },
    {
      key: 'contact', header: 'Contact', hideBelow: 'md',
      render: l => (
        <>
          <div className="truncate">{l.email}</div>
          <div className="text-[11px] text-slate-500">{l.phone}</div>
        </>
      ),
    },
    {
      key: 'value', header: 'Product / Value', align: 'right', sort: l => Number(l.dealValue) || 0,
      render: l => {
        const items = (Array.isArray(l.productInterest) ? l.productInterest : [l.productInterest]).filter(Boolean);
        return (
          <>
            <div className="font-semibold text-white">&#8377;{Number(l.dealValue || 0).toLocaleString('en-IN')}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {items.length ? items.slice(0, 2).join(', ') : '—'}
              {items.length > 2 ? ` +${items.length - 2}` : ''}
            </div>
          </>
        );
      },
    },
    {
      key: 'source', header: 'Source', hideBelow: 'lg', sort: l => l.leadSource || '',
      render: l => (l.leadSource
        ? <Badge color={colorForKey(masters, 'lead_source', l.leadSource)}>{labelForKey(masters, 'lead_source', l.leadSource)}</Badge>
        : <span className="text-slate-600">&mdash;</span>),
    },
    {
      key: 'status', header: 'Status', sort: l => l.status || '',
      render: l => <Badge color={statusColor(l.status)}>{labelForKey(masters, 'lead_status', l.status)}</Badge>,
    },
    {
      key: 'followUp', header: 'Follow Up', hideBelow: 'sm',
      sort: l => (l.followUpDate ? new Date(l.followUpDate).getTime() : null),
      render: l => {
        if (!l.followUpDate) return <span className="text-slate-600">None</span>;
        const days = differenceInDays(new Date(l.followUpDate), new Date());
        const soon = days <= 2 && l.status !== 'First Order' && l.status !== 'Active';
        return (
          <span className={`inline-flex items-center gap-1.5 ${soon ? 'text-amber-400 font-semibold' : ''}`}>
            {format(new Date(l.followUpDate), 'dd MMM yyyy')}
            {soon && <AlertCircle size={13} className="flex-shrink-0" />}
          </span>
        );
      },
    },
    {
      key: 'actions', header: '', align: 'right', width: 'w-24',
      render: l => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton icon={Edit2} title="Edit lead" size="sm" tone="accent"
            onClick={e => { e.stopPropagation(); handleOpenModal(l); }} />
          <IconButton icon={Trash2} title="Delete lead" size="sm" tone="danger"
            onClick={e => { e.stopPropagation(); deleteLead(l.id); }} />
        </div>
      ),
    },
  ];

  const renderTable = () => (
    <div className="mt-6 animate-fade-in-up">
      <DataTable
        title="Leads"
        columns={columns}
        rows={visibleLeads}
        rowKey={l => l.id}
        rowId={l => `lead-row-${l.id}`}
        rowClassName={l => (highlightedRowId === l.id ? 'bg-brand-accent/15' : '')}
        onRowClick={l => setSelectedLeadView(l)}
        search={l => `${l.name} ${l.company} ${l.email} ${l.phone} ${l.leadSource || ''} ${l.status || ''}`}
        searchPlaceholder="Search name, company, email"
        empty={{
          icon: User,
          title: 'No leads yet',
          hint: 'A lead is anyone who might become a customer. Add the first one and it will show up here with its follow-up date.',
          action: <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>Add Lead</Button>,
        }}
      />
    </div>
  );

  const renderKanban = () => (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 mt-6 animate-fade-in-up items-start h-[calc(100vh-250px)]">
        {statusOptions.map(({ key: status, label: statusLabel }) => {
          const columnLeads = visibleLeads.filter(l => l.status === status);
          return (
            <div key={status} className="min-w-[300px] w-[300px] glass-panel rounded-xl p-3 flex flex-col h-full bg-brand-primary-light/60">
              <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="font-semibold text-slate-200">{statusLabel}</h3>
                <span className="text-xs font-medium bg-brand-primary-lighter px-2 py-1 rounded-full">{columnLeads.length}</span>
              </div>

              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 overflow-y-auto custom-scrollbar p-1 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-brand-primary-lighter/30' : ''}`}
                  >
                    {columnLeads.map((lead, index) => {
                      const daysUntilFollowUp = lead.followUpDate ? differenceInDays(new Date(lead.followUpDate), new Date()) : null;
                      const isDueSoon = daysUntilFollowUp !== null && daysUntilFollowUp <= 2 && lead.status !== 'Converted' && lead.status !== 'Lost';

                      return (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              id={`lead-board-${lead.id}`}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setSelectedLeadView(lead)}
                              className={`bg-brand-primary border border-slate-700/50 rounded-xl p-4 mb-3 shadow-sm hover:border-brand-accent/50 cursor-pointer transition-all ${snapshot.isDragging ? 'rotate-2 shadow-2xl shadow-brand-accent/10 border-brand-accent scale-105' : ''} ${highlightedRowId === lead.id ? 'ring-2 ring-brand-accent bg-brand-accent/10' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-white text-sm">{lead.name}</h4>
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenModal(lead); }}
                                    className="text-slate-400 hover:text-blue-400 transition-colors"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-400 mb-2">{lead.company}</p>
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-medium text-brand-accent">₹{lead.dealValue.toLocaleString()}</span>
                                {isDueSoon && <AlertCircle size={14} className="text-red-400 animate-pulse" title="Follow up due soon!" />}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  );

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={User}
        title="Lead Management"
        subtitle="Manage and track your potential customers."
        actions={
          <>
            <div className="flex bg-brand-primary-lighter/50 p-1 rounded-xl border border-white/10 h-10 items-center">
              {[{ id: 'table', Icon: List, label: 'Table view' }, { id: 'board', Icon: LayoutGrid, label: 'Board view' }].map(v => (
                <button
                  key={v.id}
                  type="button"
                  title={v.label}
                  aria-label={v.label}
                  aria-pressed={viewMode === v.id}
                  onClick={() => setViewMode(v.id)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    viewMode === v.id ? 'bg-brand-accent/15 text-brand-accent' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <v.Icon size={15} />
                </button>
              ))}
            </div>

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
            <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>Add Lead</Button>
          </>
        }
      />

      {viewMode === 'table' ? renderTable() : renderKanban()}

      {/* Read-Only Lead Details Modal */}
      {selectedLeadView && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-brand-primary/80 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-brand-primary-light border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-white/10 flex justify-between items-start bg-brand-primary">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-white">{selectedLeadView.name}</h2>
                  <Badge color={statusColor(selectedLeadView.status)} className="text-[11px] px-2.5 py-1">
                    {labelForKey(masters, 'lead_status', selectedLeadView.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-2 text-slate-400 text-sm">
                  <Building size={14} />
                  <span>{selectedLeadView.company || 'No Company'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const leadToEdit = selectedLeadView;
                    setSelectedLeadView(null);
                    handleOpenModal(leadToEdit);
                  }}
                  className="bg-brand-primary-lighter hover:bg-white/10 text-brand-accent px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  <Edit2 size={14} /> Edit
                </button>
                <button onClick={() => setSelectedLeadView(null)} className="text-slate-400 hover:text-white p-2 rounded-lg transition-colors bg-white/5 hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-brand-primary-light/50 space-y-6">
              {/* Status Stepper Timeline or Lost Warning Banner */}
              {selectedLeadView.status === 'Lost' ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start gap-3.5 text-red-400">
                  <AlertCircle size={20} className="mt-0.5 flex-shrink-0 animate-pulse" />
                  <div>
                    <h4 className="text-sm font-bold text-red-300">Closed Lost / Disqualified</h4>
                    <p className="text-xs text-red-400/80 mt-1 leading-relaxed">This lead has been marked as lost or inactive. You can edit this lead's status anytime to move them back into the active pipeline.</p>
                  </div>
                </div>
              ) : (() => {
                const progressiveStages = statusOptions.filter(o => o.key !== 'Lost').map(o => o.key);
                const labelOf = (k) => (statusOptions.find(o => o.key === k) || {}).label || k;
                return (
                  <div className="bg-brand-primary/80 border border-white/5 rounded-2xl p-4 shadow-inner">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-4">Lead Progress Journey</span>
                    <div className="relative flex items-start justify-between">
                      {/* Connector Line */}
                      <div className="absolute left-[14px] right-[14px] top-[14px] -translate-y-1/2 h-0.5 bg-slate-800 pointer-events-none">
                        <div
                          className="h-full bg-brand-accent transition-all duration-500"
                          style={{
                            width: `${(progressiveStages.indexOf(selectedLeadView.status) / (progressiveStages.length - 1)) * 100
                              }%`
                          }}
                        />
                      </div>

                      {/* Nodes */}
                      {progressiveStages.map((status, idx) => {
                        const activeIdx = progressiveStages.indexOf(selectedLeadView.status);
                        const isCompleted = idx < activeIdx;
                        const isActive = idx === activeIdx;

                        return (
                          <div key={status} className="relative z-10 flex flex-col items-center">
                            <div
                              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-[10px] transition-all duration-300 ${isActive
                                  ? 'bg-brand-accent border-brand-accent text-white shadow-lg shadow-brand-accent/30 scale-110'
                                  : isCompleted
                                    ? 'bg-brand-primary border-brand-accent text-brand-accent'
                                    : 'bg-brand-primary border-slate-700 text-slate-500'
                                }`}
                              title={labelOf(status)}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            <span
                              className={`text-[9px] leading-tight mt-1.5 font-bold text-center max-w-[65px] transition-colors ${isActive
                                  ? 'text-brand-accent font-extrabold'
                                  : isCompleted
                                    ? 'text-slate-300'
                                    : 'text-slate-500'
                                }`}
                            >
                              {labelOf(status)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Contact Details</h3>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><Mail size={16} /></div>
                    <div>
                      <p className="text-xs text-slate-400">Email Address</p>
                      <p className="text-white font-medium">{selectedLeadView.email || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><Phone size={16} /></div>
                    <div>
                      <p className="text-xs text-slate-400">Phone Number</p>
                      <p className="text-white font-medium">{selectedLeadView.phone || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><User size={16} /></div>
                    <div>
                      <p className="text-xs text-slate-400">Assigned Salesperson</p>
                      <p className="text-white font-medium">
                        {mockUsers.find(u => u.id === selectedLeadView.assignedTo)?.name || 'Unassigned'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><MapPin size={16} /></div>
                    <div>
                      <p className="text-xs text-slate-400">City / District & State</p>
                      <p className="text-white font-medium">
                        {selectedLeadView.city || selectedLeadView.state
                          ? `${selectedLeadView.city || ''}${selectedLeadView.city && selectedLeadView.state ? ', ' : ''}${selectedLeadView.state || ''}`
                          : 'Not specified'
                        }
                      </p>
                      {(selectedLeadView.territoryId || selectedLeadView.territory) && (
                        <p className="text-xs text-slate-500 mt-0.5">Territory: {territoryName(territories, selectedLeadView)}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Deal Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Deal Information</h3>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><Package size={16} /></div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-400">Product Interest</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(Array.isArray(selectedLeadView.productInterest) ? selectedLeadView.productInterest : [selectedLeadView.productInterest]).filter(Boolean).map(p => (
                          <span key={p} className="text-xs bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2.5 py-1 rounded-full font-medium">{p}</span>
                        ))}
                        {(!selectedLeadView.productInterest || (Array.isArray(selectedLeadView.productInterest) && selectedLeadView.productInterest.length === 0)) && (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><DollarSign size={16} /></div>
                    <div>
                      <p className="text-xs text-slate-400">Estimated Value</p>
                      <p className="text-brand-accent font-bold text-lg">₹{selectedLeadView.dealValue?.toLocaleString() || '0'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5"><Calendar size={16} /></div>
                    <div>
                      <p className="text-xs text-slate-400">Next Follow-up</p>
                      <p className="text-white font-medium">
                        {selectedLeadView.followUpDate ? format(new Date(selectedLeadView.followUpDate), 'MMMM dd, yyyy') : 'No date set'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Lead Source</p>
                      <p className="text-white font-medium">{selectedLeadView.leadSource || 'Not specified'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Lead Type</p>
                      <p className="text-white font-medium">{selectedLeadView.leadType || 'Not specified'}</p>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="md:col-span-2 mt-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Notes & Context</h3>
                  <div className="bg-brand-primary rounded-xl p-4 border border-white/5 min-h-[80px]">
                    {selectedLeadView.notes ? (
                      <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{selectedLeadView.notes}</p>
                    ) : (
                      <p className="text-slate-500 italic">No notes have been added for this lead.</p>
                    )}
                  </div>
                </div>

                {/* Uploaded Documents Section */}
                <div className="md:col-span-2 mt-2">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Documents & Attachments</h3>
                  <div className="flex flex-wrap gap-2.5">
                    {selectedLeadView.attachments && selectedLeadView.attachments.length > 0 ? (
                      selectedLeadView.attachments.map((file, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-slate-800/80 text-slate-200 border border-slate-700/80 px-3.5 py-2.5 rounded-xl font-medium shadow-sm">
                          <FileText size={14} className="text-brand-accent" />
                          <span>{file}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic">No files attached to this lead.</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit/Add Form Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-brand-primary/80 backdrop-blur-sm">
          <div className="bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-brand-primary-light z-10">
              <h2 className="text-xl font-bold text-white">{editingLead ? 'Edit Lead' : 'Add New Lead'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label htmlFor="leads-name" className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
                  <input id="leads-name" type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label htmlFor="leads-company" className="block text-sm font-medium text-slate-300 mb-1.5">Company</label>
                  <input id="leads-company" type="text" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label htmlFor="leads-email" className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                  <input id="leads-email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label htmlFor="leads-phone" className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
                  <input id="leads-phone" type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Products Interested In
                    <span className="ml-2 text-xs text-slate-500 font-normal">({(formData.productInterest || []).length} selected)</span>
                  </label>

                  {/* Selected product chips */}
                  {(formData.productInterest || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {formData.productInterest.map(p => (
                        <span key={p} className="flex items-center gap-1.5 text-xs bg-brand-accent/15 text-brand-accent border border-brand-accent/30 px-3 py-1.5 rounded-full font-medium">
                          {p}
                          <button type="button" onClick={() => setFormData({ ...formData, productInterest: formData.productInterest.filter(x => x !== p) })} className="hover:text-white transition-colors text-brand-accent/70">✕</button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add from catalog dropdown */}
                  {isCustomProduct ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Type new product name and press Add..."
                        className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.target.value.trim();
                            if (val && !(formData.productInterest || []).includes(val)) {
                              setFormData({ ...formData, productInterest: [...(formData.productInterest || []), val] });
                            }
                            e.target.value = '';
                            setIsCustomProduct(false);
                          }
                        }}
                      />
                      <button type="button" onClick={() => setIsCustomProduct(false)} className="px-3 py-2 bg-brand-primary border border-slate-700/50 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">✕</button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsCustomProduct(true);
                        } else if (e.target.value && !(formData.productInterest || []).includes(e.target.value)) {
                          setFormData({ ...formData, productInterest: [...(formData.productInterest || []), e.target.value] });
                        }
                      }}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="" className="bg-brand-primary text-slate-500">+ Add a product from catalog...</option>
                      {(products || []).filter(p => !(formData.productInterest || []).includes(p)).map(p => (
                        <option key={p} value={p} className="bg-brand-primary">{p}</option>
                      ))}
                      <option value="__ADD_NEW__" className="bg-brand-primary text-brand-accent font-bold">✏️ Type a custom product...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor="leads-deal-value" className="block text-sm font-medium text-slate-300 mb-1.5">Deal Value (₹)</label>
                  <input id="leads-deal-value" type="number" required value={formData.dealValue} onChange={e => setFormData({ ...formData, dealValue: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>

                <div>
                  <label htmlFor="leads-lead-source" className="block text-sm font-medium text-slate-300 mb-1.5">Lead Source</label>
                  <select id="leads-lead-source" value={formData.leadSource || ''} onChange={e => setFormData({ ...formData, leadSource: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Source --</option>
                    {sourceOptions.map(o => <option key={o.key} value={o.key} className="bg-brand-primary">{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="leads-lead-type" className="block text-sm font-medium text-slate-300 mb-1.5">Lead Type</label>
                  <select id="leads-lead-type" value={formData.leadType || ''} onChange={e => setFormData({ ...formData, leadType: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Lead Type --</option>
                    <option value="Distributor" className="bg-brand-primary">Distributor</option>
                    <option value="Super Stockist" className="bg-brand-primary">Super Stockist</option>
                    <option value="Dealer" className="bg-brand-primary">Dealer</option>
                    <option value="Retailer" className="bg-brand-primary">Retailer</option>
                  </select>
                </div>
                {!isSalesRole(user?.role) && (
                  <div>
                    <label htmlFor="leads-assign-to" className="block text-sm font-medium text-slate-300 mb-1.5">Assign To</label>
                    <select id="leads-assign-to" value={formData.assignedTo} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                      <option value="" className="bg-brand-primary">Select Salesperson</option>
                      {getAssignableUsers().map(u => (
                        <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="leads-status" className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select id="leads-status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                    {statusOptions.map(o => <option key={o.key} value={o.key} className="bg-brand-primary">{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="leads-state-optional" className="block text-sm font-medium text-slate-300 mb-1.5">State (Optional)</label>
                  <select id="leads-state-optional"
                    value={formData.state || ''}
                    onChange={e => setFormData({ ...formData, state: e.target.value, city: '' })}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s} className="bg-brand-primary">{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="leads-city-district-optional" className="block text-sm font-medium text-slate-300 mb-1.5">City / District (Optional)</label>
                  {formData.state && STATE_DISTRICTS[formData.state] ? (
                    <select id="leads-city-district-optional"
                      value={formData.city || ''}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="" className="bg-brand-primary text-slate-500">-- Select City / District --</option>
                      {STATE_DISTRICTS[formData.state].map(d => (
                        <option key={d} value={d} className="bg-brand-primary">{d}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData.city || ''}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      placeholder={formData.state ? `Enter city/district in ${formData.state}...` : "Select a state first..."}
                      disabled={!formData.state}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="leads-territory-optional" className="block text-sm font-medium text-slate-300 mb-1.5">Territory (Optional)</label>
                  {/* Was a free text box, which is how three distributors came
                      to sit in a territory called "Gujrat North Hub" that no
                      beat plan or report could find. A lead reaching the right
                      rep depends on this naming something that exists. */}
                  <select id="leads-territory-optional"
                    value={formData.territoryId || ''}
                    onChange={e => setFormData({ ...formData, ...territoryFields(territories, e.target.value) })}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                  >
                    <option value="">{(territories || []).length ? '— Select territory —' : 'No territories set up yet'}</option>
                    {(territories || []).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.state ? ` (${t.state})` : ''}</option>
                    ))}
                  </select>
                  {formData.territory && !formData.territoryId && (
                    <p className="text-xs text-amber-400 mt-1">Currently &ldquo;{formData.territory}&rdquo;, which matches no territory on record. Pick one to fix it.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="leads-follow-up-date" className="block text-sm font-medium text-slate-300 mb-1.5">Follow Up Date</label>
                  <input id="leads-follow-up-date" type="date" value={formData.followUpDate} onChange={e => setFormData({ ...formData, followUpDate: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }} />
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="leads-remarks-notes" className="block text-sm font-medium text-slate-300 mb-1.5">Remarks / Notes</label>
                <textarea id="leads-remarks-notes" rows="3" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full glass-input rounded-lg px-4 py-2.5 text-white custom-scrollbar" placeholder="Add primary remarks or notes..."></textarea>
              </div>

              {/* Documents & File Attachments Upload Mock */}
              <div className="mt-4 col-span-2">
                <label htmlFor="leads-lead-documents-attachments" className="block text-sm font-medium text-slate-300 mb-1.5">Lead Documents & Attachments</label>
                <div className="border-2 border-dashed border-slate-700 rounded-xl p-4 text-center hover:border-brand-accent/50 transition-colors relative cursor-pointer bg-brand-primary-lighter/10">
                  <input id="leads-lead-documents-attachments"
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => {
                      const files = Array.from(e.target.files).map(f => f.name);
                      setFormData(prev => ({
                        ...prev,
                        attachments: [...(prev.attachments || []), ...files]
                      }));
                    }}
                  />
                  <FileText className="mx-auto mb-2 text-slate-500" size={24} />
                  <span className="text-xs text-slate-400 block">Drag and drop files here, or <span className="text-brand-accent font-semibold underline">browse</span></span>
                  <span className="text-[10px] text-slate-600 block mt-1">PDF, DOC, Images (Max 10MB)</span>
                </div>
                {/* Render listed files */}
                {(formData.attachments || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {(formData.attachments || []).map((file, idx) => (
                      <span key={idx} className="flex items-center gap-1.5 text-xs bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700">
                        {file}
                        <button type="button" onClick={() => setFormData({ ...formData, attachments: formData.attachments.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-300 font-bold ml-1">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700/50">
                <button type="button" onClick={closeModal} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-brand-accent text-brand-primary font-bold rounded-lg hover:bg-brand-accent-light hover:shadow-lg hover:shadow-brand-accent/20 transition-all">
                  {editingLead ? 'Update Lead' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
        , document.body)}

      {/* Confirm the order before it exists — the lead has no quantities. */}
      {convertingLead && createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => !isConverting && setConvertingLead(null)}>
          <div className="glass-panel bg-brand-primary rounded-2xl w-full max-w-2xl border border-white/10 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Confirm the order</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {convertingLead.name}{convertingLead.company ? ` · ${convertingLead.company}` : ''} — moving to {convertStatus}
                </p>
              </div>
              <button onClick={() => !isConverting && setConvertingLead(null)} className="text-slate-400 hover:text-white transition-colors p-1"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                The lead records which products interest this customer, but not how many. Enter the quantities being
                ordered — these set the stock that leaves the warehouse on delivery.
              </p>

              <div className="space-y-3">
                {convertItems.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-6">
                      <label htmlFor="leads-product" className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">Product</label>
                      <select id="leads-product"
                        value={row.name}
                        onChange={e => updateConvertItem(idx, { name: e.target.value })}
                        className="w-full glass-input rounded-lg px-3 py-2 text-sm text-white"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="" className="bg-brand-primary">Select a product…</option>
                        {(productCatalog || []).map(p => (
                          <option key={p.id} value={p.name} className="bg-brand-primary">{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <label htmlFor="leads-quantity" className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">Quantity</label>
                      <input id="leads-quantity"
                        type="number" min="0" value={row.quantity}
                        onChange={e => updateConvertItem(idx, { quantity: e.target.value })}
                        placeholder="0"
                        className="w-full glass-input rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <label htmlFor="leads-unit" className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">Unit ₹</label>
                      <input id="leads-unit"
                        type="number" min="0" value={row.unitPrice}
                        onChange={e => updateConvertItem(idx, { unitPrice: e.target.value })}
                        className="w-full glass-input rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1">
                      <span className="text-sm font-medium text-white tabular-nums">
                        ₹{(Number(row.quantity || 0) * Number(row.unitPrice || 0)).toLocaleString('en-IN')}
                      </span>
                      {convertItems.length > 1 && (
                        <button type="button" onClick={() => setConvertItems(prev => prev.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-red-400 p-1"><X size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setConvertItems(prev => [...prev, { name: '', quantity: '', unitPrice: 0 }])}
                className="text-xs text-brand-accent hover:underline font-medium"
              >
                + Add another product
              </button>

              <div className="pt-4 border-t border-white/5 flex flex-wrap gap-4 justify-between items-end">
                <div className="text-xs text-slate-500">
                  Deal value recorded on the lead: <span className="text-slate-300 font-medium">₹{Number(convertingLead.dealValue || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">Order total · {convertUnits.toLocaleString('en-IN')} units</p>
                  <p className="text-2xl font-extrabold text-white tabular-nums">₹{convertTotal.toLocaleString('en-IN')}</p>
                </div>
              </div>

              {convertTotal > 0 && Number(convertingLead.dealValue || 0) > 0 && convertTotal !== Number(convertingLead.dealValue) && (
                <p className="text-[11px] text-amber-400">
                  This differs from the deal value on the lead. The order will be raised for ₹{convertTotal.toLocaleString('en-IN')}.
                </p>
              )}

              {convertError && <p className="text-red-400 text-sm font-medium">{convertError}</p>}
            </div>

            <div className="p-6 border-t border-white/5 flex justify-end gap-3">
              <button type="button" onClick={() => setConvertingLead(null)} disabled={isConverting} className="px-5 py-2 text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={confirmConversion}
                disabled={isConverting || convertUnits <= 0}
                className="px-5 py-2 bg-brand-accent text-white font-bold rounded-lg hover:bg-brand-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isConverting ? 'Creating…' : 'Create order'}
              </button>
            </div>
          </div>
        </div>
        , document.body)}
    </div>
  );
};

export default Leads;


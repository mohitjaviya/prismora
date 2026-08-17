import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole, isAdminRole, isManagerRole } from '../context/AuthContext';
import { format, differenceInDays } from 'date-fns';
import { Plus, Edit2, Trash2, AlertCircle, LayoutGrid, List, Download, X, User, Phone, Mail, FileText, Calendar, Building, Package, DollarSign, MapPin } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { downloadCSV } from '../utils/exportUtils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { STATE_DISTRICTS } from '../utils/indianStatesDistricts';

const STATUSES = [
  'Lead Created', 'Call', 'Sample Sent', 'Meeting', 
  'Negotiation', 'Distributor Approved', 'First Order', 'Active', 'Lost'
];

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
  const { leads, addLead, updateLead, deleteLead, products, addProduct } = useData();
  const { user, users: mockUsers, canAccessData, getAssignableUsers } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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
    state: '', city: '', district: '', territory: '', leadType: '', attachments: []
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
        state: '', city: '', district: '', territory: '', leadType: '', attachments: []
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsCustomProduct(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (formData.status === 'Converted') {
      if (!formData.state || !formData.state.trim() || !formData.city || !formData.city.trim()) {
        alert("⚠️ Cannot convert lead: Please select a State and enter a City first.");
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

    if (editingLead) {
      updateLead(editingLead.id, dataToSave);
    } else {
      addLead(dataToSave);
    }
    closeModal();
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

    if (destination.droppableId === 'First Order' || destination.droppableId === 'Active') {
      const targetLead = leads.find(l => l.id === draggableId);
      if (!targetLead || !targetLead.state || !targetLead.state.trim() || !targetLead.city || !targetLead.city.trim()) {
        alert("⚠️ Cannot convert lead: Please edit the lead and set both State and City before converting.");
        return;
      }
    }

    // The droppableId is the status string
    updateLead(draggableId, { status: destination.droppableId });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Lead Created': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Call': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'Sample Sent': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'Meeting': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Negotiation': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Distributor Approved': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      case 'First Order': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Active': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Lost': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const renderTable = () => (
    <div className="glass-panel rounded-2xl overflow-hidden mt-6 animate-fade-in-up">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-brand-primary-lighter/50 text-slate-400 border-b border-slate-700/50">
            <tr>
              <th className="px-6 py-4 font-medium">Name &amp; Company</th>
              <th className="px-6 py-4 font-medium">Contact</th>
              <th className="px-6 py-4 font-medium">Product / Value</th>
              <th className="px-6 py-4 font-medium">Source</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Follow Up</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {visibleLeads.length > 0 ? visibleLeads.map((lead) => {
              const daysUntilFollowUp = lead.followUpDate ? differenceInDays(new Date(lead.followUpDate), new Date()) : null;
              const isDueSoon = daysUntilFollowUp !== null && daysUntilFollowUp <= 2 && lead.status !== 'First Order' && lead.status !== 'Active';

              return (
                <tr 
                  key={lead.id} 
                  id={`lead-row-${lead.id}`} 
                  onClick={() => setSelectedLeadView(lead)}
                  className={`hover:bg-brand-primary-lighter/30 transition-colors cursor-pointer group ${highlightedRowId === lead.id ? 'bg-brand-accent/20' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.company}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div>{lead.email}</div>
                    <div className="text-xs text-slate-500">{lead.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(Array.isArray(lead.productInterest) ? lead.productInterest : [lead.productInterest]).filter(Boolean).slice(0,2).map(p => (
                        <span key={p} className="text-xs bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-0.5 rounded-full">{p}</span>
                      ))}
                      {Array.isArray(lead.productInterest) && lead.productInterest.length > 2 && (
                        <span className="text-xs text-slate-500">+{lead.productInterest.length - 2} more</span>
                      )}
                    </div>
                    <div className="text-xs font-medium">₹{lead.dealValue.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs bg-slate-700/50 text-slate-300 border border-slate-600/30 px-2 py-0.5 rounded-full">{lead.leadSource || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span>{lead.followUpDate ? format(new Date(lead.followUpDate), 'MMM dd, yyyy') : 'None'}</span>
                      {isDueSoon && <AlertCircle size={16} className="text-red-400 animate-pulse" title="Follow up due soon!" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleOpenModal(lead); }} 
                      className="text-blue-400 hover:text-blue-300 mr-3 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteLead(lead.id); }} 
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="7" className="px-6 py-8 text-center text-slate-500">No leads found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderKanban = () => (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 mt-6 animate-fade-in-up items-start h-[calc(100vh-250px)]">
        {STATUSES.map(status => {
          const columnLeads = visibleLeads.filter(l => l.status === status);
          return (
            <div key={status} className="min-w-[300px] w-[300px] glass-panel rounded-xl p-3 flex flex-col h-full bg-brand-primary-light/60">
              <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="font-semibold text-slate-200">{status}</h3>
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
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Management</h1>
          <p className="text-slate-400 text-sm">Manage and track your potential customers.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-brand-primary-light/80 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
            <button 
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-brand-primary-lighter text-brand-accent shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <List size={18} />
            </button>
            <button 
              onClick={() => setViewMode('board')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'board' ? 'bg-brand-primary-lighter text-brand-accent shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid size={18} />
            </button>
          </div>

          {(isAdminRole(user?.role) || isManagerRole(user?.role)) && (
            <select
              value={salespersonFilter}
              onChange={e => setSalespersonFilter(e.target.value)}
              className="glass-panel text-white text-sm px-3 py-2.5 rounded-xl border border-white/5 focus:ring-1 focus:ring-brand-accent appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23cbd5e1%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[position:right_10px_center] max-w-[160px]"
            >
              <option value="" className="bg-brand-primary">All Salespeople</option>
              {getAssignableUsers().map(u => (
                <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>
              ))}
            </select>
          )}

          <button 
            onClick={handleExport}
            className="glass-panel hover:bg-brand-primary-lighter/80 text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5"
          >
            <Download size={18} className="text-brand-accent" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button 
            onClick={() => handleOpenModal()}
            className="bg-gradient-to-r from-brand-accent to-brand-accent-dark hover:from-brand-accent-light hover:to-brand-accent text-brand-primary font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-brand-accent/20"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Lead</span>
          </button>
        </div>
      </div>
      
      {viewMode === 'table' ? renderTable() : renderKanban()}

      {/* Read-Only Lead Details Modal */}
      {selectedLeadView && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-brand-primary/80 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-brand-primary-light border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-white/10 flex justify-between items-start bg-brand-primary">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-white">{selectedLeadView.name}</h2>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(selectedLeadView.status)}`}>
                    {selectedLeadView.status}
                  </span>
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
                const progressiveStages = STATUSES.filter(s => s !== 'Lost');
                return (
                  <div className="bg-brand-primary/80 border border-white/5 rounded-2xl p-4 shadow-inner">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-4">Lead Progress Journey</span>
                    <div className="relative flex items-center justify-between">
                      {/* Connector Line */}
                      <div className="absolute left-6 right-6 top-3.5 -translate-y-1/2 h-0.5 bg-slate-800 pointer-events-none">
                        <div 
                          className="h-full bg-brand-accent transition-all duration-500"
                          style={{
                            width: `${
                              (progressiveStages.indexOf(selectedLeadView.status) / (progressiveStages.length - 1)) * 100
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
                              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-[10px] transition-all duration-300 ${
                                isActive 
                                  ? 'bg-brand-accent border-brand-accent text-white shadow-lg shadow-brand-accent/30 scale-110' 
                                  : isCompleted 
                                    ? 'bg-brand-primary border-brand-accent text-brand-accent' 
                                    : 'bg-brand-primary border-slate-700 text-slate-500'
                              }`}
                              title={status}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            <span 
                              className={`text-[8px] mt-1.5 font-bold text-center max-w-[65px] transition-colors ${
                                isActive 
                                  ? 'text-brand-accent font-extrabold' 
                                  : isCompleted 
                                    ? 'text-slate-300' 
                                    : 'text-slate-500'
                              }`}
                            >
                              {status}
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
                      {selectedLeadView.territory && (
                        <p className="text-xs text-slate-500 mt-0.5">Territory: {selectedLeadView.territory}</p>
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Lead Source</p>
                      <p className="text-white font-medium">{selectedLeadView.leadSource || 'Not specified'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-brand-primary rounded-lg text-brand-accent mt-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
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
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Company</label>
                  <input type="text" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
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
                          <button type="button" onClick={() => setFormData({...formData, productInterest: formData.productInterest.filter(x => x !== p)})} className="hover:text-white transition-colors text-brand-accent/70">✕</button>
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
                              setFormData({...formData, productInterest: [...(formData.productInterest || []), val]});
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
                          setFormData({...formData, productInterest: [...(formData.productInterest || []), e.target.value]});
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
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Deal Value (₹)</label>
                  <input type="number" required value={formData.dealValue} onChange={e => setFormData({...formData, dealValue: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Lead Source</label>
                  <select value={formData.leadSource || ''} onChange={e => setFormData({...formData, leadSource: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Source --</option>
                    <option value="Exhibition" className="bg-brand-primary">Exhibition</option>
                    <option value="Reference" className="bg-brand-primary">Reference</option>
                    <option value="Website" className="bg-brand-primary">Website</option>
                    <option value="WhatsApp" className="bg-brand-primary">WhatsApp</option>
                    <option value="IndiaMart" className="bg-brand-primary">IndiaMart</option>
                    <option value="Cold Call" className="bg-brand-primary">Cold Call</option>
                    <option value="Instagram" className="bg-brand-primary">Instagram</option>
                    <option value="LinkedIn" className="bg-brand-primary">LinkedIn</option>
                    <option value="Trade Show" className="bg-brand-primary">Trade Show</option>
                    <option value="Walk-in" className="bg-brand-primary">Walk-in</option>
                    <option value="Other" className="bg-brand-primary">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Lead Type</label>
                  <select value={formData.leadType || ''} onChange={e => setFormData({...formData, leadType: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Lead Type --</option>
                    <option value="Distributor" className="bg-brand-primary">Distributor</option>
                    <option value="Super Stockist" className="bg-brand-primary">Super Stockist</option>
                    <option value="Dealer" className="bg-brand-primary">Dealer</option>
                    <option value="Retailer" className="bg-brand-primary">Retailer</option>
                  </select>
                </div>
                {!isSalesRole(user?.role) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Assign To</label>
                    <select value={formData.assignedTo} onChange={e => setFormData({...formData, assignedTo: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                      <option value="" className="bg-brand-primary">Select Salesperson</option>
                      {getAssignableUsers().map(u => (
                        <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }}>
                    {STATUSES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">State (Optional)</label>
                  <select
                    value={formData.state || ''}
                    onChange={e => setFormData({...formData, state: e.target.value, city: ''})}
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
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">City / District (Optional)</label>
                  {formData.state && STATE_DISTRICTS[formData.state] ? (
                    <select
                      value={formData.city || ''}
                      onChange={e => setFormData({...formData, city: e.target.value})}
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
                      onChange={e => setFormData({...formData, city: e.target.value})}
                      placeholder={formData.state ? `Enter city/district in ${formData.state}...` : "Select a state first..."}
                      disabled={!formData.state}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Territory (Optional)</label>
                  <input
                    type="text"
                    value={formData.territory || ''}
                    onChange={e => setFormData({...formData, territory: e.target.value})}
                    placeholder="e.g. Maharashtra West, Gujarat South..."
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Follow Up Date</label>
                  <input type="date" value={formData.followUpDate} onChange={e => setFormData({...formData, followUpDate: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }} />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Remarks / Notes</label>
                <textarea rows="3" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white custom-scrollbar" placeholder="Add primary remarks or notes..."></textarea>
              </div>

              {/* Documents & File Attachments Upload Mock */}
              <div className="mt-4 col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Lead Documents & Attachments</label>
                <div className="border-2 border-dashed border-slate-700 rounded-xl p-4 text-center hover:border-brand-accent/50 transition-colors relative cursor-pointer bg-brand-primary-lighter/10">
                  <input 
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
                        <button type="button" onClick={() => setFormData({...formData, attachments: formData.attachments.filter((_, i) => i !== idx)})} className="text-red-400 hover:text-red-300 font-bold ml-1">✕</button>
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
    </div>
  );
};

export default Leads;


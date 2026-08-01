import { useState, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { isSalesRole, isManagerRole } from '../context/AuthContext';
import {
  Plus, CalendarCheck, MapPin, User, LogIn, LogOut, CheckCircle2,
  Clipboard, Smartphone, ShoppingCart, Check, X, FileText,
  Navigation, Receipt, BarChart3, Trophy, Target, TrendingUp,
  Upload, CheckSquare, XSquare, Route, Clock, Award, RefreshCw
} from 'lucide-react';
import { createPortal } from 'react-dom';

const EXPENSE_CATEGORIES = ['Travel', 'Food & Meals', 'Accommodation', 'Client Entertainment', 'Fuel', 'Miscellaneous'];

export default function SFA() {
  const { user, users: allUsers, isAdmin, isManager, isSales } = useAuth();
  const {
    beatPlans, addBeatPlan, updateBeatPlanStatus,
    attendance, addAttendanceRecord, updateAttendanceRecord,
    visitReports, addVisitReport,
    sfaExpenses, addSFAExpense, updateSFAExpense,
    addOrder, productCatalog, territories, orders
  } = useData();

  const [activeTab, setActiveTab] = useState('attendance');

  // Role checks
  const isSREP = isSales || user?.role === 'Sales Executive';
  const isManagerOrAbove = isAdmin || isManager;

  // ── GPS State ───────────────────────────────────────────────────────────
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationHistory, setLocationHistory] = useState([]);

  // ── Modal States ────────────────────────────────────────────────────────
  const [isBeatModalOpen, setIsBeatModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedBeatForVisit, setSelectedBeatForVisit] = useState(null);

  // ── Forms ───────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const [beatForm, setBeatForm] = useState({ executiveId: '', date: todayStr, territory: '', outlets: '' });
  const [visitForm, setVisitForm] = useState({ outletName: '', outletContact: '', productsShown: [], orderPlaced: false, pitchedProd: '', pitchedQty: '10', pitchedVal: '1500', nextFollowUp: '', notes: '' });
  const [punchNotes, setPunchNotes] = useState('');
  const [expenseForm, setExpenseForm] = useState({ date: todayStr, category: 'Travel', amount: '', description: '', receiptName: '', receiptData: '' });
  const [selectedAttendanceUser, setSelectedAttendanceUser] = useState('');
  const [isPunchingIn, setIsPunchingIn] = useState(false);

  // ── Derived Data ────────────────────────────────────────────────────────
  const salesReps = useMemo(() => allUsers.filter(u => isSalesRole(u.role) || u.role === 'Sales Executive'), [allUsers]);
  const myAttendanceToday = useMemo(() => attendance.find(a => a.userId === user?.id && a.date === todayStr), [attendance, user, todayStr]);
  const filteredBeats = useMemo(() => isSREP ? beatPlans.filter(b => b.executiveId === user?.id) : beatPlans, [beatPlans, isSREP, user]);
  const myExpenses = useMemo(() => {
    if (!sfaExpenses) return [];
    return isManagerOrAbove ? sfaExpenses : sfaExpenses.filter(e => e.userId === user?.id);
  }, [sfaExpenses, isManagerOrAbove, user]);

  const getRepName = (id) => allUsers.find(u => u.id === id)?.name || 'Unknown';

  // ── GPS Functions ───────────────────────────────────────────────────────
  const captureLocation = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation is not supported by your browser.'); return; }
    setIsLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setGpsLocation(loc);
        setLocationHistory(prev => [...prev, loc]);
        setIsLocating(false);
      },
      (err) => { setGpsError(`Error: ${err.message}. Please allow location access.`); setIsLocating(false); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // ── Attendance ──────────────────────────────────────────────────────────
  const handlePunchIn = (e) => {
    e.preventDefault();
    setIsPunchingIn(true);
    const doSave = (punchLat, punchLng, punchAccuracy) => {
      addAttendanceRecord({
        userId: user.id,
        date: todayStr,
        status: 'Present',
        checkInTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        checkOutTime: null,
        notes: punchNotes || 'Checked in via Web DMS',
        punchInLat: punchLat,
        punchInLng: punchLng,
        punchInAccuracy: punchAccuracy,
      });
      setPunchNotes('');
      setIsPunchingIn(false);
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => doSave(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy)),
        () => doSave(null, null, null), // if denied, save without location
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      doSave(null, null, null);
    }
  };
  const handlePunchOut = () => {
    if (!myAttendanceToday) return;
    updateAttendanceRecord(myAttendanceToday.id, { checkOutTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), notes: myAttendanceToday.notes + ' | Checked out' + (punchNotes ? ': ' + punchNotes : '') });
    setPunchNotes('');
  };

  // ── Beat Plans ──────────────────────────────────────────────────────────
  const handleCreateBeat = (e) => {
    e.preventDefault();
    const outletsList = beatForm.outlets.split(',').map(o => o.trim()).filter(Boolean);
    addBeatPlan({ executiveId: beatForm.executiveId || user.id, date: beatForm.date, territory: beatForm.territory, outlets: outletsList });
    setBeatForm({ executiveId: '', date: todayStr, territory: '', outlets: '' });
    setIsBeatModalOpen(false);
  };

  // ── Visit Reports ───────────────────────────────────────────────────────
  const handleOpenVisit = (beat, outlet) => {
    setSelectedBeatForVisit({ beat, outlet });
    setVisitForm({ outletName: outlet, outletContact: '', productsShown: [], orderPlaced: false, pitchedProd: productCatalog[0]?.name || '', pitchedQty: '10', pitchedVal: '1500', nextFollowUp: '', notes: '' });
    setIsVisitModalOpen(true);
  };
  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    let autoOrderId = null;
    if (visitForm.orderPlaced && visitForm.pitchedProd) {
      // Use the real id addOrder assigns so the visit report links to an order
      // that actually exists (addOrder overrides any id passed to it).
      autoOrderId = await addOrder({ customerName: visitForm.outletName, companyName: 'Retail Outlet', product: visitForm.pitchedProd, quantity: Number(visitForm.pitchedQty || 1), value: Number(visitForm.pitchedVal || 0), state: selectedBeatForVisit?.beat.territory || '', city: 'Field Beat', status: 'Pending', assignedTo: user.id, date: new Date().toISOString() });
    }
    addVisitReport({ executiveId: user.id, outletName: visitForm.outletName, outletContact: visitForm.outletContact, visitDate: todayStr, productsShown: visitForm.productsShown, orderPlaced: visitForm.orderPlaced, orderId: autoOrderId, nextFollowUp: visitForm.nextFollowUp || null, notes: visitForm.notes });
    if (selectedBeatForVisit) updateBeatPlanStatus(selectedBeatForVisit.beat.id, 'Visited');
    setIsVisitModalOpen(false);
  };
  const toggleProduct = (name) => setVisitForm(prev => ({ ...prev, productsShown: prev.productsShown.includes(name) ? prev.productsShown.filter(n => n !== name) : [...prev.productsShown, name] }));

  // ── Expenses ────────────────────────────────────────────────────────────
  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setExpenseForm(prev => ({ ...prev, receiptName: file.name, receiptData: ev.target.result }));
    reader.readAsDataURL(file);
  };
  const handleExpenseSubmit = (e) => {
    e.preventDefault();
    addSFAExpense({ userId: user.id, date: expenseForm.date, category: expenseForm.category, amount: Number(expenseForm.amount), description: expenseForm.description, receiptName: expenseForm.receiptName, receiptData: expenseForm.receiptData });
    setExpenseForm({ date: todayStr, category: 'Travel', amount: '', description: '', receiptName: '', receiptData: '' });
    setIsExpenseModalOpen(false);
  };

  // ── Attendance Year Report ─────────────────────────────────────────────
  const getAttendanceStats = (userId) => {
    const currentYear = new Date().getFullYear();
    const userRecords = attendance.filter(a => a.userId === userId);
    const yearRecords = userRecords.filter(a => a.date?.startsWith(String(currentYear)));
    const presentDays = yearRecords.filter(r => r.checkInTime).length;
    const approvedDays = yearRecords.filter(r => r.approved).length;

    // Current streak (consecutive working days backwards from today, skip Sunday)
    let currentStreak = 0;
    const check = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = check.toISOString().split('T')[0];
      const dayOfWeek = check.getDay();
      if (dayOfWeek !== 0) { // skip Sunday
        const rec = userRecords.find(r => r.date === ds);
        if (rec && rec.checkInTime) { currentStreak++; }
        else if (ds <= todayStr) { break; }
      }
      check.setDate(check.getDate() - 1);
    }

    // Longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const sortedPresent = userRecords.filter(r => r.checkInTime).map(r => r.date).sort();
    for (let i = 0; i < sortedPresent.length; i++) {
      if (i === 0) { tempStreak = 1; }
      else {
        const prev = new Date(sortedPresent[i - 1]);
        const curr = new Date(sortedPresent[i]);
        const diff = (curr - prev) / 86400000;
        // Allow 1-day gap (next day) or 2-day gap (Mon after Sat)
        if (diff === 1 || (diff === 2 && prev.getDay() === 6)) { tempStreak++; }
        else { longestStreak = Math.max(longestStreak, tempStreak); tempStreak = 1; }
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return { presentDays, approvedDays, currentStreak, longestStreak, total: yearRecords.length };
  };

  // Build month calendar grid for a given userId and year
  const buildMonthGrid = (userId, year, month) => {
    const days = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // leading blanks (Mon=0 offset)
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const blanks = firstDay === 0 ? 6 : firstDay - 1; // shift so Mon is col 0
    for (let b = 0; b < blanks; b++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, d).getDay();
      const isSunday = dayOfWeek === 0;
      const isFuture = dateStr > todayStr;
      const rec = attendance.find(a => a.userId === userId && a.date === dateStr);
      let status = 'absent';
      if (isFuture) status = 'future';
      else if (isSunday) status = 'sunday';
      else if (rec?.approved) status = 'approved';
      else if (rec?.checkInTime) status = 'present';
      days.push({ d, dateStr, status });
    }
    return days;
  };

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const STATUS_CELL = {
    approved: 'bg-emerald-500 shadow-sm shadow-emerald-500/40',
    present: 'bg-blue-500 shadow-sm shadow-blue-500/30',
    absent: 'bg-red-500/40',
    sunday: 'bg-white/5 opacity-40',
    future: 'bg-white/5',
  };

  // ── Performance Stats ───────────────────────────────────────────────────
  const getRepStats = (repId) => {
    const visits = visitReports.filter(v => v.executiveId === repId);
    const ordersPlaced = visits.filter(v => v.orderPlaced).length;
    const myBeats = beatPlans.filter(b => b.executiveId === repId);
    const visitedBeats = myBeats.filter(b => b.status === 'Visited').length;
    const days = attendance.filter(a => a.userId === repId).length;
    const conversionRate = visits.length > 0 ? Math.round((ordersPlaced / visits.length) * 100) : 0;
    const beatCompletion = myBeats.length > 0 ? Math.round((visitedBeats / myBeats.length) * 100) : 0;
    return { visits: visits.length, ordersPlaced, conversionRate, days, beatsTotal: myBeats.length, visitedBeats, beatCompletion };
  };

  // ── Style Helpers ───────────────────────────────────────────────────────
  const inp = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
  const lbl = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

  const TABS = [
    { id: 'attendance', label: 'Attendance', icon: LogIn },
    { id: 'beats', label: 'Beat Plan', icon: MapPin },
    { id: 'gps', label: 'GPS Track', icon: Navigation },
    { id: 'visits', label: 'Visit Reports', icon: Clipboard },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'routes', label: 'Route Plan', icon: Route },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarCheck size={24} className="text-brand-accent" />
            Sales Force Automation
          </h1>
          <p className="text-slate-400 text-sm mt-1">GPS tracking, beats, attendance, expenses & performance analytics.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isSREP && (
            <button onClick={() => setIsBeatModalOpen(true)} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
              <Plus size={16} /> Assign Beat
            </button>
          )}
          <button onClick={() => setIsExpenseModalOpen(true)} className="px-4 py-2.5 rounded-xl border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/10 flex items-center gap-2 text-sm font-bold transition-all">
            <Receipt size={16} /> File Expense
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex border-b border-white/5 pb-px gap-0.5 overflow-x-auto custom-scrollbar">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-semibold text-xs border-b-2 flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Attendance                                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {isSREP && (
            <div className="lg:col-span-4 glass-panel rounded-2xl p-5 border border-brand-accent/20 bg-brand-primary-light/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-brand-accent uppercase tracking-widest bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded-full">Punch Clock</span>
                  <h3 className="text-lg font-bold text-white mt-1.5">Shift Logger</h3>
                </div>
                <Smartphone className="text-brand-accent shrink-0" size={28} />
              </div>
              {myAttendanceToday ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={16} /><span className="text-sm font-bold">Marked Present</span></div>
                  <div className="text-xs text-slate-300 space-y-1 font-medium">
                    <div className="flex justify-between"><span>Punch In:</span><span className="text-white font-bold">{myAttendanceToday.checkInTime}</span></div>
                    <div className="flex justify-between"><span>Punch Out:</span><span className="text-white font-bold">{myAttendanceToday.checkOutTime || 'Active Shift'}</span></div>
                    {myAttendanceToday.punchInLat ? (
                      <div className="flex justify-between items-center pt-1 border-t border-emerald-500/10">
                        <span className="text-slate-400">📍 Location:</span>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${myAttendanceToday.punchInLat}&mlon=${myAttendanceToday.punchInLng}&zoom=16`}
                          target="_blank" rel="noreferrer"
                          className="text-brand-accent hover:underline font-bold text-[10px]"
                        >
                          {myAttendanceToday.punchInLat.toFixed(4)}, {myAttendanceToday.punchInLng.toFixed(4)} ↗
                        </a>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center pt-1 border-t border-emerald-500/10">
                        <span className="text-slate-400">📍 Location:</span>
                        <span className="text-slate-600 italic text-[10px]">Not captured</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4 text-xs text-yellow-500/80">⚠️ You have not checked in for today ({todayStr}). Please log your status.</div>
              )}
              <form onSubmit={handlePunchIn} className="space-y-3">
                <div>
                  <label className={lbl}>Notes / Start Location</label>
                  <input type="text" value={punchNotes} onChange={e => setPunchNotes(e.target.value)} placeholder="e.g. Starting at Anand market area" className={inp} />
                </div>
                {!myAttendanceToday ? (
                  <button type="submit" disabled={isPunchingIn} className="w-full btn-accent py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait">
                    {isPunchingIn ? <><RefreshCw size={15} className="animate-spin" />Getting your location…</> : <><LogIn size={16} />Punch In / Start Day</>}
                  </button>
                ) : !myAttendanceToday.checkOutTime ? (
                  <button type="button" onClick={handlePunchOut} className="w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/20 hover:bg-red-500/25 text-red-400 text-sm font-bold flex items-center justify-center gap-2 transition-all"><LogOut size={16} />Punch Out / End Shift</button>
                ) : null}
              </form>
            </div>
          )}
          <div className={`${isSREP ? 'lg:col-span-8' : 'lg:col-span-12'} glass-panel rounded-2xl overflow-hidden border border-white/5`}>
            <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex justify-between items-center">
              <span className="text-sm font-bold text-white uppercase tracking-wider">Attendance Register</span>
              <span className="text-xs text-slate-400">{isSREP ? attendance.filter(a => a.userId === user?.id).length : attendance.length} records</span>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    {isManagerOrAbove && <th className="p-4">Representative</th>}<th className="p-4">Date</th>
                    <th className="p-4 text-center">In</th><th className="p-4 text-center">Out</th>
                    <th className="p-4 text-center">Duration</th>
                    <th className="p-4">Punch-In Location</th>
                    <th className="p-4">Notes</th>
                    {isManagerOrAbove && <th className="p-4 text-center">Approval</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {(() => {
                    const visibleRecords = isSREP
                      ? attendance.filter(a => a.userId === user?.id)
                      : attendance;
                    return visibleRecords.length > 0 ? visibleRecords.map(att => {
                    const duration = att.checkInTime && att.checkOutTime ? '~8h' : att.checkInTime ? 'Active' : '—';
                    return (
                      <tr key={att.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                        {isManagerOrAbove && (
                          <td className="p-4 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-[10px]">{getRepName(att.userId).substring(0,2).toUpperCase()}</div>
                              {getRepName(att.userId)}
                            </div>
                          </td>
                        )}
                        <td className="p-4 text-xs font-mono text-slate-400">{att.date}</td>
                        <td className="p-4 text-center font-bold text-brand-accent">{att.checkInTime || '—'}</td>
                        <td className="p-4 text-center font-bold text-slate-400">{att.checkOutTime || '—'}</td>
                        <td className="p-4 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${att.checkOutTime ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : att.checkInTime ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>{duration}</span>
                        </td>
                        <td className="p-4">
                          {att.punchInLat ? (
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${att.punchInLat}&mlon=${att.punchInLng}&zoom=16`}
                              target="_blank" rel="noreferrer"
                              className="text-brand-accent hover:underline text-xs font-mono flex items-center gap-1"
                              title={`Accuracy: ±${att.punchInAccuracy}m`}
                            >
                              <Navigation size={10} />
                              {att.punchInLat.toFixed(4)}, {att.punchInLng.toFixed(4)}
                            </a>
                          ) : (
                            <span className="text-slate-600 text-xs italic">No location</span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-400 italic max-w-[160px] truncate" title={att.notes}>{att.notes}</td>
                        {isManagerOrAbove && (
                          <td className="p-4 text-center">
                            {att.approved ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  <CheckCircle2 size={10} /> Approved
                                </span>
                                <span className="text-[9px] text-slate-500">by {att.approvedBy || 'Admin'}</span>
                              </div>
                            ) : att.checkInTime ? (
                              <button
                                onClick={() => updateAttendanceRecord(att.id, { approved: true, approvedBy: user.name })}
                                className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold transition-all flex items-center gap-1 mx-auto"
                              >
                                <CheckSquare size={11} /> Approve
                              </button>
                            ) : (
                              <span className="text-slate-600 italic text-[10px]">No record</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  }) : <tr><td colSpan={isManagerOrAbove ? 8 : 7} className="p-8 text-center text-slate-500">No attendance records yet.</td></tr>;
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Employee Year Report (Admin Only) ────────────────────────────── */}
        {isManagerOrAbove && (
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-brand-accent" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Employee Attendance Report — {new Date().getFullYear()}</span>
              </div>
              <select
                value={selectedAttendanceUser}
                onChange={e => setSelectedAttendanceUser(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-sm text-white bg-brand-primary w-full sm:w-64"
              >
                <option value="" className="bg-brand-primary">— Select Employee —</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id} className="bg-brand-primary">{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            {selectedAttendanceUser ? (() => {
              const rep = allUsers.find(u => u.id === selectedAttendanceUser);
              const stats = getAttendanceStats(selectedAttendanceUser);
              const currentYear = new Date().getFullYear();
              return (
                <div className="p-5 space-y-6">
                  {/* Rep Info + Stats */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-brand-accent/15 text-brand-accent flex items-center justify-center font-black text-lg">{rep?.name?.substring(0,2).toUpperCase()}</div>
                      <div>
                        <p className="font-bold text-white text-base">{rep?.name}</p>
                        <p className="text-xs text-slate-400">{rep?.role} · {rep?.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                      {[
                        { label: 'Present Days', value: stats.presentDays, color: 'text-blue-400', icon: '📅' },
                        { label: 'Approved', value: stats.approvedDays, color: 'text-emerald-400', icon: '✅' },
                        { label: 'Current Streak', value: `${stats.currentStreak}d 🔥`, color: 'text-orange-400', icon: '🔥' },
                        { label: 'Longest Streak', value: `${stats.longestStreak}d 🏆`, color: 'text-yellow-400', icon: '🏆' },
                      ].map((s, i) => (
                        <div key={i} className="bg-brand-primary-lighter/30 border border-white/5 rounded-xl p-3 text-center">
                          <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Legend:</span>
                    {[
                      { color: 'bg-emerald-500', label: 'Present + Approved' },
                      { color: 'bg-blue-500', label: 'Present (Pending)' },
                      { color: 'bg-red-500/50', label: 'Absent' },
                      { color: 'bg-white/5', label: 'Future / Sunday' },
                    ].map((l, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-sm ${l.color}`}></div>
                        <span className="text-[10px] text-slate-400">{l.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* 12-Month Calendar Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {MONTH_NAMES.map((monthName, monthIdx) => {
                      const days = buildMonthGrid(selectedAttendanceUser, currentYear, monthIdx);
                      const presentCount = days.filter(d => d && (d.status === 'present' || d.status === 'approved')).length;
                      return (
                        <div key={monthIdx} className="bg-brand-primary-lighter/20 border border-white/5 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{monthName} {currentYear}</span>
                            <span className="text-[10px] text-brand-accent font-bold">{presentCount}d</span>
                          </div>
                          {/* Day headers */}
                          <div className="grid grid-cols-7 gap-0.5 mb-1">
                            {['M','T','W','T','F','S','S'].map((d, i) => (
                              <div key={i} className="text-[8px] text-slate-600 text-center font-bold">{d}</div>
                            ))}
                          </div>
                          {/* Day cells */}
                          <div className="grid grid-cols-7 gap-0.5">
                            {days.map((day, i) => (
                              <div
                                key={i}
                                title={day ? `${day.dateStr} — ${day.status}` : ''}
                                className={`w-full aspect-square rounded-sm transition-all ${day ? STATUS_CELL[day.status] : 'bg-transparent'}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Monthly breakdown table */}
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                          <th className="p-3">Date</th><th className="p-3">Check In</th>
                          <th className="p-3">Check Out</th><th className="p-3">Notes</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {attendance
                          .filter(a => a.userId === selectedAttendanceUser)
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map(att => (
                            <tr key={att.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                              <td className="p-3 text-xs font-mono font-bold text-white">{att.date}</td>
                              <td className="p-3 text-xs font-bold text-brand-accent">{att.checkInTime || '—'}</td>
                              <td className="p-3 text-xs text-slate-400">{att.checkOutTime || '—'}</td>
                              <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate italic">{att.notes || '—'}</td>
                              <td className="p-3 text-center">
                                {att.approved
                                  ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">✓ Approved</span>
                                  : att.checkInTime
                                  ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-500/10 text-blue-400 border-blue-500/20">Present</span>
                                  : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-500/10 text-slate-400 border-slate-500/20">—</span>}
                              </td>
                            </tr>
                          ))}
                        {attendance.filter(a => a.userId === selectedAttendanceUser).length === 0 && (
                          <tr><td colSpan="5" className="p-6 text-center text-slate-500 italic">No records found for this employee.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })() : (
              <div className="p-10 text-center text-slate-500">
                <BarChart3 size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select an employee above to view their full year attendance report, streaks, and calendar.</p>
              </div>
            )}
          </div>
        )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Beat Plan                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'beats' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Route Assignment</th><th className="p-4">Territory</th>
                  <th className="p-4">Date</th><th className="p-4">Outlets</th>
                  <th className="p-4 text-center">Status</th><th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredBeats.length > 0 ? filteredBeats.map(beat => (
                  <tr key={beat.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4 font-semibold text-white">
                      {!isSREP ? <div className="flex items-center gap-2"><User size={13} className="text-slate-500" />{getRepName(beat.executiveId)}</div>
                        : <span className="text-brand-accent text-xs bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded">My Beat</span>}
                    </td>
                    <td className="p-4"><div className="flex items-center gap-1 font-medium text-white"><MapPin size={12} className="text-brand-accent" />{beat.territory}</div></td>
                    <td className="p-4 text-xs font-mono font-bold text-slate-400">{beat.date}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(beat.outlets) && beat.outlets.map((outlet, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-[10px] bg-white/5 border border-white/5 px-2 py-0.5 rounded text-slate-300">
                            {outlet}
                            {isSREP && beat.status !== 'Visited' && (
                              <button onClick={() => handleOpenVisit(beat, outlet)} className="ml-1 text-brand-accent hover:underline font-bold">[Check-In]</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${beat.status === 'Visited' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>{beat.status}</span>
                    </td>
                    <td className="p-4 text-right">
                      {isSREP && beat.status !== 'Visited' ? <span className="text-xs text-brand-accent font-semibold animate-pulse">Pending Visit</span> : <span className="text-xs text-slate-500 italic">—</span>}
                    </td>
                  </tr>
                )) : <tr><td colSpan="6" className="p-8 text-center text-slate-500">No beat plans found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: GPS Tracking                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gps' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Control Panel */}
            <div className="lg:col-span-4 space-y-4">
              <div className="glass-panel rounded-2xl p-5 border border-brand-accent/20 bg-brand-primary-light/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-brand-accent uppercase tracking-widest bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded-full">Live GPS</span>
                    <h3 className="text-lg font-bold text-white mt-1.5">Location Tracker</h3>
                  </div>
                  <Navigation className="text-brand-accent shrink-0" size={28} />
                </div>

                {gpsError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">⚠️ {gpsError}</div>}

                {gpsLocation ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={16} /><span className="text-sm font-bold">Location Captured</span></div>
                    <div className="text-xs text-slate-300 space-y-1.5 font-mono">
                      <div className="flex justify-between"><span className="text-slate-500">Latitude</span><span className="text-white font-bold">{gpsLocation.lat.toFixed(6)}°</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Longitude</span><span className="text-white font-bold">{gpsLocation.lng.toFixed(6)}°</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Accuracy</span><span className="text-brand-accent font-bold">±{gpsLocation.accuracy}m</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Captured at</span><span className="text-white font-bold">{gpsLocation.timestamp}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4 text-xs text-yellow-400/80 leading-relaxed">
                    📍 Press "Get My Location" to capture your current GPS coordinates. You will be asked to allow location access.
                  </div>
                )}

                <button onClick={captureLocation} disabled={isLocating} className="w-full btn-accent py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
                  {isLocating ? <><RefreshCw size={16} className="animate-spin" />Getting Location…</> : <><Navigation size={16} />{gpsLocation ? 'Refresh Location' : 'Get My Location'}</>}
                </button>
              </div>

              {/* Location Trail */}
              {locationHistory.length > 0 && (
                <div className="glass-panel rounded-2xl p-4 border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Clock size={12} />Location Trail Today</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {locationHistory.map((loc, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <div className="w-5 h-5 rounded-full bg-brand-accent/20 border border-brand-accent/40 flex items-center justify-center text-brand-accent font-bold text-[9px] flex-shrink-0">{i + 1}</div>
                        <div className="flex-1">
                          <span className="text-white font-mono">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                          <span className="text-slate-500 ml-2">@ {loc.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Map */}
            <div className="lg:col-span-8">
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5 h-[460px]">
                {gpsLocation ? (
                  <iframe
                    title="Live GPS Map"
                    className="w-full h-full border-0"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${gpsLocation.lng - 0.008},${gpsLocation.lat - 0.008},${gpsLocation.lng + 0.008},${gpsLocation.lat + 0.008}&layer=mapnik&marker=${gpsLocation.lat},${gpsLocation.lng}`}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                    <div className="w-20 h-20 rounded-full bg-brand-accent/5 border border-brand-accent/10 flex items-center justify-center">
                      <MapPin size={32} className="text-brand-accent/20" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-400">Map appears here after location capture</p>
                      <p className="text-xs text-slate-600 mt-1">Uses OpenStreetMap — no API key required</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Admin: Team Field Status */}
          {isManagerOrAbove && (
            <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
              <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex items-center gap-2">
                <User size={15} className="text-brand-accent" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Field Team Status — Today</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4">Representative</th><th className="p-4">Check-In</th>
                      <th className="p-4">Check-Out</th><th className="p-4 text-center">Visits Today</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {salesReps.length > 0 ? salesReps.map(rep => {
                      const repAtt = attendance.find(a => a.userId === rep.id && a.date === todayStr);
                      const repVisits = visitReports.filter(v => v.executiveId === rep.id && v.visitDate === todayStr).length;
                      const status = repAtt && !repAtt.checkOutTime ? 'In Field' : repAtt ? 'Completed' : 'Absent';
                      const statusCls = status === 'In Field' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : status === 'Completed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20';
                      return (
                        <tr key={rep.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                          <td className="p-4 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center font-bold text-xs">{rep.name.substring(0,2).toUpperCase()}</div>
                              <div><p>{rep.name}</p><p className="text-[10px] text-slate-500">{rep.role}</p></div>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-brand-accent text-xs">{repAtt?.checkInTime || '—'}</td>
                          <td className="p-4 text-slate-400 text-xs">{repAtt?.checkOutTime || '—'}</td>
                          <td className="p-4 text-center font-bold text-white">{repVisits}</td>
                          <td className="p-4 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCls}`}>{status}</span></td>
                        </tr>
                      );
                    }) : <tr><td colSpan="5" className="p-8 text-center text-slate-500">No sales representatives found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Visit Reports                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'visits' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Outlet</th><th className="p-4">Representative</th><th className="p-4">Date</th>
                  <th className="p-4">Products Pitched</th><th className="p-4 text-center">Order</th><th className="p-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {visitReports.length > 0 ? visitReports.map(vr => (
                  <tr key={vr.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4"><div className="font-semibold text-white">{vr.outletName}</div><div className="text-[10px] text-slate-500 mt-0.5">{vr.outletContact || 'No contact'}</div></td>
                    <td className="p-4 text-sm text-slate-300">{getRepName(vr.executiveId)}</td>
                    <td className="p-4 text-xs font-mono text-slate-400">{vr.visitDate}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(vr.productsShown) && vr.productsShown.length > 0 ? vr.productsShown.map((p, i) => (
                          <span key={i} className="bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[9px] px-1.5 py-0.5 rounded">{p}</span>
                        )) : <span className="text-xs text-slate-600 italic">None</span>}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {vr.orderPlaced
                        ? <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold"><ShoppingCart size={10} />Order Placed</span>
                        : <span className="text-[10px] text-slate-500 italic">Pitched Only</span>}
                    </td>
                    <td className="p-4 text-xs text-slate-400 italic max-w-xs truncate" title={vr.notes}>{vr.notes || '—'}</td>
                  </tr>
                )) : <tr><td colSpan="6" className="p-8 text-center text-slate-500">No visit reports yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Expense Claims                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Claimed', value: `₹${myExpenses.reduce((s, e) => s + (e.amount || 0), 0).toLocaleString('en-IN')}`, color: 'text-white' },
              { label: 'Approved', value: `₹${myExpenses.filter(e => e.status === 'Approved').reduce((s, e) => s + (e.amount || 0), 0).toLocaleString('en-IN')}`, color: 'text-emerald-400' },
              { label: 'Pending', value: myExpenses.filter(e => e.status === 'Pending').length, color: 'text-yellow-400' },
              { label: 'Rejected', value: myExpenses.filter(e => e.status === 'Rejected').length, color: 'text-red-400' },
            ].map((s, i) => (
              <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Expense Table */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex justify-between items-center">
              <span className="text-sm font-bold text-white uppercase tracking-wider">{isManagerOrAbove ? 'All Expense Claims' : 'My Expense Claims'}</span>
              <button onClick={() => setIsExpenseModalOpen(true)} className="btn-accent px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Plus size={13} />New Claim</button>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    {isManagerOrAbove && <th className="p-4">Rep</th>}
                    <th className="p-4">Date</th><th className="p-4">Category</th>
                    <th className="p-4">Description</th><th className="p-4">Receipt</th>
                    <th className="p-4 text-right">Amount</th><th className="p-4 text-center">Status</th>
                    {isManagerOrAbove && <th className="p-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {myExpenses.length > 0 ? myExpenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                      {isManagerOrAbove && <td className="p-4 text-xs font-semibold text-white">{getRepName(exp.userId)}</td>}
                      <td className="p-4 text-xs font-mono text-slate-400">{exp.date}</td>
                      <td className="p-4"><span className="bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[10px] px-2 py-0.5 rounded">{exp.category}</span></td>
                      <td className="p-4 text-xs text-slate-300 max-w-[200px] truncate">{exp.description}</td>
                      <td className="p-4 text-xs">
                        {exp.receiptName
                          ? <a href={exp.receiptData} download={exp.receiptName} className="text-blue-400 hover:underline flex items-center gap-1"><FileText size={11} />{exp.receiptName}</a>
                          : <span className="text-slate-600 italic">No file</span>}
                      </td>
                      <td className="p-4 text-right font-bold text-white">₹{exp.amount?.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${exp.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : exp.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>{exp.status}</span>
                      </td>
                      {isManagerOrAbove && (
                        <td className="p-4 text-center">
                          {exp.status === 'Pending' ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => updateSFAExpense(exp.id, { status: 'Approved' })} className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 transition-colors" title="Approve"><CheckSquare size={14} /></button>
                              <button onClick={() => updateSFAExpense(exp.id, { status: 'Rejected' })} className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 transition-colors" title="Reject"><XSquare size={14} /></button>
                            </div>
                          ) : <span className="text-slate-600 italic text-xs">—</span>}
                        </td>
                      )}
                    </tr>
                  )) : <tr><td colSpan={isManagerOrAbove ? 8 : 6} className="p-8 text-center text-slate-500">No expense claims found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Route Planning                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'routes' && (
        <div className="space-y-6">
          {/* Weekly Calendar */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex items-center gap-2">
              <Route size={15} className="text-brand-accent" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Weekly Beat Route Planner</span>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <div className="grid grid-cols-7 min-w-[700px]">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                  const dayBeats = filteredBeats.filter(b => {
                    try { return new Date(b.date).toLocaleDateString('en-US', { weekday: 'short' }) === day; } catch { return false; }
                  });
                  return (
                    <div key={day} className="border-r border-white/5 last:border-0">
                      <div className="bg-brand-primary-light/30 p-3 text-center text-xs font-bold text-brand-accent uppercase tracking-wider border-b border-white/5">{day}</div>
                      <div className="p-2 min-h-[200px] space-y-1.5">
                        {dayBeats.length > 0 ? dayBeats.map(beat => (
                          <div key={beat.id} className="bg-brand-accent/10 border border-brand-accent/20 rounded-lg p-2 space-y-1">
                            <p className="text-[9px] font-bold text-brand-accent uppercase truncate">{beat.territory}</p>
                            {!isSREP && <p className="text-[9px] text-slate-400 truncate">{getRepName(beat.executiveId)}</p>}
                            <p className="text-[10px] text-slate-300">{Array.isArray(beat.outlets) ? beat.outlets.length : 0} outlets</p>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${beat.status === 'Visited' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{beat.status}</span>
                          </div>
                        )) : <p className="text-xs text-slate-700 text-center pt-6 italic">No beats</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Territory Coverage */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="p-4 border-b border-white/5 bg-brand-primary-light/20">
              <span className="text-sm font-bold text-white uppercase tracking-wider">Territory Coverage Summary</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {territories.length > 0 ? territories.map(territory => {
                const tBeats = filteredBeats.filter(b => b.territory === territory.name);
                const visited = tBeats.filter(b => b.status === 'Visited').length;
                const totalOutlets = tBeats.reduce((sum, b) => sum + (Array.isArray(b.outlets) ? b.outlets.length : 0), 0);
                const pct = tBeats.length > 0 ? Math.round((visited / tBeats.length) * 100) : 0;
                return (
                  <div key={territory.id} className="bg-brand-primary-lighter/20 border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div><p className="text-sm font-bold text-white">{territory.name}</p><p className="text-xs text-slate-400 mt-0.5">{territory.state}</p></div>
                      <span className="text-xl font-black text-brand-accent">{pct}%</span>
                    </div>
                    <div className="w-full bg-brand-primary rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-brand-accent to-pink-400 transition-all duration-700" style={{ width: `${pct}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{visited}/{tBeats.length} beats</span>
                      <span>{totalOutlets} outlets</span>
                    </div>
                  </div>
                );
              }) : <p className="col-span-3 text-center text-slate-500 py-8">No territories configured.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Performance Dashboard                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {isSREP ? (
            /* ── Sales Rep: Own Stats ── */
            (() => {
              const stats = getRepStats(user.id);
              return (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Total Visits', value: stats.visits, icon: MapPin, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                      { label: 'Orders Placed', value: stats.ordersPlaced, icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                      { label: 'Conversion', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'text-brand-accent', bg: 'bg-brand-accent/10' },
                      { label: 'Days Attended', value: stats.days, icon: CalendarCheck, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                      { label: 'Beats Done', value: `${stats.visitedBeats}/${stats.beatsTotal}`, icon: Target, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    ].map((stat, i) => {
                      const Icon = stat.icon;
                      return (
                        <div key={i} className="glass-panel rounded-2xl p-5 border border-white/5 space-y-3">
                          <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center ${stat.color}`}><Icon size={18} /></div>
                          <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{stat.label}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Beat Completion Progress */}
                  <div className="glass-panel rounded-2xl p-6 border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-5 uppercase tracking-wider flex items-center gap-2"><Target size={15} className="text-brand-accent" />Beat Completion Progress</h3>
                    {beatPlans.filter(b => b.executiveId === user.id).length > 0 ? (
                      <div className="space-y-4">
                        {beatPlans.filter(b => b.executiveId === user.id).map(beat => (
                          <div key={beat.id} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-300 font-medium">{beat.territory} <span className="text-slate-600 font-normal">— {beat.date}</span></span>
                              <span className={`font-bold ${beat.status === 'Visited' ? 'text-emerald-400' : 'text-yellow-400'}`}>{beat.status}</span>
                            </div>
                            <div className="w-full bg-brand-primary rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full transition-all duration-700 ${beat.status === 'Visited' ? 'w-full bg-emerald-400' : 'w-2/5 bg-yellow-400'}`}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-slate-500 text-sm text-center py-4">No beats assigned yet.</p>}
                  </div>
                </div>
              );
            })()
          ) : (
            /* ── Manager/Admin: Team Leaderboard ── */
            <div className="space-y-6">
              {/* Team Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Field Visits', value: visitReports.length, icon: MapPin },
                  { label: 'Orders from Field', value: visitReports.filter(v => v.orderPlaced).length, icon: ShoppingCart },
                  { label: 'Active Today', value: attendance.filter(a => a.date === todayStr).length, icon: User },
                  { label: 'Beats Completed', value: beatPlans.filter(b => b.status === 'Visited').length, icon: CheckCircle2 },
                ].map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5 space-y-2">
                      <Icon size={18} className="text-brand-accent opacity-70" />
                      <p className="text-2xl font-black text-white">{s.value}</p>
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{s.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Leaderboard */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Team Performance Leaderboard</span>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        <th className="p-4 w-16">Rank</th><th className="p-4">Representative</th>
                        <th className="p-4 text-center">Visits</th><th className="p-4 text-center">Orders</th>
                        <th className="p-4 text-center">Conversion</th><th className="p-4 text-center">Attendance</th>
                        <th className="p-4 text-center">Beat %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {salesReps
                        .map(rep => ({ rep, stats: getRepStats(rep.id) }))
                        .sort((a, b) => b.stats.visits - a.stats.visits || b.stats.ordersPlaced - a.stats.ordersPlaced)
                        .map(({ rep, stats }, i) => (
                          <tr key={rep.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                            <td className="p-4 text-center text-lg">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-slate-500 font-bold text-xs">#{i+1}</span>}
                            </td>
                            <td className="p-4 font-semibold text-white">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center font-bold text-xs">{rep.name.substring(0,2).toUpperCase()}</div>
                                <div><p className="text-sm">{rep.name}</p><p className="text-[10px] text-slate-500">{rep.role}</p></div>
                              </div>
                            </td>
                            <td className="p-4 text-center font-black text-blue-400 text-lg">{stats.visits}</td>
                            <td className="p-4 text-center font-black text-emerald-400 text-lg">{stats.ordersPlaced}</td>
                            <td className="p-4 text-center">
                              <span className={`font-black text-lg ${stats.conversionRate >= 50 ? 'text-emerald-400' : stats.conversionRate >= 25 ? 'text-yellow-400' : 'text-slate-400'}`}>{stats.conversionRate}%</span>
                            </td>
                            <td className="p-4 text-center font-bold text-purple-400">{stats.days}d</td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-brand-primary rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full bg-brand-accent transition-all duration-700" style={{ width: `${stats.beatCompletion}%` }}></div>
                                </div>
                                <span className="text-xs font-bold text-brand-accent w-8 text-right">{stats.beatCompletion}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {salesReps.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-500">No sales representatives found.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Assign Beat Plan                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isBeatModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsBeatModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10">
            <div className="flex justify-between items-center p-6 border-b border-white/5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><MapPin className="text-brand-accent" size={20} />Assign Beat Route</h3>
              <button onClick={() => setIsBeatModalOpen(false)} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateBeat} className="p-6 space-y-4">
              <div>
                <label className={lbl}>Assign Executive *</label>
                <select required value={beatForm.executiveId} onChange={e => setBeatForm({ ...beatForm, executiveId: e.target.value })} className={inp}>
                  <option value="" className="bg-brand-primary">Select Sales Representative</option>
                  {salesReps.map(su => <option key={su.id} value={su.id} className="bg-brand-primary">{su.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Beat Date *</label>
                <input type="date" required value={beatForm.date} onChange={e => setBeatForm({ ...beatForm, date: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Territory Zone *</label>
                <select required value={beatForm.territory} onChange={e => setBeatForm({ ...beatForm, territory: e.target.value })} className={inp}>
                  <option value="" className="bg-brand-primary">Select Territory</option>
                  {territories.map(t => <option key={t.id} value={t.name} className="bg-brand-primary">{t.name} ({t.state})</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Outlets to Visit *</label>
                <p className="text-[10px] text-slate-500 mb-1.5">Separate outlet names with commas</p>
                <textarea required rows="3" placeholder="e.g. Radhe Medicals, Vrindavan Wellness, Krishna Pharma" value={beatForm.outlets} onChange={e => setBeatForm({ ...beatForm, outlets: e.target.value })} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none" />
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsBeatModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Schedule Route</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Log Field Visit                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isVisitModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[6vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsVisitModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Clipboard className="text-brand-accent" size={20} />Log Field Visit</h3>
              <button onClick={() => setIsVisitModalOpen(false)} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleVisitSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Outlet Name</label>
                  <input type="text" readOnly value={visitForm.outletName} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed" />
                </div>
                <div>
                  <label className={lbl}>Store Contact *</label>
                  <input type="tel" required placeholder="9876543210" value={visitForm.outletContact} onChange={e => setVisitForm({ ...visitForm, outletContact: e.target.value })} className={inp} />
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl}>Products Pitched</label>
                  <div className="grid grid-cols-2 gap-2 bg-brand-primary-dark/50 p-3 rounded-xl border border-white/5">
                    {productCatalog.map(p => {
                      const on = visitForm.productsShown?.includes(p.name);
                      return (
                        <button type="button" key={p.id} onClick={() => toggleProduct(p.name)} className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-colors ${on ? 'bg-brand-accent/10 border-brand-accent text-brand-accent' : 'bg-brand-primary border-white/5 text-slate-400'}`}>
                          {on ? <Check size={13} /> : <X size={13} className="opacity-20" />} {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2 bg-brand-primary-lighter/30 p-4 rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-brand-accent uppercase">Order Placed?</label>
                    <input type="checkbox" checked={visitForm.orderPlaced} onChange={e => setVisitForm({ ...visitForm, orderPlaced: e.target.checked })} className="w-5 h-5 rounded accent-brand-accent" />
                  </div>
                  {visitForm.orderPlaced && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 animate-fade-in-up">
                      <div className="sm:col-span-3">
                        <label className={lbl}>Product</label>
                        <select value={visitForm.pitchedProd} onChange={e => setVisitForm({ ...visitForm, pitchedProd: e.target.value })} className={inp}>
                          {productCatalog.map(p => <option key={p.id} value={p.name} className="bg-brand-primary">{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Qty</label>
                        <input type="number" min="1" value={visitForm.pitchedQty} onChange={e => setVisitForm({ ...visitForm, pitchedQty: e.target.value })} className={inp} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={lbl}>Total Value (₹)</label>
                        <input type="number" min="1" value={visitForm.pitchedVal} onChange={e => setVisitForm({ ...visitForm, pitchedVal: e.target.value })} className={inp} />
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className={lbl}>Next Follow-up</label>
                  <input type="date" value={visitForm.nextFollowUp} onChange={e => setVisitForm({ ...visitForm, nextFollowUp: e.target.value })} className={inp} />
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl}>Visit Notes</label>
                  <textarea rows="3" placeholder="Retailer feedback, interest level, next steps…" value={visitForm.notes} onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsVisitModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Submit Visit Report</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: File Expense Claim                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isExpenseModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsExpenseModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10">
            <div className="flex justify-between items-center p-6 border-b border-white/5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Receipt className="text-brand-accent" size={20} />File Expense Claim</h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Date *</label>
                  <input type="date" required value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Category *</label>
                  <select required value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} className={inp}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} className="bg-brand-primary">{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Amount (₹) *</label>
                  <input type="number" required min="1" placeholder="e.g. 450" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inp} />
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Description *</label>
                  <textarea required rows="2" placeholder="e.g. Auto fare from Anand station to market area" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none" />
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Upload Receipt</label>
                  <label className="flex items-center gap-3 cursor-pointer w-full glass-input rounded-xl px-4 py-2.5 text-sm hover:bg-white/5 transition-colors">
                    <Upload size={16} className="text-brand-accent flex-shrink-0" />
                    <span className={expenseForm.receiptName ? 'text-white' : 'text-slate-600'}>{expenseForm.receiptName || 'Click to upload receipt (image or PDF)'}</span>
                    <input type="file" accept="image/*,.pdf" onChange={handleReceiptUpload} className="hidden" />
                  </label>
                  {expenseForm.receiptName && (
                    <button type="button" onClick={() => setExpenseForm(prev => ({ ...prev, receiptName: '', receiptData: '' }))} className="mt-1 text-xs text-red-400 hover:underline flex items-center gap-1"><X size={10} />Remove file</button>
                  )}
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl font-bold">Submit Claim</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}

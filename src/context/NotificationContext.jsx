import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth, isAdminRole, isManagerRole, roleLevel } from './AuthContext';
import { useData } from './DataContext';
import { isToday } from 'date-fns';
import { isOpenLead } from '../utils/leadStatus';
import { localDateStr, canDecideRequest } from '../utils/beatDates';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user, users, canAccess } = useAuth();
  // A boolean, not the function: canAccess is new on every render, and as an
  // effect dependency it would rebuild the notifications on every render.
  const canEditSfa = Boolean(user) && canAccess('sfa', 'full');
  const { inventory, invoices, complaints, leads, distributors, dealers, retailers, orders, schemes, visitReports, beatPlans, beatCheckinRequests } = useData();
  const [notifications, setNotifications] = useState([]);

  // Load user-specific notifications from localStorage
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`prismora_notifications_${user.id}`);
      setNotifications(saved ? JSON.parse(saved) : []);
    } else {
      setNotifications([]);
    }
  }, [user]);

  // Sync state to localStorage
  const saveNotifications = (newNotifs) => {
    setNotifications(newNotifs);
    if (user) {
      localStorage.setItem(`prismora_notifications_${user.id}`, JSON.stringify(newNotifs));
    }
  };

  // Helper to add a notification
  const addNotification = (type, title, message, link) => {
    if (!user) return;
    const newNotif = {
      id: `NT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type, // 'critical_stock', 'overdue_payment', 'new_complaint', 'lead_assigned', 'info'
      title,
      message,
      link,
      isRead: false,
      timestamp: new Date().toISOString()
    };
    saveNotifications([newNotif, ...notifications]);
  };

  const markAsRead = (id) => {
    saveNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllAsRead = () => {
    saveNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id) => {
    saveNotifications(notifications.filter(n => n.id !== id));
  };

  const clearAll = () => {
    saveNotifications([]);
  };

  // Run dynamic triggers on data changes
  useEffect(() => {
    if (!user) return;

    const newSystemNotifications = [];

    // Trigger 1: Critical Low Stock Alerts (Admin, Manager, Warehouse)
    if (isAdminRole(user.role) || isManagerRole(user.role)) {
      inventory.forEach(item => {
        if (item.quantity <= item.reorderLevel * 0.5 && item.quantity > 0) {
          newSystemNotifications.push({
            id: `sys-stock-${item.id}`,
            type: 'critical_stock',
            title: 'Critical Low Stock',
            message: `${item.product} (Batch: ${item.batchNumber || 'N/A'}) is critically low (${item.quantity} units left).`,
            link: '/inventory',
            isRead: false,
            timestamp: new Date().toISOString()
          });
        } else if (item.quantity === 0) {
          newSystemNotifications.push({
            id: `sys-stockout-${item.id}`,
            type: 'critical_stock',
            title: 'Stock Out Alert',
            message: `${item.product} (Batch: ${item.batchNumber || 'N/A'}) is completely out of stock.`,
            link: '/inventory',
            isRead: false,
            timestamp: new Date().toISOString()
          });
        }

        // Expiry warning within 60 days
        if (item.expiryDate) {
          const daysToExpiry = Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysToExpiry <= 60 && daysToExpiry > 0) {
            newSystemNotifications.push({
              id: `sys-expiry-${item.id}`,
              type: 'critical_stock',
              title: 'Batch Expiring Soon',
              message: `${item.product} (Batch: ${item.batchNumber || 'N/A'}) expires in ${daysToExpiry} days.`,
              link: '/inventory',
              isRead: false,
              timestamp: new Date().toISOString()
            });
          }
        }
      });
    }

    // Trigger 2: Overdue Invoices (Admin, Manager, Accounts)
    if (isAdminRole(user.role) || isManagerRole(user.role)) {
      invoices.forEach(inv => {
        if (inv.status === 'Sent' || inv.status === 'Unpaid' || inv.status === 'Pending') {
          const daysOld = Math.ceil((new Date() - new Date(inv.createdAt)) / (1000 * 60 * 60 * 24));
          if (daysOld > 15) {
            newSystemNotifications.push({
              id: `sys-inv-${inv.id}`,
              type: 'overdue_payment',
              title: 'Invoice Payment Overdue',
              message: `Payment of ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inv.total)} from ${inv.customerName} is overdue by ${daysOld - 15} days.`,
              link: '/accounting',
              isRead: false,
              timestamp: new Date(inv.createdAt).toISOString() // Anchor near invoice date
            });
          }
        }
      });
    }

    // Trigger 3: Unassigned / New Complaints (Admin, Manager)
    if (isAdminRole(user.role) || isManagerRole(user.role)) {
      complaints.forEach(c => {
        if (c.status === 'Registered') {
          newSystemNotifications.push({
            id: `sys-complaint-${c.id}`,
            type: 'new_complaint',
            title: 'New Customer Complaint',
            message: `${c.customerName} filed a ${c.complaintType} for ${c.product || 'product'}.`,
            link: '/complaints',
            isRead: false,
            timestamp: new Date(c.createdAt).toISOString()
          });
        }
      });
    }

    // Trigger 4: Leads follow-up due today (Sales role gets their own leads only)
    leads.forEach(lead => {
      if (lead.assignedTo === user.id && lead.followUpDate) {
        if (isToday(new Date(lead.followUpDate)) && isOpenLead(lead)) {
          newSystemNotifications.push({
            id: `sys-lead-${lead.id}`,
            type: 'lead_assigned',
            title: 'Lead Follow-up Due Today',
            message: `Don't forget to follow up with ${lead.name} (${lead.company}) today.`,
            link: `/leads?searchId=${lead.id}`,
            isRead: false,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    // Trigger 4b: Outlet follow-ups a rep promised on a visit.
    // The date was being collected and then shown nowhere, so nobody could act
    // on it. Overdue ones are called out separately — a follow-up missed by a
    // week is a different problem from one due this morning.
    (visitReports || []).forEach(vr => {
      if (vr.executiveId !== user.id || !vr.nextFollowUp) return;
      const due = new Date(vr.nextFollowUp);
      if (isNaN(due)) return;
      const startOfToday = new Date(new Date().toDateString());
      const days = Math.round((new Date(due.toDateString()) - startOfToday) / 86400000);
      if (days > 0) return;   // still in the future

      newSystemNotifications.push({
        id: `sys-visit-followup-${vr.id}`,
        type: 'lead_assigned',
        title: days === 0 ? 'Outlet Follow-up Due Today' : 'Outlet Follow-up Overdue',
        message: days === 0
          ? `You said you would follow up with ${vr.outletName} today.`
          : `Follow-up with ${vr.outletName} was due ${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''} ago.`,
        link: '/sfa',
        isRead: false,
        timestamp: new Date().toISOString()
      });
    });

    // Trigger 5: Pending channel-partner registrations awaiting approval (Admin/Manager)
    if (isAdminRole(user.role) || isManagerRole(user.role)) {
      [
        { list: distributors, label: 'Distributor', link: '/distributors' },
        { list: dealers, label: 'Dealer', link: '/dealers' },
        { list: retailers, label: 'Retailer', link: '/retailers' },
      ].forEach(({ list, label, link }) => {
        (list || []).filter(x => x.status === 'Pending').forEach(x => {
          newSystemNotifications.push({
            id: `sys-approve-${x.id}`,
            type: 'lead_assigned',
            title: `${label} Awaiting Approval`,
            message: `${x.name} has registered as a ${label} and is pending your approval.`,
            link,
            isRead: false,
            timestamp: x.createdAt || new Date().toISOString()
          });
        });
      });
    }

    // Trigger 5b: Early check-in requests. Approvers see the ones they can
    // decide, in the bell like partner signups rather than a queue of their
    // own; the rep hears back once theirs is decided. Only today's count --
    // a request lapses at midnight, decided or not.
    {
      const today = localDateStr();
      const beatFor = (id) => (beatPlans || []).find(b => b.id === id);
      const nameOf = (id) => (users || []).find(u => u.id === id)?.name || 'A rep';
      const level = roleLevel(user.role);
      (beatCheckinRequests || []).forEach(r => {
        if (r.requestedFor !== today) return;
        const beat = beatFor(r.beatId);
        const where = beat ? `the beat on ${beat.date}${Array.isArray(beat.outlets) && beat.outlets.length ? ` (${beat.outlets.join(', ')})` : ''}` : 'a beat';
        if (canDecideRequest({ approver: user, approverLevel: level, canEditSfa, request: r, today })) {
          newSystemNotifications.push({
            id: `sys-early-checkin-${r.id}`,
            type: 'lead_assigned',
            title: 'Early Check-in Request',
            message: `${nameOf(r.requestedBy)} wants to check in today on ${where}: "${r.reason}"`,
            link: '/sfa?tab=beats',
            isRead: false,
            timestamp: r.createdAt || new Date().toISOString(),
          });
        } else if (r.requestedBy === user.id && r.status !== 'Pending') {
          newSystemNotifications.push({
            id: `sys-early-checkin-${r.id}-${r.status}`,
            type: 'lead_assigned',
            title: r.status === 'Approved' ? 'Early Check-in Approved' : 'Early Check-in Declined',
            message: r.status === 'Approved'
              ? `You can check in today on ${where}.`
              : `Your request for ${where} was declined${r.decisionNote ? `: ${r.decisionNote}` : '.'}`,
            link: '/sfa?tab=beats',
            isRead: false,
            timestamp: r.decidedAt || r.createdAt || new Date().toISOString(),
          });
        }
      });
    }

    // Trigger 6: Schemes expiring within 7 days (Admin/Manager)
    if (isAdminRole(user.role) || isManagerRole(user.role)) {
      (schemes || []).forEach(s => {
        if (s.status !== 'Active' || !s.validTo) return;
        const days = Math.ceil((new Date(s.validTo) - new Date()) / (1000 * 60 * 60 * 24));
        if (days >= 0 && days <= 7) {
          newSystemNotifications.push({
            id: `sys-scheme-${s.id}`,
            type: 'info',
            title: 'Scheme Expiring Soon',
            message: `Scheme "${s.name}" expires in ${days} day${days === 1 ? '' : 's'}.`,
            link: '/schemes',
            isRead: false,
            timestamp: new Date().toISOString()
          });
        }
      });
    }

    // Trigger 7: Fulfillment queue — role-specific orders needing action
    if (user.role === 'Warehouse Manager') {
      (orders || []).filter(o => o.status === 'Processing').forEach(o => {
        newSystemNotifications.push({
          id: `sys-wh-${o.id}`,
          type: 'info',
          title: 'Order Needs Warehouse Action',
          message: `Order ${o.id} (${o.customerName}) is Processing — check stock & mark Ready for Dispatch.`,
          link: `/orders?searchId=${o.id}`,
          isRead: false,
          timestamp: o.createdAt || new Date().toISOString()
        });
      });
    }
    if (user.role === 'Dispatch Team') {
      (orders || []).filter(o => o.status === 'Ready for Dispatch' || o.status === 'Shipped').forEach(o => {
        newSystemNotifications.push({
          id: `sys-disp-${o.id}`,
          type: 'info',
          title: 'Order Needs Dispatch Action',
          message: `Order ${o.id} (${o.customerName}) is ${o.status} — move it forward.`,
          link: `/orders?searchId=${o.id}`,
          isRead: false,
          timestamp: o.createdAt || new Date().toISOString()
        });
      });
    }

    // Trigger 8b: Staff — deliveries nobody has acknowledged.
    //
    // Trigger 8 below only fires for a portal login, so a delivery to a
    // customer who has no portal was chased by nobody: it simply sat unconfirmed
    // for ever. Staff can record it on their behalf, so staff are told.
    //
    // Only after a week, and only the ten oldest. A delivery confirmed the next
    // day is not a problem worth a notification, and an inbox of forty of these
    // is one nobody reads.
    const isPortalUser = Boolean(user.distributorId || user.dealerId || user.retailerId);
    if (!isPortalUser) {
      const aWeekAgo = Date.now() - 7 * 86400000;
      (orders || [])
        .filter(o => o.status === 'Delivered' && !o.receivedByDistributor)
        .filter(o => {
          const when = new Date(o.fulfilledAt || o.date || o.createdAt || 0).getTime();
          return Number.isFinite(when) && when > 0 && when < aWeekAgo;
        })
        .sort((a, b) => new Date(a.fulfilledAt || a.date || a.createdAt || 0) - new Date(b.fulfilledAt || b.date || b.createdAt || 0))
        .slice(0, 10)
        .forEach(o => {
          newSystemNotifications.push({
            id: `sys-unreceipted-${o.id}`,
            type: 'warning',
            title: 'Delivery Not Acknowledged',
            message: `Order ${o.id} (${o.customerName}) was delivered over a week ago and nobody has confirmed receipt — record it if you know it arrived.`,
            link: `/orders?searchId=${o.id}`,
            isRead: false,
            timestamp: o.fulfilledAt || o.createdAt || new Date().toISOString()
          });
        });
    }

    // Trigger 8: Portal users — delivered orders awaiting their receipt confirmation
    const myPartyId = user.distributorId || user.dealerId || user.retailerId;
    if (myPartyId) {
      (orders || []).filter(o =>
        (o.distributorId === myPartyId || o.dealerId === myPartyId || o.retailerId === myPartyId) &&
        o.status === 'Delivered' && !o.receivedByDistributor
      ).forEach(o => {
        newSystemNotifications.push({
          id: `sys-receipt-${o.id}`,
          type: 'info',
          title: 'Confirm Order Receipt',
          message: `Order ${o.id} was marked Delivered — please confirm you've received it.`,
          link: '/orders',
          isRead: false,
          timestamp: o.createdAt || new Date().toISOString()
        });
      });
    }

    // Merge system-triggered notifications with user's custom notifications
    setNotifications(prev => {
      // Keep only custom notifications that aren't system-generated prefix-matching
      const customOnly = prev.filter(n => !n.id.startsWith('sys-'));
      
      // Load read-status mappings for system alerts so they stay read
      const systemReadStatus = JSON.parse(localStorage.getItem(`prismora_sys_read_${user.id}`) || '{}');
      
      const mergedSystem = newSystemNotifications.map(sn => ({
        ...sn,
        isRead: !!systemReadStatus[sn.id]
      }));

      // Combine and sort by timestamp
      const all = [...mergedSystem, ...customOnly].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return all;
    });

  }, [inventory, invoices, complaints, leads, distributors, dealers, retailers, orders, schemes, visitReports, beatPlans, beatCheckinRequests, users, canEditSfa, user]);

  // Special markRead wrapper to remember read status of system alerts
  const markSystemRead = (id) => {
    if (!user) return;
    markAsRead(id);
    if (id.startsWith('sys-')) {
      const systemReadStatus = JSON.parse(localStorage.getItem(`prismora_sys_read_${user.id}`) || '{}');
      systemReadStatus[id] = true;
      localStorage.setItem(`prismora_sys_read_${user.id}`, JSON.stringify(systemReadStatus));
    }
  };

  const markAllSystemRead = () => {
    if (!user) return;
    markAllAsRead();
    const systemReadStatus = {};
    notifications.forEach(n => {
      if (n.id.startsWith('sys-')) {
        systemReadStatus[n.id] = true;
      }
    });
    localStorage.setItem(`prismora_sys_read_${user.id}`, JSON.stringify(systemReadStatus));
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount: notifications.filter(n => !n.isRead).length,
      addNotification,
      markAsRead: markSystemRead,
      markAllAsRead: markAllSystemRead,
      deleteNotification,
      clearAll
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);

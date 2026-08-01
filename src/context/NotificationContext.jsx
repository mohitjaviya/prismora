import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth, isAdminRole, isManagerRole } from './AuthContext';
import { useData } from './DataContext';
import { isToday } from 'date-fns';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const { inventory, invoices, complaints, leads, distributors, dealers, retailers, orders, schemes } = useData();
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
        if (isToday(new Date(lead.followUpDate)) && lead.status !== 'Converted' && lead.status !== 'Lost') {
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

  }, [inventory, invoices, complaints, leads, distributors, dealers, retailers, orders, schemes, user]);

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

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [leads, setLeads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: leadsData } = await supabase.from('leads').select('*').order('createdAt', { ascending: false });
    if (leadsData) setLeads(leadsData);

    const { data: ordersData } = await supabase.from('orders').select('*').order('createdAt', { ascending: false });
    if (ordersData) setOrders(ordersData);

    const { data: eventsData } = await supabase.from('events').select('*').order('timestamp', { ascending: false });
    if (eventsData) setEventLog(eventsData);

    const { data: productsData } = await supabase.from('products').select('name');
    if (productsData) setProducts(productsData.map(p => p.name));

    // Fetch Invoices with fallback
    let fetchedInvoices = [];
    try {
      const { data, error } = await supabase.from('invoices').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      fetchedInvoices = data || [];
      
      // If table exists but has no records, check if there are local storage invoices we can use & sync
      if (fetchedInvoices.length === 0) {
        const local = localStorage.getItem('prismora_invoices');
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.length > 0) {
            fetchedInvoices = parsed;
            console.log("Syncing local invoices to Supabase...");
            parsed.forEach(async (inv) => {
              try {
                const { error: insertErr } = await supabase.from('invoices').insert([inv]);
                if (insertErr && (insertErr.code === '42703' || insertErr.message.includes('assignedTo'))) {
                  const { assignedTo, ...cleanInv } = inv;
                  await supabase.from('invoices').insert([cleanInv]);
                }
              } catch (e) { console.error("Error syncing invoice:", e); }
            });
          }
        }
      }
    } catch (err) {
      console.warn("Supabase invoices table fetch failed, using localStorage fallback.", err);
      const local = localStorage.getItem('prismora_invoices');
      fetchedInvoices = local ? JSON.parse(local) : [];
    }
    setInvoices(fetchedInvoices);

    // Fetch Expenses with fallback
    let fetchedExpenses = [];
    try {
      const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (error) throw error;
      fetchedExpenses = data || [];

      // If table exists but has no records, check if there are local storage expenses we can use & sync
      if (fetchedExpenses.length === 0) {
        const local = localStorage.getItem('prismora_expenses');
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.length > 0) {
            fetchedExpenses = parsed;
            console.log("Syncing local expenses to Supabase...");
            parsed.forEach(async (exp) => {
              try {
                await supabase.from('expenses').insert([exp]);
              } catch (e) { console.error("Error syncing expense:", e); }
            });
          }
        }
      }
    } catch (err) {
      console.warn("Supabase expenses table fetch failed, using localStorage fallback.", err);
      const local = localStorage.getItem('prismora_expenses');
      fetchedExpenses = local ? JSON.parse(local) : [];
    }
    setExpenses(fetchedExpenses);
  };

  const logEvent = async (type, message, assignedTo, dataId) => {
    const newEvent = {
      id: `EV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      message,
      assignedTo: assignedTo,
      dataId: dataId,
      timestamp: new Date().toISOString()
    };
    
    setEventLog(prev => [newEvent, ...prev]);
    await supabase.from('events').insert([newEvent]);
  };

  const addLead = async (lead) => {
    const maxId = leads.reduce((max, l) => {
      const num = parseInt(l.id.replace('L', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `L${maxId + 1}`;
    const newLead = { 
      ...lead,
      id: newId, 
      createdAt: new Date().toISOString()
    };
    setLeads([newLead, ...leads]);
    await supabase.from('leads').insert([newLead]);
    logEvent('lead_new', `New Lead added: ${lead.name}`, lead.assignedTo, newId);
  };

  const updateLead = async (id, updatedData) => {
    const oldLead = leads.find(l => l.id === id);
    setLeads(leads.map(l => l.id === id ? { ...l, ...updatedData } : l));
    await supabase.from('leads').update(updatedData).eq('id', id);
    
    if (oldLead && oldLead.status !== updatedData.status) {
      if (updatedData.status === 'Converted') {
        logEvent('lead_converted', `Lead Converted: ${updatedData.name || oldLead.name}`, updatedData.assignedTo || oldLead.assignedTo, id);
      } else if (updatedData.status === 'Lost') {
        logEvent('lead_lost', `Lead Lost: ${updatedData.name || oldLead.name}`, updatedData.assignedTo || oldLead.assignedTo, id);
      }
    }
  };

  const deleteLead = async (id) => {
    setLeads(leads.filter(l => l.id !== id));
    await supabase.from('leads').delete().eq('id', id);
  };

  const addOrder = async (order) => {
    const maxId = orders.reduce((max, o) => {
      const num = parseInt(o.id.replace('O', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `O${maxId + 1}`;
    const newOrder = { 
      ...order,
      id: newId, 
      createdAt: new Date().toISOString()
    };
    setOrders([newOrder, ...orders]);
    await supabase.from('orders').insert([newOrder]);
  };

  const updateOrder = async (id, updatedData) => {
    const oldOrder = orders.find(o => o.id === id);
    setOrders(orders.map(o => o.id === id ? { ...o, ...updatedData } : o));
    await supabase.from('orders').update(updatedData).eq('id', id);
    
    if (oldOrder && oldOrder.status !== updatedData.status) {
      if (updatedData.status === 'Processing') {
        logEvent('order_processing', `Order Processing: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      } else if (updatedData.status === 'Delivered') {
        logEvent('order_delivered', `Order Delivered: ${updatedData.customerName || oldOrder.customerName}`, updatedData.assignedTo || oldOrder.assignedTo, id);
      }
    }
  };

  const deleteOrder = async (id) => {
    setOrders(orders.filter(o => o.id !== id));
    await supabase.from('orders').delete().eq('id', id);
  };
  
  const addProduct = async (productName) => {
    if (!products.includes(productName) && productName.trim() !== '') {
      setProducts(prev => [...prev, productName.trim()]);
      await supabase.from('products').insert([{ name: productName.trim() }]);
    }
  };

  const addInvoice = async (invoiceData) => {
    const maxId = invoices.reduce((max, inv) => {
      const num = parseInt(inv.id.replace('INV-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `INV-${maxId + 1}`;
    const newInvoice = {
      ...invoiceData,
      id: newId,
      createdAt: new Date().toISOString()
    };

    setInvoices(prev => [newInvoice, ...prev]);

    try {
      const { error } = await supabase.from('invoices').insert([newInvoice]);
      if (error) {
        // If the error is code 42703 (undefined column) or mentions 'assignedTo', retry without it
        if (error.code === '42703' || (error.message && error.message.includes('assignedTo'))) {
          console.warn("invoices table does not have 'assignedTo' column. Retrying without it.");
          const { assignedTo, ...cleanInvoice } = newInvoice;
          const { error: retryError } = await supabase.from('invoices').insert([cleanInvoice]);
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
      
      // If inserted successfully to Supabase, also save to localStorage so we keep them in sync
      const local = localStorage.getItem('prismora_invoices');
      const existing = local ? JSON.parse(local) : [];
      localStorage.setItem('prismora_invoices', JSON.stringify([newInvoice, ...existing]));
    } catch (err) {
      console.warn("Failed to insert invoice to Supabase. Saving to localStorage.", err);
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
      console.warn("Failed to update invoice in Supabase. Updating in localStorage.", err);
      const local = localStorage.getItem('prismora_invoices');
      if (local) {
        const parsed = JSON.parse(local);
        const updated = parsed.map(inv => inv.id === id ? { ...inv, status } : inv);
        localStorage.setItem('prismora_invoices', JSON.stringify(updated));
      }
    }

    if (oldInvoice) {
      logEvent('invoice_status_update', `Invoice ${id} marked as ${status}`, oldInvoice.assignedTo, id);
    }
  };

  const deleteInvoice = async (id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));

    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.warn("Failed to delete invoice from Supabase.", err);
    }

    // Always keep localStorage in sync
    const local = localStorage.getItem('prismora_invoices');
    if (local) {
      const parsed = JSON.parse(local);
      const updated = parsed.filter(inv => inv.id !== id);
      localStorage.setItem('prismora_invoices', JSON.stringify(updated));
    }
  };

  const addExpense = async (expenseData) => {
    const maxId = expenses.reduce((max, exp) => {
      const num = parseInt(exp.id.replace('EXP-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = `EXP-${maxId + 1}`;
    const newExpense = {
      ...expenseData,
      id: newId,
      createdAt: new Date().toISOString()
    };

    setExpenses(prev => [newExpense, ...prev]);

    try {
      const { error } = await supabase.from('expenses').insert([newExpense]);
      if (error) throw error;
    } catch (err) {
      console.warn("Failed to insert expense to Supabase.", err);
    }

    // Always keep localStorage in sync
    const local = localStorage.getItem('prismora_expenses');
    const existing = local ? JSON.parse(local) : [];
    localStorage.setItem('prismora_expenses', JSON.stringify([newExpense, ...existing]));

    logEvent('expense_new', `Logged expense: ${expenseData.category} - ${newExpense.amount}`, expenseData.assignedTo, newId);
  };

  const deleteExpense = async (id) => {
    setExpenses(prev => prev.filter(exp => exp.id !== id));

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.warn("Failed to delete expense from Supabase.", err);
    }

    // Always keep localStorage in sync
    const local = localStorage.getItem('prismora_expenses');
    if (local) {
      const parsed = JSON.parse(local);
      const updated = parsed.filter(exp => exp.id !== id);
      localStorage.setItem('prismora_expenses', JSON.stringify(updated));
    }
  };

  return (
    <DataContext.Provider value={{ 
      leads, orders, eventLog, products, invoices, expenses,
      addLead, updateLead, deleteLead,
      addOrder, updateOrder, deleteOrder,
      addProduct,
      addInvoice, updateInvoiceStatus, deleteInvoice,
      addExpense, deleteExpense
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);

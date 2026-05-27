import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [leads, setLeads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [products, setProducts] = useState([]);

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

  return (
    <DataContext.Provider value={{ 
      leads, orders, eventLog, products,
      addLead, updateLead, deleteLead,
      addOrder, updateOrder, deleteOrder,
      addProduct
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);

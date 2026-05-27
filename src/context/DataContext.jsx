import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const initialLeads = [
  { id: 'L1', name: 'Arjun Patel', company: 'Wellness Co.', phone: '9876543210', email: 'arjun@wellness.co', productInterest: ['Rose Blossom Hand Wash', 'Neem + Aloe Hand Wash'], leadSource: 'Referral', assignedTo: '3', status: 'New', followUpDate: addDays(new Date(), 1).toISOString(), notes: 'Interested in bulk pricing', dealValue: 50000, createdAt: new Date().toISOString() },
  { id: 'L2', name: 'Sneha Rao', company: 'AyurCare', phone: '9876543211', email: 'sneha@ayurcare.in', productInterest: ['Lavender Body Wash', 'Aqua Fresh Body Wash'], leadSource: 'WhatsApp', assignedTo: '4', status: 'Contacted', followUpDate: addDays(new Date(), 3).toISOString(), notes: 'Sent brochure', dealValue: 25000, createdAt: new Date().toISOString() },
  { id: 'L3', name: 'Rahul Sharma', company: 'Nature Meds', phone: '9876543212', email: 'rahul@naturemeds.com', productInterest: ['Vitamin - C Face Wash', 'Neem + Tulsi Face Wash', 'Suns Shield Sunscreen SPF 50'], leadSource: 'Trade Show', assignedTo: '5', status: 'Hot Lead', followUpDate: subDays(new Date(), 1).toISOString(), notes: 'Urgent requirement', dealValue: 100000, createdAt: new Date().toISOString() },
  { id: 'L4', name: 'Priya Desai', company: 'Desai Herbals', phone: '9876543213', email: 'priya@desaiherbals.com', productInterest: ['Aloe Vera Body Lotion'], leadSource: 'Website', assignedTo: '6', status: 'Negotiating', followUpDate: addDays(new Date(), 0).toISOString(), notes: 'Asking for 10% discount', dealValue: 75000, createdAt: new Date().toISOString() },
  { id: 'L5', name: 'Vikram Singh', company: 'Singh Pharmacies', phone: '9876543214', email: 'vikram@singh.com', productInterest: ['Suns Shield Sunscreen SPF 50', 'Lemon Fresh Hand Wash'], leadSource: 'Cold Call', assignedTo: '3', status: 'Converted', followUpDate: subDays(new Date(), 5).toISOString(), notes: 'Deal closed', dealValue: 120000, createdAt: new Date().toISOString() },
  { id: 'L6', name: 'Anita Verma', company: 'Verma Naturals', phone: '9876543215', email: 'anita@verma.com', productInterest: ['Onion + Black Seed Hair Oil', 'Coconut + Hibiscus Hair Oil'], leadSource: 'Instagram', assignedTo: '4', status: 'Lost', followUpDate: subDays(new Date(), 10).toISOString(), notes: 'Bought from competitor', dealValue: 30000, createdAt: new Date().toISOString() },
  { id: 'L7', name: 'Ramesh Gupta', company: 'Gupta Botanicals', phone: '9876543216', email: 'ramesh@gupta.com', productInterest: ['Argan + Keratin Shampoo', 'Aloe + Green Tea Shampoo'], leadSource: 'Distributor', assignedTo: '5', status: 'New', followUpDate: addDays(new Date(), 2).toISOString(), notes: 'Needs sample', dealValue: 45000, createdAt: new Date().toISOString() },
  { id: 'L8', name: 'Meera Iyer', company: 'Iyer Health', phone: '9876543217', email: 'meera@iyer.in', productInterest: ['Neem + Aloe Hand Wash'], leadSource: 'Referral', assignedTo: '6', status: 'Contacted', followUpDate: addDays(new Date(), 4).toISOString(), notes: 'Call next week', dealValue: 80000, createdAt: new Date().toISOString() },
  { id: 'L9', name: 'Karan Malhotra', company: 'Malhotra Extracts', phone: '9876543218', email: 'karan@malhotra.com', productInterest: ['Aqua Fresh Body Wash', 'Lavender Body Wash', 'Shea Butter Body Lotion'], leadSource: 'LinkedIn', assignedTo: '3', status: 'Negotiating', followUpDate: addDays(new Date(), 1).toISOString(), notes: 'Discussing terms', dealValue: 150000, createdAt: new Date().toISOString() },
  { id: 'L10', name: 'Neha Kapoor', company: 'Kapoor Wellness', phone: '9876543219', email: 'neha@kapoor.com', productInterest: ['Shea Butter Body Lotion', 'Aloe Vera Body Lotion'], leadSource: 'Trade Show', assignedTo: '4', status: 'Hot Lead', followUpDate: addDays(new Date(), 0).toISOString(), notes: 'Ready to sign', dealValue: 200000, createdAt: new Date().toISOString() },
  { id: 'L11', name: 'Sanjay Dutt', company: 'Dutt Ayurveda', phone: '9876543220', email: 'sanjay@dutt.in', productInterest: ['Neem + Tulsi Face Wash', 'Vitamin - C Face Wash'], leadSource: 'Walk-in', assignedTo: '5', status: 'Converted', followUpDate: subDays(new Date(), 2).toISOString(), notes: 'Signed contract', dealValue: 350000, createdAt: new Date().toISOString() },
  { id: 'L12', name: 'Pooja Bhatt', company: 'Bhatt Naturals', phone: '9876543221', email: 'pooja@bhatt.com', productInterest: ['Aloe + Green Tea Shampoo', 'Onion + Bhringraj Shampoo'], leadSource: 'WhatsApp', assignedTo: '6', status: 'Lost', followUpDate: subDays(new Date(), 15).toISOString(), notes: 'Budget issue', dealValue: 15000, createdAt: new Date().toISOString() },
];

const initialOrders = [
  { id: 'O1', product: 'Rose Blossom Hand Wash', quantity: 100, value: 50000, state: 'Gujarat', city: 'Ahmedabad', customerName: 'Arjun Patel', companyName: 'Wellness Co.', assignedTo: '3', status: 'Delivered', date: subDays(new Date(), 5).toISOString(), createdAt: new Date().toISOString() },
  { id: 'O2', product: 'Lavender Body Wash', quantity: 250, value: 120000, state: 'Maharashtra', city: 'Mumbai', customerName: 'Vikram Singh', companyName: 'Singh Pharmacies', assignedTo: '3', status: 'Processing', date: subDays(new Date(), 2).toISOString(), createdAt: new Date().toISOString() },
  { id: 'O3', product: 'Vitamin - C Face Wash', quantity: 50, value: 25000, state: 'Karnataka', city: 'Bangalore', customerName: 'Sneha Rao', companyName: 'AyurCare', assignedTo: '4', status: 'Shipped', date: subDays(new Date(), 1).toISOString(), createdAt: new Date().toISOString() },
  { id: 'O4', product: 'Aloe Vera Body Lotion', quantity: 200, value: 100000, state: 'Delhi', city: 'New Delhi', customerName: 'Rahul Sharma', companyName: 'Nature Meds', assignedTo: '5', status: 'Delivered', date: subDays(new Date(), 15).toISOString(), createdAt: new Date().toISOString() },
  { id: 'O5', product: 'Suns Shield Sunscreen SPF 50', quantity: 150, value: 75000, state: 'Gujarat', city: 'Surat', customerName: 'Priya Desai', companyName: 'Desai Herbals', assignedTo: '6', status: 'Pending', date: subDays(new Date(), 0).toISOString(), createdAt: new Date().toISOString() },
  
  // Historical Data for Yearly Breakdown Demo
  { id: 'O6', product: 'Onion + Black Seed Hair Oil', quantity: 50, value: 25000, state: 'Gujarat', city: 'Ahmedabad', customerName: 'Arjun Patel', companyName: 'Wellness Co.', assignedTo: '3', status: 'Delivered', date: '2025-06-15T10:00:00.000Z', createdAt: '2025-06-15T10:00:00.000Z' },
  { id: 'O7', product: 'Argan + Keratin Shampoo', quantity: 100, value: 45000, state: 'Gujarat', city: 'Ahmedabad', customerName: 'Arjun Patel', companyName: 'Wellness Co.', assignedTo: '3', status: 'Delivered', date: '2024-11-20T10:00:00.000Z', createdAt: '2024-11-20T10:00:00.000Z' },
  { id: 'O8', product: 'Neem + Aloe Hand Wash', quantity: 300, value: 90000, state: 'Maharashtra', city: 'Mumbai', customerName: 'Vikram Singh', companyName: 'Singh Pharmacies', assignedTo: '3', status: 'Delivered', date: '2025-02-10T10:00:00.000Z', createdAt: '2025-02-10T10:00:00.000Z' },
  
  // More recent & past orders
  { id: 'O9', product: 'Aqua Fresh Body Wash', quantity: 100, value: 45000, state: 'Uttar Pradesh', city: 'Lucknow', customerName: 'Ramesh Gupta', companyName: 'Gupta Botanicals', assignedTo: '5', status: 'Processing', date: subDays(new Date(), 1).toISOString(), createdAt: subDays(new Date(), 1).toISOString() },
  { id: 'O10', product: 'Shea Butter Body Lotion', quantity: 150, value: 60000, state: 'Tamil Nadu', city: 'Chennai', customerName: 'Meera Iyer', companyName: 'Iyer Health', assignedTo: '6', status: 'Delivered', date: '2025-08-05T10:00:00.000Z', createdAt: '2025-08-05T10:00:00.000Z' },
  { id: 'O11', product: 'Neem + Tulsi Face Wash', quantity: 200, value: 150000, state: 'Punjab', city: 'Ludhiana', customerName: 'Karan Malhotra', companyName: 'Malhotra Extracts', assignedTo: '3', status: 'Shipped', date: subDays(new Date(), 3).toISOString(), createdAt: subDays(new Date(), 3).toISOString() },
  { id: 'O12', product: 'Aloe + Green Tea Shampoo', quantity: 50, value: 100000, state: 'Haryana', city: 'Gurgaon', customerName: 'Neha Kapoor', companyName: 'Kapoor Wellness', assignedTo: '4', status: 'Pending', date: subDays(new Date(), 0).toISOString(), createdAt: subDays(new Date(), 0).toISOString() },
  { id: 'O13', product: 'Lemon Fresh Hand Wash', quantity: 400, value: 200000, state: 'Rajasthan', city: 'Jaipur', customerName: 'Sanjay Dutt', companyName: 'Dutt Ayurveda', assignedTo: '5', status: 'Delivered', date: '2024-05-12T10:00:00.000Z', createdAt: '2024-05-12T10:00:00.000Z' },
  { id: 'O14', product: 'Coconut + Hibiscus Hair Oil', quantity: 100, value: 45000, state: 'Karnataka', city: 'Bangalore', customerName: 'Sneha Rao', companyName: 'AyurCare', assignedTo: '4', status: 'Delivered', date: '2025-01-20T10:00:00.000Z', createdAt: '2025-01-20T10:00:00.000Z' },
  { id: 'O15', product: 'Antiseptic Hand Wash', quantity: 500, value: 250000, state: 'Delhi', city: 'New Delhi', customerName: 'Rahul Sharma', companyName: 'Nature Meds', assignedTo: '5', status: 'Delivered', date: '2025-10-10T10:00:00.000Z', createdAt: '2025-10-10T10:00:00.000Z' },
];

const initialCatalog = [
  'Rose Blossom Hand Wash', 'Neem + Aloe Hand Wash', 'Lemon Fresh Hand Wash', 'Antiseptic Hand Wash',
  'Lavender Body Wash', 'Aqua Fresh Body Wash',
  'Aloe Vera Body Lotion', 'Shea Butter Body Lotion',
  'Vitamin - C Face Wash', 'Neem + Tulsi Face Wash',
  'Suns Shield Sunscreen SPF 50',
  'Coconut + Hibiscus Hair Oil', 'Amla + Bhringraj Hair Oil', 'Onion + Black Seed Hair Oil',
  'Lemon + Tea Tree + Rosemary Shampoo', 'Argan + Keratin Shampoo', 'Aloe + Green Tea Shampoo', 'Onion + Bhringraj Shampoo'
];

const DATA_VERSION = 'v4'; // Bump this to force a fresh reset

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

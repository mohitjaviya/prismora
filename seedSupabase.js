import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const initialMockUsers = [
  { id: '1', name: 'Admin User', email: 'admin@prismora.com', role: 'Admin', password: 'password123', managedUsers: [] },
  { id: '2', name: 'Manager User', email: 'manager@prismora.com', role: 'Manager', password: 'password123', managedUsers: ['3', '4'] },
  { id: '3', name: 'Surbhi', email: 'surbhi@prismora.com', role: 'Sales', password: 'password123', managedUsers: [] },
  { id: '4', name: 'Ruta', email: 'ruta@prismora.com', role: 'Sales', password: 'password123', managedUsers: [] },
  { id: '5', name: 'Krina', email: 'krina@prismora.com', role: 'Sales', password: 'password123', managedUsers: [] },
  { id: '6', name: 'Janki', email: 'janki@prismora.com', role: 'Sales', password: 'password123', managedUsers: [] },
];

const initialLeads = [
  { id: 'L1', name: 'Arjun Patel', company: 'Wellness Co.', phone: '9876543210', email: 'arjun@wellness.co', productInterest: ['Rose Blossom Hand Wash', 'Neem + Aloe Hand Wash'], leadSource: 'Referral', assignedTo: '3', status: 'New', notes: 'Interested in bulk pricing', dealValue: 50000 },
  { id: 'L2', name: 'Sneha Rao', company: 'AyurCare', phone: '9876543211', email: 'sneha@ayurcare.in', productInterest: ['Lavender Body Wash', 'Aqua Fresh Body Wash'], leadSource: 'WhatsApp', assignedTo: '4', status: 'Contacted', notes: 'Sent brochure', dealValue: 25000 },
  { id: 'L3', name: 'Rahul Sharma', company: 'Nature Meds', phone: '9876543212', email: 'rahul@naturemeds.com', productInterest: ['Vitamin - C Face Wash', 'Neem + Tulsi Face Wash', 'Suns Shield Sunscreen SPF 50'], leadSource: 'Trade Show', assignedTo: '5', status: 'Hot Lead', notes: 'Urgent requirement', dealValue: 100000 },
  { id: 'L4', name: 'Priya Desai', company: 'Desai Herbals', phone: '9876543213', email: 'priya@desaiherbals.com', productInterest: ['Aloe Vera Body Lotion'], leadSource: 'Website', assignedTo: '6', status: 'Negotiating', notes: 'Asking for 10% discount', dealValue: 75000 },
  { id: 'L5', name: 'Vikram Singh', company: 'Singh Pharmacies', phone: '9876543214', email: 'vikram@singh.com', productInterest: ['Suns Shield Sunscreen SPF 50', 'Lemon Fresh Hand Wash'], leadSource: 'Cold Call', assignedTo: '3', status: 'Converted', notes: 'Deal closed', dealValue: 120000 },
  { id: 'L6', name: 'Anita Verma', company: 'Verma Naturals', phone: '9876543215', email: 'anita@verma.com', productInterest: ['Onion + Black Seed Hair Oil', 'Coconut + Hibiscus Hair Oil'], leadSource: 'Instagram', assignedTo: '4', status: 'Lost', notes: 'Bought from competitor', dealValue: 30000 },
];

const initialOrders = [
  { id: 'O1', product: 'Rose Blossom Hand Wash', quantity: 100, value: 50000, state: 'Gujarat', city: 'Ahmedabad', customerName: 'Arjun Patel', companyName: 'Wellness Co.', assignedTo: '3', status: 'Delivered', date: new Date().toISOString() },
  { id: 'O2', product: 'Lavender Body Wash', quantity: 250, value: 120000, state: 'Maharashtra', city: 'Mumbai', customerName: 'Vikram Singh', companyName: 'Singh Pharmacies', assignedTo: '3', status: 'Processing', date: new Date().toISOString() },
  { id: 'O3', product: 'Vitamin - C Face Wash', quantity: 50, value: 25000, state: 'Karnataka', city: 'Bangalore', customerName: 'Sneha Rao', companyName: 'AyurCare', assignedTo: '4', status: 'Shipped', date: new Date().toISOString() },
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

async function seed() {
  console.log("Seeding Supabase...");

  // Seed Users
  const { error: usersError } = await supabase.from('users').upsert(initialMockUsers);
  if (usersError) console.error("Error seeding users:", usersError);
  else console.log("Users seeded.");

  // Seed Leads
  const { error: leadsError } = await supabase.from('leads').upsert(initialLeads);
  if (leadsError) console.error("Error seeding leads:", leadsError);
  else console.log("Leads seeded.");

  // Seed Orders
  const { error: ordersError } = await supabase.from('orders').upsert(initialOrders);
  if (ordersError) console.error("Error seeding orders:", ordersError);
  else console.log("Orders seeded.");

  // Seed Products
  const { error: productsError } = await supabase.from('products').upsert(
    initialCatalog.map(name => ({ name }))
  );
  if (productsError) console.error("Error seeding products:", productsError);
  else console.log("Products seeded.");

  console.log("Seeding complete!");
}

seed();

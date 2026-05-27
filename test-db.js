import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
  console.log("Testing Supabase connection...");
  const { data, error } = await supabase
    .from('prismora_users')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error("Error querying users table:", error.message);
  } else {
    console.log("Users table exists! First user:", data[0]);
    if (data[0] && !('password' in data[0])) {
      console.log("CRITICAL: The 'password' column does not exist!");
    } else {
      console.log("The 'password' column exists.");
    }
  }
}

testLogin();

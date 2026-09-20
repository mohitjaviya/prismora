CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  password TEXT NOT NULL,
  "managedUsers" TEXT[]
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  "productInterest" TEXT[],
  "leadSource" TEXT,
  "assignedTo" TEXT REFERENCES users(id),
  status TEXT,
  "followUpDate" TIMESTAMP,
  notes TEXT,
  "dealValue" NUMERIC,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  "customerName" TEXT NOT NULL,
  "companyName" TEXT,
  product TEXT,
  quantity INTEGER,
  value NUMERIC,
  state TEXT,
  city TEXT,
  status TEXT,
  "assignedTo" TEXT REFERENCES users(id),
  date TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT,
  message TEXT,
  "assignedTo" TEXT,
  "dataId" TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
  name TEXT PRIMARY KEY
);

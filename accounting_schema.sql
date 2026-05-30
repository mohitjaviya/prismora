-- Accounting Schema Addition for PRISMORA

-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  "orderId" TEXT REFERENCES orders(id) ON DELETE SET NULL,
  "customerName" TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  status TEXT NOT NULL, -- 'Paid', 'Unpaid', 'Overdue'
  "dueDate" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'Raw Materials', 'Logistics', 'Marketing', 'Salaries', 'Rent', 'Other'
  amount NUMERIC NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL,
  "assignedTo" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Diagnostic: lists every column the application writes that is MISSING
-- from this database. Read-only; changes nothing. Run in Supabase SQL Editor.
WITH expected(tbl, col) AS (
  VALUES
    ('vendors','outstandingAmount'),
    ('schemes','applicableProducts'),
    ('users','status'),
    ('users','distributorId'),
    ('users','dealerId'),
    ('users','retailerId'),
    ('orders','distributorId'),
    ('orders','dealerId'),
    ('orders','retailerId'),
    ('orders','items'),
    ('orders','receivedByDistributor'),
    ('orders','receivedAt'),
    ('orders','splitFromOrderId'),
    ('orders','splitIntoOrderId'),
    ('orders','deliveredQty'),
    ('orders','fulfilledAt'),
    ('complaints','distributorId'),
    ('complaints','dealerId'),
    ('complaints','retailerId')
)
SELECT e.tbl AS table_name,
       e.col AS missing_column
FROM expected e
LEFT JOIN information_schema.columns c
       ON c.table_name = e.tbl
      AND c.column_name = e.col
      AND c.table_schema = 'public'
WHERE c.column_name IS NULL
ORDER BY e.tbl, e.col;

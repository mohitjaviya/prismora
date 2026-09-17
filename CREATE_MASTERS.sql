-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the masters table.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  Every dropdown in the app was a list written into whichever file needed
--  it — twenty of them across fifteen files. Adding a lead source meant a
--  developer and a deployment. This holds them instead.
--
--  `key` is what the application stores and compares against. `label` is what
--  people see. They start out identical, and only the label may be changed.
--
--  That split is the whole point. The code reads 'Delivered' to know when to
--  deduct stock and raise an invoice, and 'GRN Done' to move a purchase order
--  along. Rename one of those and the business stops working with no error at
--  all. `locked` marks those rows: their label can change, their key cannot,
--  and they cannot be deleted.
--
--  Seeded with exactly the values the app uses today, so nothing changes on
--  the day this runs.
-- ════════════════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS masters (
  id          TEXT PRIMARY KEY,
  list        TEXT NOT NULL,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort        INTEGER DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  locked      BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- One key per list. Two options with the same key would make the stored value
-- ambiguous, and the label is free to repeat.
CREATE UNIQUE INDEX IF NOT EXISTS masters_list_key_idx ON masters (list, key);
CREATE INDEX IF NOT EXISTS masters_list_idx ON masters (list);


-- ── Row-level security, matching every other table ──────────────────────
ALTER TABLE masters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS masters_signed_in ON masters;
CREATE POLICY masters_signed_in ON masters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── Seed, from the values in the code today ─────────────────────────────
INSERT INTO masters (id, list, key, label, sort, locked) VALUES
  -- Free lists: rename, reorder, add and retire at will.
  ('M-ls-1','lead_source','Exhibition','Exhibition',0,false),
  ('M-ls-2','lead_source','Reference','Reference',1,false),
  ('M-ls-3','lead_source','Website','Website',2,false),
  ('M-ls-4','lead_source','WhatsApp','WhatsApp',3,false),
  ('M-ls-5','lead_source','IndiaMart','IndiaMart',4,false),
  ('M-ls-6','lead_source','Cold Call','Cold Call',5,false),
  ('M-ls-7','lead_source','Instagram','Instagram',6,false),
  ('M-ls-8','lead_source','LinkedIn','LinkedIn',7,false),
  ('M-ls-9','lead_source','Trade Show','Trade Show',8,false),
  ('M-ls-10','lead_source','Walk-in','Walk-in',9,false),
  ('M-ls-11','lead_source','Other','Other',10,false),

  ('M-ct-1','complaint_type','Quality Issue','Quality Issue',0,false),
  ('M-ct-2','complaint_type','Wrong Product','Wrong Product',1,false),
  ('M-ct-3','complaint_type','Damaged Packaging','Damaged Packaging',2,false),
  ('M-ct-4','complaint_type','Short Expiry','Short Expiry',3,false),
  ('M-ct-5','complaint_type','Missing Item','Missing Item',4,false),
  ('M-ct-6','complaint_type','Billing Error','Billing Error',5,false),
  ('M-ct-7','complaint_type','Delivery Issue','Delivery Issue',6,false),
  ('M-ct-8','complaint_type','Other','Other',7,false),

  ('M-ec-1','expense_category','Travel','Travel',0,false),
  ('M-ec-2','expense_category','Food & Meals','Food & Meals',1,false),
  ('M-ec-3','expense_category','Accommodation','Accommodation',2,false),
  ('M-ec-4','expense_category','Client Entertainment','Client Entertainment',3,false),
  ('M-ec-5','expense_category','Fuel','Fuel',4,false),
  ('M-ec-6','expense_category','Miscellaneous','Miscellaneous',5,false),

  ('M-pc-1','product_category','Hair Care','Hair Care',0,false),
  ('M-pc-2','product_category','Skin Care','Skin Care',1,false),
  ('M-pc-3','product_category','Wellness','Wellness',2,false),
  ('M-pc-4','product_category','Personal Care','Personal Care',3,false),
  ('M-pc-5','product_category','Other','Other',4,false),

  ('M-uom-1','uom','BOX','BOX',0,false),
  ('M-uom-2','uom','BOTTLE','BOTTLE',1,false),
  ('M-uom-3','uom','TUBE','TUBE',2,false),
  ('M-uom-4','uom','STRIP','STRIP',3,false),
  ('M-uom-5','uom','PIECE','PIECE',4,false),
  ('M-uom-6','uom','KG','KG',5,false),

  ('M-wh-1','warehouse','Main Warehouse','Main Warehouse',0,false),
  ('M-wh-2','warehouse','Secondary Warehouse','Secondary Warehouse',1,false),
  ('M-wh-3','warehouse','Cold Storage','Cold Storage',2,false),

  ('M-ps-1','product_status','Active','Active',0,false),
  ('M-ps-2','product_status','Seasonal','Seasonal',1,false),
  ('M-ps-3','product_status','Coming Soon','Coming Soon',2,false),
  ('M-ps-4','product_status','Discontinued','Discontinued',3,false),

  ('M-st-1','scheme_type','Flat Discount','Flat Discount',0,false),
  ('M-st-2','scheme_type','Cash Discount','Cash Discount',1,false),
  ('M-st-3','scheme_type','Free Goods','Free Goods',2,false),
  ('M-st-4','scheme_type','Slab Discount','Slab Discount',3,false),
  ('M-st-5','scheme_type','Seasonal Offer','Seasonal Offer',4,false),
  ('M-st-6','scheme_type','Buy X Get Y','Buy X Get Y',5,false),

  -- Workflow lists: the code reads these keys. Labels may change, keys may not.
  ('M-lst-1','lead_status','Lead Created','Lead Created',0,true),
  ('M-lst-2','lead_status','Call','Call',1,true),
  ('M-lst-3','lead_status','Sample Sent','Sample Sent',2,true),
  ('M-lst-4','lead_status','Meeting','Meeting',3,true),
  ('M-lst-5','lead_status','Negotiation','Negotiation',4,true),
  ('M-lst-6','lead_status','Distributor Approved','Distributor Approved',5,true),
  ('M-lst-7','lead_status','First Order','First Order',6,true),
  ('M-lst-8','lead_status','Active','Active',7,true),
  ('M-lst-9','lead_status','Lost','Lost',8,true),

  ('M-ost-1','order_status','Pending','Pending',0,true),
  ('M-ost-2','order_status','Processing','Processing',1,true),
  ('M-ost-3','order_status','Ready for Dispatch','Ready for Dispatch',2,true),
  ('M-ost-4','order_status','Shipped','Shipped',3,true),
  ('M-ost-5','order_status','Delivered','Delivered',4,true),
  ('M-ost-6','order_status','Cancelled','Cancelled',5,true),

  ('M-pst-1','po_status','Draft','Draft',0,true),
  ('M-pst-2','po_status','Confirmed','Confirmed',1,true),
  ('M-pst-3','po_status','GRN Done','GRN Done',2,true),
  ('M-pst-4','po_status','Closed','Closed',3,true),
  ('M-pst-5','po_status','Cancelled','Cancelled',4,true),

  ('M-cst-1','complaint_status','Registered','Registered',0,true),
  ('M-cst-2','complaint_status','Under Review','Under Review',1,true),
  ('M-cst-3','complaint_status','Resolved','Resolved',2,true),
  ('M-cst-4','complaint_status','Closed','Closed',3,true)
ON CONFLICT (id) DO NOTHING;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT list, count(*) AS options, count(*) FILTER (WHERE locked) AS locked_keys
FROM   masters
GROUP  BY list
ORDER  BY list;
-- Expected: 12 lists, 73 options, 24 of them locked.

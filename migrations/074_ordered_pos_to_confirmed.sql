-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Phase 2 H8: the two purchase orders still in "Ordered".
--  Safe to run more than once (only rows still in "Ordered" change).
--
--  WHAT WAS WRONG
--
--  "Ordered" is the PO status the first seed data used (002) before
--  "Confirmed" existed. TEST-PO-1 and TEST-PO-PM kept it. Goods can be
--  received only against a Confirmed or Partially Received PO (051), so
--  nothing could ever be received against them; they also showed as Drafts
--  and were left out of "Pending GRN" (the screen now counts them).
--
--  WHAT THIS DOES
--
--  Renames the status of those two POs to "Confirmed". The purchase_orders
--  audit trigger records each change; app.via gives it the reason. Nothing
--  else changes: no stock, no vendor balance, no receipt.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('app.via',
  'migration 074 (Phase 2 H8): legacy status "Ordered" (seed data, 002) renamed to Confirmed so goods can be received — GRNs are accepted only on Confirmed / Partially Received POs (051)',
  true);

UPDATE public.purchase_orders
   SET status = 'Confirmed'
 WHERE id IN ('TEST-PO-1', 'TEST-PO-PM')
   AND status = 'Ordered';

INSERT INTO public.schema_migrations (filename, note)
VALUES ('074_ordered_pos_to_confirmed.sql',
        'TEST-PO-1 and TEST-PO-PM: status Ordered (seed-data name) -> Confirmed, audited with the reason')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

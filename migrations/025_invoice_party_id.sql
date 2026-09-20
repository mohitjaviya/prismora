-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — an invoice says which party it is for, instead of who it names.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS MISSING
--
--  invoices has no party column at all:
--
--      id, orderId, customerName, amount, tax, status, dueDate, assignedTo, createdAt
--
--  So an invoice is matched to a distributor, dealer or retailer by its order
--  where it has one, and by the spelling of customerName where it does not.
--  That is not a shortcut somebody took; it is the only link there has ever
--  been.
--
--  Two consequences, both real:
--
--    · A name matching parties at two tiers is ambiguous. settleInvoiceAsPayment
--      resolves it by searching distributor, then dealer, then retailer and
--      stopping -- a decision that was the order of a for loop until it was
--      given a test. With an id there is nothing to resolve.
--
--    · Renaming a partner detaches their invoices, silently, exactly as
--      renaming a territory used to detach its partners.
--
--  WHY NOW
--
--  invoices is empty. There is no backfill, no reconciling names typed three
--  different ways, and no cleaning job. Once there are a few hundred invoices
--  this stops being a fifteen-minute migration.
--
--  WALK-IN SALES STAY POSSIBLE
--
--  All three columns are nullable on purpose. A counter sale belongs to no
--  channel partner and must not be forced to claim one. customerName is not
--  removed and not deprecated -- it stops being the link and goes on being who
--  the invoice was for.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "dealerId"      TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "retailerId"    TEXT;


-- ── Backfill, in the same order the application resolves them ───────────
-- Through the order first, because that link is an id and cannot be ambiguous.
UPDATE public.invoices i
SET    "distributorId" = o."distributorId",
       "dealerId"      = o."dealerId",
       "retailerId"    = o."retailerId"
FROM   public.orders o
WHERE  i."orderId" = o.id
AND    i."distributorId" IS NULL AND i."dealerId" IS NULL AND i."retailerId" IS NULL;

-- Then by name, distributor before dealer before retailer, matching the
-- precedence settleInvoiceAsPayment already uses. A name matching nothing is
-- left null: that is a walk-in, or a typo, and inventing a party for it would
-- put somebody else's money on somebody's ledger.
UPDATE public.invoices i SET "distributorId" = d.id
FROM   public.distributors d
WHERE  i."distributorId" IS NULL AND i."dealerId" IS NULL AND i."retailerId" IS NULL
AND    lower(btrim(i."customerName")) = lower(btrim(d.name));

UPDATE public.invoices i SET "dealerId" = d.id
FROM   public.dealers d
WHERE  i."distributorId" IS NULL AND i."dealerId" IS NULL AND i."retailerId" IS NULL
AND    lower(btrim(i."customerName")) = lower(btrim(d.name));

UPDATE public.invoices i SET "retailerId" = r.id
FROM   public.retailers r
WHERE  i."distributorId" IS NULL AND i."dealerId" IS NULL AND i."retailerId" IS NULL
AND    lower(btrim(i."customerName")) = lower(btrim(r.name));


-- ── Keys and indexes ────────────────────────────────────────────────────
-- SET NULL, not RESTRICT: deleting a partner is already refused while they
-- hold invoices, by the check the Distributors screen now does before offering
-- the button. This is the database's own backstop, and an invoice outliving
-- the party it was raised against is a record worth keeping.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('distributorId', 'distributors'),
      ('dealerId',      'dealers'),
      ('retailerId',    'retailers')
    ) AS x(col, parent)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint k
      JOIN pg_class t ON t.oid = k.conrelid
      WHERE k.conname = 'fk_invoices_' || lower(c.col) AND t.relname = 'invoices'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.invoices ADD CONSTRAINT %I FOREIGN KEY (%I)
           REFERENCES public.%I(id) ON DELETE SET NULL',
        'fk_invoices_' || lower(c.col), c.col, c.parent);
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.invoices(%I)',
                   'idx_invoices_' || lower(c.col), c.col);
  END LOOP;
END $$;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT count(*)                                                        AS invoices,
       count(*) FILTER (WHERE "distributorId" IS NOT NULL)             AS to_distributors,
       count(*) FILTER (WHERE "dealerId"      IS NOT NULL)             AS to_dealers,
       count(*) FILTER (WHERE "retailerId"    IS NOT NULL)             AS to_retailers,
       count(*) FILTER (WHERE "distributorId" IS NULL
                          AND "dealerId"      IS NULL
                          AND "retailerId"    IS NULL)                 AS unlinked
FROM   public.invoices;
-- `unlinked` is walk-in sales plus any customerName that matches no partner.
-- On this database everything is 0, because the table is empty. Anywhere else,
-- list them and check none is a partner whose name was typed differently:
--
--   SELECT id, "customerName" FROM invoices
--   WHERE "distributorId" IS NULL AND "dealerId" IS NULL AND "retailerId" IS NULL;


CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('025_invoice_party_id.sql',
        'distributorId/dealerId/retailerId + FKs on invoices; customerName kept as who it was for, not as the link')
ON CONFLICT (filename) DO NOTHING;

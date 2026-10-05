-- Migration 094: Gap 9 Input Validation
-- Database-side copy of the screen rules (utils/formRules.js). All NOT VALID:
-- existing rows are not checked, only new and edited ones.
-- Corrected 2026-10-05 before first apply: company_settings has no phone
-- column; stock may reach 0 (sold out / written off), so quantity >= 0;
-- phone allows spaces like the screen; schema_migrations uses (filename, note).

BEGIN;

-- 1. Phone: Indian mobile, optional +91/91/0, spaces allowed (screen saves 10 digits).
ALTER TABLE public.leads ADD CONSTRAINT leads_phone_format CHECK (
  phone IS NULL OR btrim(phone) = ''
  OR regexp_replace(phone, '\s', '', 'g') ~ '^(\+91|91|0)?[6-9][0-9]{9}$'
) NOT VALID;

-- 2. Email: one @, something either side, a dot in the domain.
ALTER TABLE public.leads ADD CONSTRAINT leads_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR btrim(email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
) NOT VALID;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR btrim(email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
) NOT VALID;
ALTER TABLE public.dealers ADD CONSTRAINT dealers_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR btrim(email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
) NOT VALID;
ALTER TABLE public.retailers ADD CONSTRAINT retailers_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR btrim(email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
) NOT VALID;
ALTER TABLE public.distributors ADD CONSTRAINT distributors_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR btrim(email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
) NOT VALID;

-- 3. Quantities never negative (0 is a sold-out batch / multi-line order).
ALTER TABLE public.inventory ADD CONSTRAINT inventory_quantity_not_negative CHECK (
  quantity IS NULL OR quantity >= 0
) NOT VALID;
ALTER TABLE public.orders ADD CONSTRAINT orders_quantity_not_negative CHECK (
  quantity IS NULL OR quantity >= 0
) NOT VALID;

-- 4. Amounts never negative.
ALTER TABLE public.orders ADD CONSTRAINT orders_value_not_negative CHECK (
  value IS NULL OR value >= 0
) NOT VALID;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_amount_not_negative CHECK (
  total IS NULL OR total >= 0
) NOT VALID;
-- Expenses, payments, credit notes, purchase returns: already in 075.

INSERT INTO public.schema_migrations (filename, note)
VALUES ('094_input_validation.sql',
        'Gap 9: phone/email format on leads and partners, non-negative stock, order and PO amounts (NOT VALID)');

COMMIT;

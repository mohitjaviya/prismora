-- Migration 094: Gap 9 Input Validation
-- Adds constraints to ensure data integrity without failing on existing bad rows (NOT VALID).

-- 1. Phone validation (Indian mobile format: 10 digits starting with 6-9, optional +91/0)
-- Already done for partners, vendors, sign-up. Adding to leads and company_settings.
ALTER TABLE public.leads ADD CONSTRAINT leads_phone_format CHECK (
  phone IS NULL OR btrim(phone) = '' OR phone ~ '^(\+91|91|0)?[6-9][0-9]{9}$'
) NOT VALID;

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_phone_format CHECK (
  phone IS NULL OR btrim(phone) = '' OR phone ~ '^(\+91|91|0)?[6-9][0-9]{9}$'
) NOT VALID;

-- 2. Email validation (valid format)
ALTER TABLE public.leads ADD CONSTRAINT leads_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR email ~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
) NOT VALID;

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR email ~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
) NOT VALID;

ALTER TABLE public.dealers ADD CONSTRAINT dealers_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR email ~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
) NOT VALID;

ALTER TABLE public.retailers ADD CONSTRAINT retailers_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR email ~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
) NOT VALID;

ALTER TABLE public.distributors ADD CONSTRAINT distributors_email_format CHECK (
  email IS NULL OR btrim(email) = '' OR email ~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
) NOT VALID;

-- 3. Quantity: must be greater than 0
ALTER TABLE public.inventory ADD CONSTRAINT inventory_quantity_positive CHECK (
  quantity > 0
) NOT VALID;

ALTER TABLE public.orders ADD CONSTRAINT orders_quantity_positive CHECK (
  quantity IS NULL OR quantity > 0
) NOT VALID;

-- 4. Amounts and prices cannot be negative
ALTER TABLE public.orders ADD CONSTRAINT orders_value_not_negative CHECK (
  value IS NULL OR value >= 0
) NOT VALID;

ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_amount_not_negative CHECK (
  total IS NULL OR total >= 0
) NOT VALID;

-- Expenses, payments, credit_notes, purchase_returns amounts were already handled in 075

-- Required fields check (no empty spaces) - this is general and depends on existing schema,
-- but we enforce the specific rules requested.

-- Insert 094 to schema migrations
INSERT INTO public.schema_migrations (version) VALUES ('094');

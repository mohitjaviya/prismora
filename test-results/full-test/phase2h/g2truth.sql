with t as (select *, amount+tax tot, least(coalesce("amountPaid",0), amount+tax) paid from invoices where "invoiceType"<>'auto_draft'),
cn as (select c.* from credit_notes c left join invoices i on i.id=c."invoiceId" where coalesce(i."invoiceType",'')<>'auto_draft'),
g as (select coalesce(sum((it->>'quantity')::numeric*(it->>'unitCost')::numeric),0) v from grn, jsonb_array_elements(items) it),
p as (select 'D' k,"outstandingAmount" o from distributors union all select 'L',"outstandingAmount" from dealers union all select 'R',"outstandingAmount" from retailers),
o as (select *, tot-paid due from t where status not in ('Settled','Paid'))
select 'invoiced_paid_exgst' k, round(sum(case when tot>0 then amount*paid/tot else 0 end),2) v from t
union all select 'gst_collected', round(sum(case when tot>0 then tax*paid/tot else 0 end),2) from t
union all select 'credit_notes_sales', sum(amount) from cn
union all select 'expenses', sum(amount) from expenses
union all select 'purchase_cost', (select v from g) - (select coalesce(sum(value),0) from purchase_returns)
union all select 'receivable_due', sum(due) from o
union all select 'receivable_count', count(*) from o
union all select 'overdue_due', coalesce(sum(due) filter (where "dueDate" < now()),0) from o
union all select 'age_0_30', coalesce(sum(due) filter (where now()-"createdAt" <= interval '31 days'),0) from o
union all select 'partners_owed', sum(o) filter (where o>0) from p
union all select 'partners_owing_count', count(*) filter (where o>0) from p
union all select 'credit_held', -sum(o) filter (where o<0) from p
union all select 'credit_count', count(*) filter (where o<0) from p
union all select 'proforma_value', sum(amount+tax) from invoices where "invoiceType"='auto_draft'
union all select 'proforma_received', sum(least(coalesce("amountPaid",0),amount+tax)) from invoices where "invoiceType"='auto_draft'
union all select 'proforma_count', count(*) from invoices where "invoiceType"='auto_draft';

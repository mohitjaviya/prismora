select "invoiceType", "supplyType", "placeOfSupply", count(*) n, sum(tax) tax, sum(cgst) cgst, sum(sgst) sgst, sum(igst) igst, sum(case when abs(coalesce(cgst,0)+coalesce(sgst,0)+coalesce(igst,0)-tax)>0.5 then 1 else 0 end) split_mismatch from invoices group by 1,2,3 order by 1,2,3;
select 'inv_no_order' k, count(*) from invoices where "orderId" is null
union all select 'inv_order_cancelled', count(*) from invoices i join orders o on o.id=i."orderId" where o.status='Cancelled'
union all select 'inv_amt_vs_order_value_diff', count(*) from invoices i join orders o on o.id=i."orderId" where i."invoiceType"='tax_invoice' and abs(i.amount-o.value)>0.5
union all select 'orders_value_vs_items_diff', count(*) from orders where jsonb_typeof(items)='array' and jsonb_array_length(items)>0 and abs(value-(select coalesce(sum((x->>'total')::numeric),0) from jsonb_array_elements(items) x))>0.5
union all select 'leads', count(*) from leads
union all select 'credit_notes_sum', coalesce(sum(amount),0) from credit_notes;

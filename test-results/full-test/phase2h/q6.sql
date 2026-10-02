select 'grn_value' k, sum((it->>'quantity')::numeric*(it->>'unitCost')::numeric) v from grn g, jsonb_array_elements(g.items) it
union all select 'purchase_returns', sum(value) from purchase_returns
union all select 'vendor_payables', sum("outstandingAmount") from vendors;

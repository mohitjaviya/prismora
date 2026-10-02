select 'orders' k, status, count(*) n, coalesce(sum(value),0) v from orders group by status
union all select 'invoices', status, count(*), coalesce(sum(amount+tax),0) from invoices group by status
union all select 'inv_paid', 'sum amountPaid', count(*), coalesce(sum("amountPaid"),0) from invoices
union all select 'inv_tax', 'sum tax', count(*), coalesce(sum(tax),0) from invoices
union all select 'distributors', 'outstanding', count(*), coalesce(sum("outstandingAmount"),0) from distributors
union all select 'inventory', 'qty', count(*), coalesce(sum(quantity),0) from inventory
union all select 'expenses', 'amount', count(*), coalesce(sum(amount),0) from expenses
order by 1,2;

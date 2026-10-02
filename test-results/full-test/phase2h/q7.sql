select 'incentives' k, status || ' / ' || "incentiveType" s, count(*) n, sum("incentiveValue") v from distributor_incentives group by 1,2
union all select 'claims', status, count(*), sum(amount) from scheme_claims group by 1,2
union all select 'po', status, count(*), sum(total) from purchase_orders group by 1,2
union all select 'po_thismonth_committed', 'Oct 2026', count(*), sum(total) from purchase_orders where status not in ('Draft','Cancelled') and date_trunc('month', "createdAt" at time zone 'Asia/Kolkata') = date '2026-10-01'
union all select 'vendors', 'count', count(*), sum("outstandingAmount") from vendors
order by 1,2;

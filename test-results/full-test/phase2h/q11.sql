select p.k, p.id, p.out, p."creditLimit",
 (select count(*) from orders o where (case p.k when 'D' then o."distributorId" when 'L' then o."dealerId" else o."retailerId" end)=p.id and date_trunc('month', coalesce(o.date,o."createdAt") at time zone 'Asia/Kolkata')=date '2026-10-01') oct_orders,
 (select coalesce(sum(value),0) from orders o where (case p.k when 'D' then o."distributorId" when 'L' then o."dealerId" else o."retailerId" end)=p.id and date_trunc('month', coalesce(o.date,o."createdAt") at time zone 'Asia/Kolkata')=date '2026-10-01') oct_value,
 (select coalesce(sum("incentiveValue"),0) from distributor_incentives i where (case p.k when 'D' then i."distributorId" when 'L' then i."dealerId" else i."retailerId" end)=p.id and i.status='Earned' and i."incentiveType"<>'Free Goods') earned
from (select 'D' k,id,"outstandingAmount" out,"creditLimit" from distributors union all select 'L',id,"outstandingAmount","creditLimit" from dealers union all select 'R',id,"outstandingAmount","creditLimit" from retailers) p
where p.id in ('D-TEST-1','D-TEST-2','DL-TEST-1','R-TEST-1') or p.id in (select id from distributors where name like 'TEST P2E%');

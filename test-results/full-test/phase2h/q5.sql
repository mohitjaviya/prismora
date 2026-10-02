select p.k, p.id, p.name, p.out,
  coalesce((select sum(i.amount+i.tax-coalesce(i."amountPaid",0)) from invoices i where i.status<>'Settled' and i.status<>'Paid' and (case p.k when 'D' then i."distributorId" when 'L' then i."dealerId" else i."retailerId" end)=p.id),0) as open_due,
  coalesce((select sum(c.amount) from credit_notes c where (case p.k when 'D' then c."distributorId" when 'L' then c."dealerId" else c."retailerId" end)=p.id),0) as credit_notes
from (select 'D' k,id,name,"outstandingAmount" out from distributors union all select 'L',id,name,"outstandingAmount" from dealers union all select 'R',id,name,"outstandingAmount" from retailers) p
where p.out<>0 or exists (select 1 from invoices i where (case p.k when 'D' then i."distributorId" when 'L' then i."dealerId" else i."retailerId" end)=p.id)
order by p.out;

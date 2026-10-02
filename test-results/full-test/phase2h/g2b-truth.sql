with c as (select c.amount, i.amount ia, i.tax it, i."invoiceType" ty from credit_notes c left join invoices i on i.id=c."invoiceId")
select round(sum(case when ty is null then amount when ia+it>0 then amount*ia/(ia+it) else amount end) filter (where coalesce(ty,'')<>'auto_draft'),2) cn_exgst,
       round(sum(amount) filter (where coalesce(ty,'')<>'auto_draft'),2) cn_gross,
       count(*) filter (where ty is null) unlinked
from c;

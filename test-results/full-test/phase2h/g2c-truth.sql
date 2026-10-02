with t as (select amount, tax, amount+tax tot, least(coalesce("amountPaid",0), amount+tax) paid from invoices where "invoiceType"<>'auto_draft'),
c as (select c.amount, i.amount ia, i.tax it, i."invoiceType" ty from credit_notes c left join invoices i on i.id=c."invoiceId" where coalesce(i."invoiceType",'')<>'auto_draft')
select round((select sum(case when tot>0 then tax*paid/tot else 0 end) from t),2) gst_paid,
       round((select sum(case when ty is not null and ia+it>0 then amount*it/(ia+it) else 0 end) from c),2) cn_gst,
       round((select sum(case when tot>0 then tax*paid/tot else 0 end) from t) - (select sum(case when ty is not null and ia+it>0 then amount*it/(ia+it) else 0 end) from c),2) gst_to_remit;

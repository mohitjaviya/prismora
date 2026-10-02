select "invoiceType", status, count(*) n, sum(amount) amt, sum(tax) tax, sum("amountPaid") paid from invoices group by 1,2 order by 1,2;

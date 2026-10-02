select u.email like 'test.sales.exec.1%' se1, u.name, u.role,
 (select count(*) from leads l where l."assignedTo"=u.id) leads,
 (select count(*) from leads l where l."assignedTo"=u.id and l.status in ('Converted','First Order','Active')) conv,
 (select coalesce(sum("dealValue"),0) from leads l where l."assignedTo"=u.id and l.status not in ('Converted','First Order','Active','Lost')) pipeline,
 (select coalesce(sum(value),0) from orders o where o."assignedTo"=u.id and o.status<>'Cancelled') revenue,
 (select coalesce(sum(value),0) from orders o where o."assignedTo"=u.id and o.status<>'Cancelled' and date_trunc('month', o.date at time zone 'Asia/Kolkata')=date '2026-10-01') oct_rev
from users u where u.name in ('TEST Sales Executive 1','TEST Sales Manager');

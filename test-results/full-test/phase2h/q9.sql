select u.name,
 (select count(*) from leads l where l."assignedTo"=u.id) leads,
 (select coalesce(sum("dealValue"),0) from leads l where l."assignedTo"=u.id and l.status not in ('Converted','First Order','Active','Lost')) pipeline,
 (select coalesce(sum(value),0) from orders o where o."assignedTo"=u.id and o.status<>'Cancelled') revenue
from users u where u.name in ('TEST Sales Executive 2','TEST Sales Manager');

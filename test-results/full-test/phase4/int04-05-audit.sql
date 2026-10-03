-- P4-INT-04/05 sweep over every audited table (read-only; ends in RAISE).
--  created_missing : rows created after audit began (2026-09-25 13:52) with no 'created' audit row
--  last_by_mismatch: "updatedBy" on the row <> actor_id of its latest audit row (INT-05)
--  sys_rows        : audit rows with no actor ("System"); sys_untagged = those with no via tag either
DO $a$
DECLARE t text; has_created bool; has_upd bool; r text := ''; cm int; cm_ids text; lm int; lm_ids text; tot int; sysn int; sysu int;
  start timestamptz := (SELECT min(at) FROM audit_log);
BEGIN
  FOR t IN SELECT DISTINCT event_object_table FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name='audit_row' ORDER BY 1 LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='createdAt') INTO has_created;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='updatedBy') INTO has_upd;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO tot;
    cm := NULL; cm_ids := NULL; lm := NULL; lm_ids := NULL;
    IF has_created THEN
      EXECUTE format($q$SELECT count(*), string_agg(x.id::text, ',' ORDER BY x."createdAt") FROM public.%I x
                       WHERE x."createdAt" > %L AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.table_name=%L AND a.row_id=x.id::text AND a.action='created')$q$, t, start, t)
        INTO cm, cm_ids;
    END IF;
    IF has_upd THEN
      EXECUTE format($q$SELECT count(*), string_agg(x.id::text||'('||coalesce(x."updatedBy",'∅')||'≠'||coalesce(l.actor_id,'∅')||')', ',') FROM public.%I x
                       JOIN LATERAL (SELECT a.actor_id FROM audit_log a WHERE a.table_name=%L AND a.row_id=x.id::text ORDER BY a.at DESC, a.id DESC LIMIT 1) l ON true
                       WHERE x."updatedBy" IS DISTINCT FROM l.actor_id$q$, t, t)
        INTO lm, lm_ids;
    END IF;
    SELECT count(*) FILTER (WHERE actor_id IS NULL), count(*) FILTER (WHERE actor_id IS NULL AND via IS NULL) INTO sysn, sysu FROM audit_log WHERE table_name=t;
    r := r || format(E'\n%s | rows %s | created_missing %s %s | last_by_mismatch %s %s | sys_rows %s | sys_untagged %s',
                     t, tot, coalesce(cm::text,'n/a'), left(coalesce(cm_ids,''),200), coalesce(lm::text,'n/a'), left(coalesce(lm_ids,''),300), sysn, sysu);
  END LOOP;
  RAISE EXCEPTION E'P4REPORT%', r;
END $a$;

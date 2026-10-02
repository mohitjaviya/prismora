DO $$ DECLARE rep text := ''; n int; c int; BEGIN
  INSERT INTO roles (id,name,level,description,permissions,sort,active,"isSystem") SELECT 'TEST V72 R','TEST V72 R','staff','t',jsonb_set(permissions,'{settings}','"full"'),999,true,false FROM roles WHERE id='Customer Support';
  INSERT INTO users (id,name,email,role,status,"managedUsers") VALUES ('UV72LR','TEST V72 lockout','v72.lockout@example.test','TEST V72 R','Active','{}');
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Super Admin'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A1 Admin: user -> Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A1 Admin: user -> Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Admin'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A2 Admin: user -> Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A2 Admin: user -> Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Director'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A3 Admin: user -> Director [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A3 Admin: user -> Director [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Super Admin'' WHERE id=''U-TEST-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A4 Admin promotes self to Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A4 Admin promotes self to Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET status=''Inactive'' WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A5 Admin deactivates a Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A5 Admin deactivates a Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=''hijack@example.test'' WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A6 Admin re-emails a Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A6 Admin re-emails a Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET name=''x'' WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A7 Admin renames a Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A7 Admin renames a Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM users WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A8 Admin deletes a Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A8 Admin deletes a Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'INSERT INTO users (id,name,email,role,status,"managedUsers") VALUES (''UV72X'',''TEST V72 x'',''v72.x@example.test'',''Super Admin'',''Active'',''{}'')'; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A9 Admin inserts a Super Admin profile [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A9 Admin inserts a Super Admin profile [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET permissions = jsonb_set(permissions,''{settings}'',''"none"'') WHERE id=''Super Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A10 Admin edits the Super Admin role [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A10 Admin edits the Super Admin role [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM roles WHERE id=''Super Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A11 Admin deletes the Super Admin role [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A11 Admin deletes the Super Admin role [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM users WHERE id=''U-TEST-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A12 Admin deletes own account [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A12 Admin deletes own account [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET permissions = jsonb_set(permissions,''{settings}'',''"none"'') WHERE id=''Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A13 Admin removes Settings from own role (Admin) [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A13 Admin removes Settings from own role (Admin) [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET active=false WHERE id=''Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A14 Admin switches own role off [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A14 Admin switches own role off [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM roles WHERE id=''Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A15 Admin deletes own role [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A15 Admin deletes own role [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Sales Executive'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B1 Admin edits an ordinary user (role) [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B1 Admin edits an ordinary user (role) [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET status=''Inactive'' WHERE id=''U-TEST-DISPATCH'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B2 Admin deactivates an ordinary user [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B2 Admin deactivates an ordinary user [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET description=''x'' WHERE id=''Customer Support'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B3 Admin edits another role (Customer Support description) [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B3 Admin edits another role (Customer Support description) [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM users WHERE id=''U-TEST-RETAILER-2'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B4 Admin deletes an ordinary user (U-TEST-RETAILER-2) [want ok] => DONE rows=' || n;
    EXECUTE 'RESET ROLE'; EXECUTE 'SELECT count(*) FROM auth.users WHERE email=''test.retailer.2@prismora.test''' INTO c; rep := rep || ' (login rows left in auth.users: ' || c || ')';
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B4 Admin deletes an ordinary user (U-TEST-RETAILER-2) [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Director'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S1 Super Admin gives Director [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S1 Super Admin gives Director [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Accounts'' WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S2 Super Admin demotes the LAST Super Admin (self) [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S2 Super Admin demotes the LAST Super Admin (self) [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET status=''Inactive'' WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S3 Super Admin deactivates self [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S3 Super Admin deactivates self [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM users WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S4 Super Admin deletes self / last Super Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S4 Super Admin deletes self / last Super Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM roles WHERE id=''Super Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S5 Super Admin deletes the Super Admin role [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S5 Super Admin deletes the Super Admin role [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET active=false WHERE id=''Super Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S6 Super Admin switches the Super Admin role off [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S6 Super Admin switches the Super Admin role off [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET description=description WHERE id=''Super Admin'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S7 Super Admin edits Super Admin role description [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S7 Super Admin edits Super Admin role description [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.director@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Super Admin'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'D1 Director: user -> Super Admin [want refused-or-0rows] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'D1 Director: user -> Super Admin [want refused-or-0rows] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.sales.exec.1@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Admin'' WHERE id=''U-TEST-SALES-EXEC-1'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'E1 Sales Executive: own role -> Admin [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'E1 Sales Executive: own role -> Admin [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"v72.lockout@example.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET permissions = jsonb_set(permissions,''{settings}'',''"none"'') WHERE id=''TEST V72 R'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'L1 settings-full role removes its own Settings [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'L1 settings-full role removes its own Settings [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"v72.lockout@example.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET active=false WHERE id=''TEST V72 R'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'L2 ...switches itself off [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'L2 ...switches itself off [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"v72.lockout@example.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'DELETE FROM roles WHERE id=''TEST V72 R'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'L3 ...deletes itself [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'L3 ...deletes itself [want refused] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"v72.lockout@example.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET description=''ok'' WHERE id=''TEST V72 R'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'L4 ...edits its description [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'L4 ...edits its description [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE roles SET permissions = jsonb_set(permissions,''{settings}'',''"none"'') WHERE id=''TEST V72 R'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'L5 Admin removes Settings from that other role [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'L5 Admin removes Settings from that other role [want ok] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;
  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;
END $$;

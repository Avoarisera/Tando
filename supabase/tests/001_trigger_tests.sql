-- Trigger tests: update_leave_balance
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/tests/001_trigger_tests.sql
--
-- All test data is created and rolled back inside a single transaction.
-- RAISE NOTICE (PASS) and RAISE WARNING (FAIL) are visible even after ROLLBACK.

\set ON_ERROR_STOP off

BEGIN;

-- ============================================================
-- Test fixtures
-- ============================================================
-- Use reserved UUIDs that will never collide with seed data
DO $$
BEGIN
  -- Auth user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES (
    'ffffffff-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'trigger-test@waka-test.invalid', '',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.teams (id, name)
  VALUES ('ffffffff-1111-0000-0000-000000000001', 'Test Team')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.leave_types (id, name, color, is_active)
  VALUES ('ffffffff-2222-0000-0000-000000000001', 'Test Congé', '#FF0000', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, first_name, last_name, role, team_id, joined_at)
  VALUES (
    'ffffffff-0000-0000-0000-000000000001',
    'Test', 'User', 'employee',
    'ffffffff-1111-0000-0000-000000000001',
    '2026-01-01'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
  VALUES (
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    2026, 25, 0
  ) ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET used_days = 0;
END;
$$;

-- ============================================================
-- DB-T-001: pending → approved increments used_days
-- ============================================================
DO $$
DECLARE
  v_req_id uuid;
  v_used   int;
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000001',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-07-01', '2026-07-05', 5, 'pending'
  );

  UPDATE public.leave_requests
  SET status = 'approved'
  WHERE id = 'ffffffff-aaaa-0000-0000-000000000001';

  SELECT used_days INTO v_used
  FROM public.leave_balances
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  ASSERT v_used = 5, format('Expected used_days=5, got %s', v_used);
  RAISE NOTICE 'PASS  DB-T-001: pending → approved increments used_days (+5)';

  -- reset for next tests
  UPDATE public.leave_balances
  SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000001';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-001: pending → approved — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000001';
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- DB-T-002: manager_approved → approved increments used_days
-- ============================================================
DO $$
DECLARE
  v_used int;
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000002',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-08-01', '2026-08-03', 3, 'manager_approved'
  );

  UPDATE public.leave_requests
  SET status = 'approved'
  WHERE id = 'ffffffff-aaaa-0000-0000-000000000002';

  SELECT used_days INTO v_used
  FROM public.leave_balances
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  ASSERT v_used = 3, format('Expected used_days=3, got %s', v_used);
  RAISE NOTICE 'PASS  DB-T-002: manager_approved → approved increments used_days (+3)';

  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000002';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-002: manager_approved → approved — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000002';
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- DB-T-003: approved → rejected decrements used_days
-- ============================================================
DO $$
DECLARE
  v_used int;
BEGIN
  -- Start with used_days=5 (simulate a previously approved request)
  UPDATE public.leave_balances SET used_days = 5
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000003',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-09-01', '2026-09-05', 5, 'approved'
  );

  -- Trigger already fired on INSERT with status=approved → used_days=10
  -- Now revert to rejected
  UPDATE public.leave_requests
  SET status = 'rejected'
  WHERE id = 'ffffffff-aaaa-0000-0000-000000000003';

  SELECT used_days INTO v_used
  FROM public.leave_balances
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  -- 5 (initial) + 5 (INSERT approved trigger) - 5 (rejected trigger) = 5
  ASSERT v_used = 5, format('Expected used_days=5 after rejection, got %s', v_used);
  RAISE NOTICE 'PASS  DB-T-003: approved → rejected decrements used_days';

  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000003';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-003: approved → rejected — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000003';
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- DB-T-004: pending → manager_approved does NOT change used_days
-- ============================================================
DO $$
DECLARE
  v_used int;
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000004',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-10-01', '2026-10-02', 2, 'pending'
  );

  UPDATE public.leave_requests
  SET status = 'manager_approved'
  WHERE id = 'ffffffff-aaaa-0000-0000-000000000004';

  SELECT used_days INTO v_used
  FROM public.leave_balances
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  ASSERT v_used = 0, format('Expected used_days=0 (unchanged), got %s', v_used);
  RAISE NOTICE 'PASS  DB-T-004: pending → manager_approved does not change used_days';

  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000004';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-004: pending → manager_approved — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000004';
END;
$$;

-- ============================================================
-- DB-T-005: pending → rejected does NOT change used_days
-- ============================================================
DO $$
DECLARE
  v_used int;
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000005',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-10-05', '2026-10-06', 2, 'pending'
  );

  UPDATE public.leave_requests
  SET status = 'rejected'
  WHERE id = 'ffffffff-aaaa-0000-0000-000000000005';

  SELECT used_days INTO v_used
  FROM public.leave_balances
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  ASSERT v_used = 0, format('Expected used_days=0 (unchanged), got %s', v_used);
  RAISE NOTICE 'PASS  DB-T-005: pending → rejected does not change used_days';

  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000005';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-005: pending → rejected — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000005';
END;
$$;

-- ============================================================
-- DB-T-006: GREATEST(0) guard — decrement never goes below 0
-- ============================================================
DO $$
DECLARE
  v_used int;
BEGIN
  -- Balance starts at 0; insert an approved request (increments to 5)
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000006',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-11-01', '2026-11-05', 5, 'approved'
  );

  -- Force used_days back to 0 (simulates balance already decremented externally)
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  -- Now reject: trigger tries to decrement 0 by 5
  UPDATE public.leave_requests
  SET status = 'rejected'
  WHERE id = 'ffffffff-aaaa-0000-0000-000000000006';

  SELECT used_days INTO v_used
  FROM public.leave_balances
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;

  ASSERT v_used = 0, format('Expected used_days=0 (GREATEST guard), got %s', v_used);
  RAISE NOTICE 'PASS  DB-T-006: GREATEST(0) guard prevents negative used_days';

  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000006';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-006: GREATEST(0) guard — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000006';
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'ffffffff-0000-0000-0000-000000000001'
    AND leave_type_id = 'ffffffff-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- DB-T-007: Missing leave_balance raises French exception
-- ============================================================
DO $$
BEGIN
  -- Insert with a year that has no balance row
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000007',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2025-06-01', '2025-06-03', 3, 'approved'  -- year 2025 has no balance
  );
  -- Should not reach here
  RAISE WARNING 'FAIL  DB-T-007: Expected exception for missing balance, but insert succeeded';
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000007';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Aucun solde trouvé%' THEN
    RAISE NOTICE 'PASS  DB-T-007: Missing leave_balance raises French exception';
  ELSE
    RAISE WARNING 'FAIL  DB-T-007: Wrong exception message: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000007';
END;
$$;

-- ============================================================
-- DB-T-008: Constraint — end_date < start_date rejected
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000008',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-07-10', '2026-07-05', 1, 'pending'  -- end before start
  );
  RAISE WARNING 'FAIL  DB-T-008: Expected CHECK constraint violation for end_date < start_date';
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000008';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS  DB-T-008: CHECK constraint rejects end_date < start_date';
WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-008: Unexpected error: %', SQLERRM;
END;
$$;

-- ============================================================
-- DB-T-009: Constraint — days_count < 1 rejected
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000009',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-07-01', '2026-07-01', 0, 'pending'
  );
  RAISE WARNING 'FAIL  DB-T-009: Expected CHECK constraint for days_count < 1';
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000009';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS  DB-T-009: CHECK constraint rejects days_count < 1';
WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-009: Unexpected error: %', SQLERRM;
END;
$$;

-- ============================================================
-- DB-T-010: Constraint — comment over 500 chars rejected
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status, comment
  ) VALUES (
    'ffffffff-aaaa-0000-0000-000000000010',
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    '2026-07-01', '2026-07-01', 1, 'pending',
    repeat('x', 501)
  );
  RAISE WARNING 'FAIL  DB-T-010: Expected CHECK constraint for comment > 500 chars';
  DELETE FROM public.leave_requests WHERE id = 'ffffffff-aaaa-0000-0000-000000000010';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS  DB-T-010: CHECK constraint rejects comment > 500 chars';
WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-010: Unexpected error: %', SQLERRM;
END;
$$;

-- ============================================================
-- DB-T-011: Constraint — invalid color format rejected
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.leave_types (id, name, color, is_active)
  VALUES ('ffffffff-3333-0000-0000-000000000001', 'Bad Color', 'red', true);
  RAISE WARNING 'FAIL  DB-T-011: Expected CHECK constraint for invalid color';
  DELETE FROM public.leave_types WHERE id = 'ffffffff-3333-0000-0000-000000000001';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS  DB-T-011: CHECK constraint rejects invalid color format';
WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-011: Unexpected error: %', SQLERRM;
END;
$$;

-- ============================================================
-- DB-T-012: Constraint — invalid role rejected
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, role, joined_at)
  VALUES ('ffffffff-0000-0000-0000-000000000002', 'Bad', 'Role', 'superuser', '2026-01-01');
  RAISE WARNING 'FAIL  DB-T-012: Expected CHECK constraint for invalid role';
  DELETE FROM public.profiles WHERE id = 'ffffffff-0000-0000-0000-000000000002';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS  DB-T-012: CHECK constraint rejects invalid role';
WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-012: Unexpected error: %', SQLERRM;
END;
$$;

-- ============================================================
-- DB-T-013: Unique constraint on leave_balances
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
  VALUES (
    'ffffffff-0000-0000-0000-000000000001',
    'ffffffff-2222-0000-0000-000000000001',
    2026, 30, 0
  );
  RAISE WARNING 'FAIL  DB-T-013: Expected UNIQUE constraint violation on leave_balances';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS  DB-T-013: UNIQUE constraint enforced on (user_id, leave_type_id, year)';
WHEN OTHERS THEN
  RAISE WARNING 'FAIL  DB-T-013: Unexpected error: %', SQLERRM;
END;
$$;

-- ============================================================
-- Cleanup — rollback all test data
-- ============================================================
ROLLBACK;

\echo ''
\echo 'Trigger tests complete. Check PASS/FAIL lines above.'
\echo 'NOTICE = PASS, WARNING = FAIL'

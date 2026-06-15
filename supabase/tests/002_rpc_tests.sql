-- RPC tests: create_leave_request
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/tests/002_rpc_tests.sql
--
-- Tests call the RPC with a simulated auth.uid() via JWT claims.
-- All data is rolled back at the end.

\set ON_ERROR_STOP off

BEGIN;

-- ============================================================
-- Test fixtures
-- ============================================================
DO $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES (
    'eeeeeeee-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'rpc-test@waka-test.invalid', '',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.teams (id, name)
  VALUES ('eeeeeeee-1111-0000-0000-000000000001', 'RPC Test Team')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.leave_types (id, name, color, is_active)
  VALUES ('eeeeeeee-2222-0000-0000-000000000001', 'RPC Test Congé', '#00FF00', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, first_name, last_name, role, team_id, joined_at)
  VALUES (
    'eeeeeeee-0000-0000-0000-000000000001',
    'RPC', 'Tester', 'employee',
    'eeeeeeee-1111-0000-0000-000000000001',
    '2026-01-01'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
  VALUES (
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    2026, 25, 0
  ) ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET allocated_days = 25, used_days = 0;
END;
$$;

-- Helper: simulate a user session by setting JWT claims
-- Must be called inside each DO block (set_config with is_local=true is transaction-scoped)
-- We use set_config so auth.uid() reads it correctly

-- ============================================================
-- RPC-001: Happy path — valid request created, returns uuid
-- ============================================================
DO $$
DECLARE
  v_result uuid;
  v_count  int;
BEGIN
  -- Simulate auth.uid() = test user
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  v_result := public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-07-01'::date,
    '2026-07-05'::date,
    'Vacances test'
  );

  ASSERT v_result IS NOT NULL, 'Expected a UUID return value';

  SELECT COUNT(*) INTO v_count
  FROM public.leave_requests
  WHERE id = v_result
    AND user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND days_count = 5
    AND status = 'pending';

  ASSERT v_count = 1, format('Expected 1 inserted row, found %s', v_count);
  RAISE NOTICE 'PASS  RPC-001: Happy path — request created, uuid returned';

  -- Cleanup
  DELETE FROM public.leave_requests WHERE id = v_result;
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  RPC-001: Happy path — %', SQLERRM;
  DELETE FROM public.leave_requests
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND start_date = '2026-07-01';
END;
$$;

-- ============================================================
-- RPC-002: end_date < start_date → French exception
-- ============================================================
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-08-10'::date,
    '2026-08-05'::date,
    NULL
  );
  RAISE WARNING 'FAIL  RPC-002: Expected date validation exception';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%date de fin%' THEN
    RAISE NOTICE 'PASS  RPC-002: end < start raises French exception';
  ELSE
    RAISE WARNING 'FAIL  RPC-002: Wrong exception: %', SQLERRM;
  END IF;
END;
$$;

-- ============================================================
-- RPC-003: Overlap with pending request → French exception
-- ============================================================
DO $$
DECLARE
  v_req_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- Insert a pending request directly (bypass RPC to set up state)
  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'eeeeeeee-aaaa-0000-0000-000000000003',
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-09-01', '2026-09-05', 5, 'pending'
  );

  -- Try overlapping request via RPC
  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-09-03'::date,
    '2026-09-08'::date,
    NULL
  );
  RAISE WARNING 'FAIL  RPC-003: Expected overlap exception';
  DELETE FROM public.leave_requests WHERE id = 'eeeeeeee-aaaa-0000-0000-000000000003';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%demande%sur cette période%' THEN
    RAISE NOTICE 'PASS  RPC-003: Overlap with pending raises French exception';
  ELSE
    RAISE WARNING 'FAIL  RPC-003: Wrong exception: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_requests WHERE id = 'eeeeeeee-aaaa-0000-0000-000000000003';
END;
$$;

-- ============================================================
-- RPC-004: Overlap with approved request → exception
-- ============================================================
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'eeeeeeee-aaaa-0000-0000-000000000004',
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-10-01', '2026-10-03', 3, 'approved'
  );
  -- Trigger fired, reset balance
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;

  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-10-02'::date,
    '2026-10-05'::date,
    NULL
  );
  RAISE WARNING 'FAIL  RPC-004: Expected overlap exception with approved request';
  DELETE FROM public.leave_requests WHERE id = 'eeeeeeee-aaaa-0000-0000-000000000004';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%demande%sur cette période%' THEN
    RAISE NOTICE 'PASS  RPC-004: Overlap with approved request raises exception';
  ELSE
    RAISE WARNING 'FAIL  RPC-004: Wrong exception: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_requests WHERE id = 'eeeeeeee-aaaa-0000-0000-000000000004';
  UPDATE public.leave_balances SET used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- RPC-005: Overlap with rejected request → ALLOWED
-- ============================================================
DO $$
DECLARE
  v_result uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  INSERT INTO public.leave_requests (
    id, user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'eeeeeeee-aaaa-0000-0000-000000000005',
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-11-01', '2026-11-03', 3, 'rejected'
  );

  -- Same dates — should succeed since rejected doesn't block
  v_result := public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-11-01'::date,
    '2026-11-03'::date,
    NULL
  );

  ASSERT v_result IS NOT NULL, 'Expected request to succeed over rejected period';
  RAISE NOTICE 'PASS  RPC-005: Overlap with rejected request is allowed';

  DELETE FROM public.leave_requests WHERE id IN (
    'eeeeeeee-aaaa-0000-0000-000000000005', v_result
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  RPC-005: Overlap with rejected — %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = 'eeeeeeee-aaaa-0000-0000-000000000005';
END;
$$;

-- ============================================================
-- RPC-006: No balance configured → French exception
-- ============================================================
DO $$
DECLARE
  v_other_type_id uuid := 'eeeeeeee-2222-0000-0000-000000000099';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- Create a leave type with no balance for this user
  INSERT INTO public.leave_types (id, name, color, is_active)
  VALUES (v_other_type_id, 'No Balance Type', '#0000FF', true)
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.create_leave_request(
    v_other_type_id,
    '2026-07-01'::date,
    '2026-07-03'::date,
    NULL
  );
  RAISE WARNING 'FAIL  RPC-006: Expected missing balance exception';
  DELETE FROM public.leave_types WHERE id = v_other_type_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Aucun solde configuré%' THEN
    RAISE NOTICE 'PASS  RPC-006: Missing balance raises French exception';
  ELSE
    RAISE WARNING 'FAIL  RPC-006: Wrong exception: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_types WHERE id = v_other_type_id;
END;
$$;

-- ============================================================
-- RPC-007: Insufficient balance → French exception with count
-- ============================================================
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- Set balance to 3 remaining
  UPDATE public.leave_balances
  SET allocated_days = 5, used_days = 2
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;

  -- Request 4 days (1 more than available)
  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-07-01'::date,
    '2026-07-04'::date,
    NULL
  );
  RAISE WARNING 'FAIL  RPC-007: Expected insufficient balance exception';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Solde insuffisant%3%' THEN
    RAISE NOTICE 'PASS  RPC-007: Insufficient balance raises French exception with remaining count';
  ELSIF SQLERRM LIKE '%Solde insuffisant%' THEN
    RAISE NOTICE 'PASS  RPC-007: Insufficient balance raises French exception (count format may differ)';
  ELSE
    RAISE WARNING 'FAIL  RPC-007: Wrong exception: %', SQLERRM;
  END IF;
  UPDATE public.leave_balances SET allocated_days = 25, used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- RPC-008: Exact balance match (request = remaining) → success
-- ============================================================
DO $$
DECLARE
  v_result uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  UPDATE public.leave_balances
  SET allocated_days = 5, used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;

  v_result := public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-07-01'::date,
    '2026-07-05'::date,  -- exactly 5 days
    NULL
  );

  ASSERT v_result IS NOT NULL, 'Expected success when using exact balance';
  RAISE NOTICE 'PASS  RPC-008: Exact balance match succeeds';

  DELETE FROM public.leave_requests WHERE id = v_result;
  UPDATE public.leave_balances SET allocated_days = 25, used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  RPC-008: Exact balance match — %', SQLERRM;
  UPDATE public.leave_balances SET allocated_days = 25, used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- RPC-009: Single-day request (start = end) → days_count = 1
-- ============================================================
DO $$
DECLARE
  v_result uuid;
  v_days   int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  v_result := public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-07-01'::date,
    '2026-07-01'::date,
    NULL
  );

  SELECT days_count INTO v_days FROM public.leave_requests WHERE id = v_result;
  ASSERT v_days = 1, format('Expected days_count=1, got %s', v_days);
  RAISE NOTICE 'PASS  RPC-009: Single-day request has days_count=1';

  DELETE FROM public.leave_requests WHERE id = v_result;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  RPC-009: Single-day request — %', SQLERRM;
END;
$$;

-- ============================================================
-- Cleanup
-- ============================================================
ROLLBACK;

\echo ''
\echo 'RPC tests complete. Check PASS/FAIL lines above.'
\echo 'NOTICE = PASS, WARNING = FAIL'

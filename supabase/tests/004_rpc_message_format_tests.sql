-- RFC-007 / Migration 006: RPC improved error message format tests
--
-- Verifies that create_leave_request exception messages include:
--   - DD/MM/YYYY date format in overlap errors (not raw ISO)
--   - Specific day counts in balance errors (requested + remaining)
--   - Adjacent dates are NOT blocked as overlaps
--
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/tests/004_rpc_message_format_tests.sql
--
-- REQUIRES: RFC-002 seed applied (uses demo user UUIDs).

\set ON_ERROR_STOP off

BEGIN;

-- ============================================================
-- Test fixtures (same test user as 002_rpc_tests.sql)
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
  VALUES ('eeeeeeee-1111-0000-0000-000000000001', 'Format Test Team')
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

-- ============================================================
-- FMT-001: Overlap message includes conflicting dates in DD/MM/YYYY
-- ============================================================
DO $$
DECLARE
  v_conflict_id uuid := 'eeeeeeee-ffff-0001-0000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- Insert a pending request: 2026-09-10 to 2026-09-15
  INSERT INTO public.leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status)
  VALUES (
    v_conflict_id,
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-09-10', '2026-09-15', 6, 'pending'
  );

  -- Attempt overlapping request
  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-09-12'::date,
    '2026-09-20'::date,
    NULL
  );
  RAISE WARNING 'FAIL  FMT-001: Expected overlap exception with DD/MM/YYYY dates';
  DELETE FROM public.leave_requests WHERE id = v_conflict_id;
EXCEPTION WHEN OTHERS THEN
  -- Verify message contains DD/MM/YYYY format (not raw ISO 2026-09-10)
  IF SQLERRM LIKE '%10/09/2026%' AND SQLERRM LIKE '%15/09/2026%' THEN
    RAISE NOTICE 'PASS  FMT-001: Overlap message contains conflict dates in DD/MM/YYYY format';
  ELSIF SQLERRM LIKE '%demande sur cette période%' THEN
    RAISE WARNING 'FAIL  FMT-001: Overlap raised but dates not in DD/MM/YYYY format: %', SQLERRM;
  ELSE
    RAISE WARNING 'FAIL  FMT-001: Unexpected exception: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_requests WHERE id = v_conflict_id;
END;
$$;

-- ============================================================
-- FMT-002: Overlap message does NOT contain raw ISO date format
-- ============================================================
DO $$
DECLARE
  v_conflict_id uuid := 'eeeeeeee-ffff-0002-0000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  INSERT INTO public.leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status)
  VALUES (
    v_conflict_id,
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-10-05', '2026-10-10', 6, 'pending'
  );

  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-10-07'::date,
    '2026-10-15'::date,
    NULL
  );
  RAISE WARNING 'FAIL  FMT-002: Expected overlap exception';
  DELETE FROM public.leave_requests WHERE id = v_conflict_id;
EXCEPTION WHEN OTHERS THEN
  -- Must NOT contain raw ISO format like "2026-10-05"
  IF SQLERRM NOT LIKE '%2026-10-05%' AND SQLERRM LIKE '%demande%sur cette période%' THEN
    RAISE NOTICE 'PASS  FMT-002: Overlap message does not expose raw ISO dates';
  ELSIF SQLERRM LIKE '%2026-10-05%' THEN
    RAISE WARNING 'FAIL  FMT-002: Message exposes raw ISO date: %', SQLERRM;
  ELSE
    RAISE WARNING 'FAIL  FMT-002: Unexpected exception: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_requests WHERE id = v_conflict_id;
END;
$$;

-- ============================================================
-- FMT-003: Balance error includes both requested AND remaining counts
-- ============================================================
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- Set balance: 10 allocated, 3 used → 7 remaining
  UPDATE public.leave_balances
  SET allocated_days = 10, used_days = 3
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;

  -- Request 8 days (7 remaining → insufficient by 1)
  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-07-01'::date,
    '2026-07-08'::date,
    NULL
  );
  RAISE WARNING 'FAIL  FMT-003: Expected balance exception with counts';
  UPDATE public.leave_balances SET allocated_days = 25, used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
EXCEPTION WHEN OTHERS THEN
  -- Message must contain both the requested count (8) and remaining count (7)
  IF SQLERRM LIKE '%Solde insuffisant%' AND SQLERRM LIKE '%8%' AND SQLERRM LIKE '%7%' THEN
    RAISE NOTICE 'PASS  FMT-003: Balance error includes requested and remaining day counts';
  ELSIF SQLERRM LIKE '%Solde insuffisant%' THEN
    RAISE WARNING 'FAIL  FMT-003: Balance error raised but counts missing: %', SQLERRM;
  ELSE
    RAISE WARNING 'FAIL  FMT-003: Unexpected exception: %', SQLERRM;
  END IF;
  UPDATE public.leave_balances SET allocated_days = 25, used_days = 0
  WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000001'
    AND leave_type_id = 'eeeeeeee-2222-0000-0000-000000000001'
    AND year = 2026;
END;
$$;

-- ============================================================
-- FMT-004: Adjacent dates are NOT blocked as overlap
-- (end of one request = day before start of next → allowed)
-- ============================================================
DO $$
DECLARE
  v_existing_id uuid := 'eeeeeeee-ffff-0004-0000-000000000001';
  v_new_id      uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- Existing request: ends on 2026-07-05
  INSERT INTO public.leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status)
  VALUES (
    v_existing_id,
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-07-01', '2026-07-05', 5, 'pending'
  );

  -- New request starts the day AFTER: 2026-07-06 → should succeed
  v_new_id := public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-07-06'::date,
    '2026-07-08'::date,
    NULL
  );

  ASSERT v_new_id IS NOT NULL, 'Expected success for adjacent (non-overlapping) dates';
  RAISE NOTICE 'PASS  FMT-004: Adjacent (non-overlapping) dates are allowed';

  DELETE FROM public.leave_requests WHERE id IN (v_existing_id, v_new_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  FMT-004: Adjacent dates incorrectly blocked: %', SQLERRM;
  DELETE FROM public.leave_requests WHERE id = v_existing_id;
END;
$$;

-- ============================================================
-- FMT-005: Overlap with manager_approved request is blocked
-- ============================================================
DO $$
DECLARE
  v_mgr_approved_id uuid := 'eeeeeeee-ffff-0005-0000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

  INSERT INTO public.leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status)
  VALUES (
    v_mgr_approved_id,
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-2222-0000-0000-000000000001',
    '2026-08-01', '2026-08-05', 5, 'manager_approved'
  );

  PERFORM public.create_leave_request(
    'eeeeeeee-2222-0000-0000-000000000001'::uuid,
    '2026-08-03'::date,
    '2026-08-10'::date,
    NULL
  );
  RAISE WARNING 'FAIL  FMT-005: Expected overlap exception with manager_approved request';
  DELETE FROM public.leave_requests WHERE id = v_mgr_approved_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%demande%sur cette période%' THEN
    RAISE NOTICE 'PASS  FMT-005: Overlap with manager_approved request is blocked';
  ELSE
    RAISE WARNING 'FAIL  FMT-005: Wrong exception: %', SQLERRM;
  END IF;
  DELETE FROM public.leave_requests WHERE id = v_mgr_approved_id;
END;
$$;

-- ============================================================
-- Cleanup
-- ============================================================
ROLLBACK;

\echo ''
\echo 'RFC-007 RPC message format tests complete.'
\echo 'NOTICE = PASS, WARNING = FAIL'

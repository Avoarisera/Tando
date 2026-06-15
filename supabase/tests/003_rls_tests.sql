-- RLS tests: row-level security policy enforcement
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/tests/003_rls_tests.sql
--
-- Simulates different users by setting request.jwt.claims and switching role.
-- All test data is created and rolled back.
--
-- REQUIRES: RFC-002 seed applied (uses demo account UUIDs).
-- If seed is not yet applied, the fixtures block will insert minimal data.

\set ON_ERROR_STOP off

BEGIN;

-- ============================================================
-- Test fixtures — minimal self-contained data
-- UUIDs are deterministic so they can co-exist with seed
-- ============================================================
DO $$
BEGIN
  -- Two auth users: rls-employee and rls-manager
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES
    ('dddddddd-0001-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'rls-emp1@waka-test.invalid', '',
     now(), now(), now(), '{}', '{}', false),
    ('dddddddd-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'rls-emp2@waka-test.invalid', '',
     now(), now(), now(), '{}', '{}', false),
    ('dddddddd-0003-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'rls-mgr@waka-test.invalid', '',
     now(), now(), now(), '{}', '{}', false),
    ('dddddddd-0004-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'rls-admin@waka-test.invalid', '',
     now(), now(), now(), '{}', '{}', false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.teams (id, name)
  VALUES ('dddddddd-1111-0000-0000-000000000001', 'RLS Test Team')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.leave_types (id, name, color, is_active)
  VALUES ('dddddddd-2222-0000-0000-000000000001', 'RLS Test Congé', '#123456', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, first_name, last_name, role, team_id, joined_at) VALUES
    ('dddddddd-0001-0000-0000-000000000001', 'RLS', 'Emp1', 'employee', 'dddddddd-1111-0000-0000-000000000001', '2026-01-01'),
    ('dddddddd-0002-0000-0000-000000000001', 'RLS', 'Emp2', 'employee', 'dddddddd-1111-0000-0000-000000000001', '2026-01-01'),
    ('dddddddd-0003-0000-0000-000000000001', 'RLS', 'Manager', 'manager', 'dddddddd-1111-0000-0000-000000000001', '2026-01-01'),
    ('dddddddd-0004-0000-0000-000000000001', 'RLS', 'Admin', 'admin', NULL, '2026-01-01')
  ON CONFLICT (id) DO NOTHING;

  -- Leave requests: emp1 and emp2 each have one
  INSERT INTO public.leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status) VALUES
    ('dddddddd-aaaa-0000-0000-000000000001',
     'dddddddd-0001-0000-0000-000000000001',
     'dddddddd-2222-0000-0000-000000000001',
     '2026-07-01', '2026-07-03', 3, 'pending'),
    ('dddddddd-aaaa-0000-0000-000000000002',
     'dddddddd-0002-0000-0000-000000000001',
     'dddddddd-2222-0000-0000-000000000001',
     '2026-08-01', '2026-08-02', 2, 'pending')
  ON CONFLICT (id) DO NOTHING;

  -- Balances
  INSERT INTO public.leave_balances (user_id, leave_type_id, year, allocated_days, used_days) VALUES
    ('dddddddd-0001-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000001', 2026, 25, 0),
    ('dddddddd-0002-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000001', 2026, 25, 0)
  ON CONFLICT (user_id, leave_type_id, year) DO NOTHING;
END;
$$;

-- ============================================================
-- RLS-001: Employee sees only own leave_requests
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  -- Switch to authenticated role as emp1
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_requests;

  -- emp1 should only see their own request (1 row, not emp2's)
  ASSERT v_count = 1, format('Employee should see 1 request, saw %s', v_count);

  -- Verify it's actually emp1's row
  SELECT COUNT(*) INTO v_count FROM public.leave_requests
  WHERE user_id = 'dddddddd-0001-0000-0000-000000000001';
  ASSERT v_count = 1, 'Employee should see their own request';

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-001: Employee sees only own leave_requests';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-001: Employee leave_requests isolation — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-002: Employee cannot see other employees' requests
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_requests
  WHERE user_id = 'dddddddd-0002-0000-0000-000000000001';

  ASSERT v_count = 0, format('Employee should not see other employee requests, saw %s', v_count);

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-002: Employee cannot see other employees'' requests';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-002: Cross-employee isolation — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-003: Manager sees all team requests (both employees)
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0003-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_requests
  WHERE user_id IN (
    'dddddddd-0001-0000-0000-000000000001',
    'dddddddd-0002-0000-0000-000000000001'
  );

  ASSERT v_count = 2, format('Manager should see 2 team requests, saw %s', v_count);

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-003: Manager sees all team leave_requests';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-003: Manager team visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-004: Admin sees all leave_requests (both employees)
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0004-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_requests
  WHERE user_id IN (
    'dddddddd-0001-0000-0000-000000000001',
    'dddddddd-0002-0000-0000-000000000001'
  );

  ASSERT v_count = 2, format('Admin should see all requests, saw %s', v_count);

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-004: Admin sees all leave_requests';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-004: Admin full visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-005: Employee sees own profile + same-team profiles (calendar join requirement)
-- Migration 20260427000002 added profiles_select_employee_same_team so that
-- useCalendar's profiles!user_id join resolves for team members under RLS.
-- Employee in team dddddddd-1111 should see: emp1, emp2, manager (3 rows).
-- Admin has team_id=NULL so is NOT visible to the employee.
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  -- Employee sees all profiles in their team (own + teammates)
  SELECT COUNT(*) INTO v_count FROM public.profiles
  WHERE team_id = 'dddddddd-1111-0000-0000-000000000001';
  ASSERT v_count = 3, format('Employee should see 3 team profiles (emp1+emp2+manager), saw %s', v_count);

  -- Employee does NOT see profiles outside their team (admin has team_id=NULL)
  SELECT COUNT(*) INTO v_count FROM public.profiles
  WHERE team_id IS NULL;
  ASSERT v_count = 0, format('Employee should not see profiles outside their team, saw %s', v_count);

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-005: Employee sees own team profiles (not outside team)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-005: Employee team profile visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-006: Manager sees all profiles in own team
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0003-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.profiles
  WHERE team_id = 'dddddddd-1111-0000-0000-000000000001';
  -- Should see emp1, emp2, and manager themselves (3 rows)
  ASSERT v_count = 3, format('Manager should see 3 team profiles, saw %s', v_count);

  -- Admin profile (no team) should not be visible to manager
  SELECT COUNT(*) INTO v_count FROM public.profiles
  WHERE id = 'dddddddd-0004-0000-0000-000000000001';
  ASSERT v_count = 0, format('Manager should not see admin profile (different team), saw %s', v_count);

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-006: Manager sees team profiles, not admin''s';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-006: Manager profile visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-007: Admin sees all profiles
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0004-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.profiles
  WHERE id IN (
    'dddddddd-0001-0000-0000-000000000001',
    'dddddddd-0002-0000-0000-000000000001',
    'dddddddd-0003-0000-0000-000000000001',
    'dddddddd-0004-0000-0000-000000000001'
  );
  ASSERT v_count = 4, format('Admin should see all 4 profiles, saw %s', v_count);

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-007: Admin sees all profiles';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-007: Admin profiles visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-008: Employee sees own leave_balances only
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_balances;
  ASSERT v_count = 1, format('Employee should see 1 balance (own), saw %s', v_count);

  SELECT COUNT(*) INTO v_count FROM public.leave_balances
  WHERE user_id = 'dddddddd-0002-0000-0000-000000000001';
  ASSERT v_count = 0, 'Employee should not see other employee balances';

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-008: Employee sees only own leave_balances';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-008: Employee balance isolation — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-009: Employee cannot INSERT for another user
-- ============================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  INSERT INTO public.leave_requests (
    user_id, leave_type_id, start_date, end_date, days_count, status
  ) VALUES (
    'dddddddd-0002-0000-0000-000000000001',  -- emp2's UUID, not the authenticated user
    'dddddddd-2222-0000-0000-000000000001',
    '2026-12-01', '2026-12-02', 2, 'pending'
  );

  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-009: Employee inserted request for another user (RLS not enforced)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-009: Employee cannot INSERT for another user';
END;
$$;

-- ============================================================
-- RLS-010: Manager cannot UPDATE to 'approved' (only admin can)
-- ============================================================
DO $$
DECLARE
  v_status text;
  v_blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0003-0000-0000-000000000001","role":"authenticated"}', true);

  -- The manager UPDATE policy has WITH CHECK (status IN ('manager_approved','rejected')),
  -- so setting status='approved' raises a row-level security error rather than silently
  -- doing nothing. Accept either form of blocking as a valid pass.
  BEGIN
    UPDATE public.leave_requests
    SET status = 'approved'
    WHERE id = 'dddddddd-aaaa-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;

  RESET ROLE;

  IF v_blocked THEN
    RAISE NOTICE 'PASS  RLS-010: Manager cannot UPDATE leave_request to approved';
  ELSE
    SELECT status INTO v_status FROM public.leave_requests
    WHERE id = 'dddddddd-aaaa-0000-0000-000000000001';
    ASSERT v_status = 'pending', format('Manager should not set status=approved, status is %s', v_status);
    RAISE NOTICE 'PASS  RLS-010: Manager cannot UPDATE leave_request to approved';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-010: Manager → approved protection — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-011: Manager can UPDATE pending → manager_approved on own team
-- ============================================================
DO $$
DECLARE
  v_status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0003-0000-0000-000000000001","role":"authenticated"}', true);

  UPDATE public.leave_requests
  SET status = 'manager_approved',
      manager_reviewed_by = 'dddddddd-0003-0000-0000-000000000001',
      manager_reviewed_at = now()
  WHERE id = 'dddddddd-aaaa-0000-0000-000000000001';

  RESET ROLE;
  SELECT status INTO v_status FROM public.leave_requests
  WHERE id = 'dddddddd-aaaa-0000-0000-000000000001';

  ASSERT v_status = 'manager_approved', format('Manager should approve own team request, status=%s', v_status);
  RAISE NOTICE 'PASS  RLS-011: Manager can UPDATE pending → manager_approved on own team';

  -- Reset for subsequent tests
  UPDATE public.leave_requests SET status = 'pending', manager_reviewed_by = NULL, manager_reviewed_at = NULL
  WHERE id = 'dddddddd-aaaa-0000-0000-000000000001';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-011: Manager approve team request — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-012: All authenticated users can SELECT leave_types
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_types
  WHERE id = 'dddddddd-2222-0000-0000-000000000001';
  ASSERT v_count = 1, 'Employee should see leave_types';

  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0003-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.leave_types
  WHERE id = 'dddddddd-2222-0000-0000-000000000001';
  ASSERT v_count = 1, 'Manager should see leave_types';

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-012: All roles can SELECT leave_types';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-012: leave_types visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- RLS-013: Employee cannot INSERT into leave_types
-- ============================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  INSERT INTO public.leave_types (name, color, is_active)
  VALUES ('Unauthorized', '#FFFFFF', true);

  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-013: Employee inserted leave_type (RLS not enforced)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-013: Employee cannot INSERT into leave_types';
END;
$$;

-- ============================================================
-- RLS-014: All authenticated users can SELECT teams
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dddddddd-0001-0000-0000-000000000001","role":"authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.teams
  WHERE id = 'dddddddd-1111-0000-0000-000000000001';
  ASSERT v_count = 1, 'Authenticated users should see teams';

  RESET ROLE;
  RAISE NOTICE 'PASS  RLS-014: All authenticated users can SELECT teams';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE WARNING 'FAIL  RLS-014: teams visibility — %', SQLERRM;
END;
$$;

-- ============================================================
-- Cleanup
-- ============================================================
ROLLBACK;

\echo ''
\echo 'RLS tests complete. Check PASS/FAIL lines above.'
\echo 'NOTICE = PASS, WARNING = FAIL'

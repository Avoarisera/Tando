-- Break RLS infinite recursion on profiles.
--
-- Problem: policies on profiles/leave_requests/leave_balances/leave_types all do
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ...)
-- That SELECT triggers profiles SELECT policies → which query profiles again → recursion.
--
-- Fix: two SECURITY DEFINER helpers that read profiles bypassing RLS.
-- All recursive EXISTS checks are replaced by calls to these helpers.

-- ============================================================
-- Helper functions (bypass RLS via SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.auth_role()
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_team_id()
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT team_id FROM profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- PROFILES — drop recursive policies, replace with helpers
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_manager_team" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin"         ON profiles;

CREATE POLICY "profiles_select_manager_team"
  ON profiles FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'manager'
    AND public.auth_team_id() IS NOT NULL
    AND public.auth_team_id() = profiles.team_id
  );

CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT TO authenticated
  USING (public.auth_role() = 'admin');

-- ============================================================
-- LEAVE TYPES — drop recursive policies, replace with helpers
-- ============================================================

DROP POLICY IF EXISTS "leave_types_insert_admin" ON leave_types;
DROP POLICY IF EXISTS "leave_types_update_admin" ON leave_types;

CREATE POLICY "leave_types_insert_admin"
  ON leave_types FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() = 'admin');

CREATE POLICY "leave_types_update_admin"
  ON leave_types FOR UPDATE TO authenticated
  USING     (public.auth_role() = 'admin');

-- ============================================================
-- LEAVE REQUESTS — drop recursive policies, replace with helpers
-- ============================================================

DROP POLICY IF EXISTS "leave_requests_select_manager" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_select_admin"   ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_manager" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_admin"   ON leave_requests;

-- Manager sees requests of team members (single join, no self-join on profiles)
CREATE POLICY "leave_requests_select_manager"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM profiles requester
      WHERE requester.id = leave_requests.user_id
        AND requester.team_id = public.auth_team_id()
    )
  );

CREATE POLICY "leave_requests_select_admin"
  ON leave_requests FOR SELECT TO authenticated
  USING (public.auth_role() = 'admin');

-- Manager updates pending → manager_approved/rejected on own team only
CREATE POLICY "leave_requests_update_manager"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND public.auth_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM profiles requester
      WHERE requester.id = leave_requests.user_id
        AND requester.team_id = public.auth_team_id()
    )
  )
  WITH CHECK (
    status IN ('manager_approved', 'rejected')
    AND public.auth_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM profiles requester
      WHERE requester.id = leave_requests.user_id
        AND requester.team_id = public.auth_team_id()
    )
  );

CREATE POLICY "leave_requests_update_admin"
  ON leave_requests FOR UPDATE TO authenticated
  USING (public.auth_role() = 'admin');

-- ============================================================
-- LEAVE BALANCES — drop recursive policies, replace with helpers
-- ============================================================

DROP POLICY IF EXISTS "leave_balances_select_manager" ON leave_balances;
DROP POLICY IF EXISTS "leave_balances_select_admin"   ON leave_balances;
DROP POLICY IF EXISTS "leave_balances_insert_admin"   ON leave_balances;
DROP POLICY IF EXISTS "leave_balances_update_admin"   ON leave_balances;

CREATE POLICY "leave_balances_select_manager"
  ON leave_balances FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM profiles requester
      WHERE requester.id = leave_balances.user_id
        AND requester.team_id = public.auth_team_id()
    )
  );

CREATE POLICY "leave_balances_select_admin"
  ON leave_balances FOR SELECT TO authenticated
  USING (public.auth_role() = 'admin');

CREATE POLICY "leave_balances_insert_admin"
  ON leave_balances FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() = 'admin');

CREATE POLICY "leave_balances_update_admin"
  ON leave_balances FOR UPDATE TO authenticated
  USING (public.auth_role() = 'admin');

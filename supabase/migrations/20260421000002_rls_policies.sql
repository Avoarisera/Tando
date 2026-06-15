-- Enable RLS on all tables
ALTER TABLE teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances  ENABLE ROW LEVEL SECURITY;

-- ==================== TEAMS ====================
CREATE POLICY "teams_select_authenticated"
  ON teams FOR SELECT TO authenticated USING (true);

-- ==================== LEAVE TYPES ====================
CREATE POLICY "leave_types_select_authenticated"
  ON leave_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "leave_types_insert_admin"
  ON leave_types FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "leave_types_update_admin"
  ON leave_types FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== PROFILES ====================
-- Employee sees only own row
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Manager sees own row + team members
CREATE POLICY "profiles_select_manager_team"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles mgr
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'manager'
        AND mgr.team_id IS NOT NULL
        AND mgr.team_id = profiles.team_id
    )
  );

-- Admin sees all
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== LEAVE REQUESTS ====================
-- Employee sees own requests
CREATE POLICY "leave_requests_select_employee"
  ON leave_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Manager sees team requests
CREATE POLICY "leave_requests_select_manager"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_requests.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  );

-- Admin sees all
CREATE POLICY "leave_requests_select_admin"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Employee inserts own requests (via RPC SECURITY DEFINER — also allow direct for RPC)
CREATE POLICY "leave_requests_insert_employee"
  ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Manager updates pending → manager_approved/rejected on own team
CREATE POLICY "leave_requests_update_manager"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_requests.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  )
  WITH CHECK (
    status IN ('manager_approved', 'rejected')
    AND EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_requests.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  );

-- Admin updates any request
CREATE POLICY "leave_requests_update_admin"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== LEAVE BALANCES ====================
-- Employee sees own balances
CREATE POLICY "leave_balances_select_employee"
  ON leave_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Manager sees team balances
CREATE POLICY "leave_balances_select_manager"
  ON leave_balances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_balances.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  );

-- Admin sees all balances
CREATE POLICY "leave_balances_select_admin"
  ON leave_balances FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Only service role / admin can insert or update balances (seed + admin operations)
CREATE POLICY "leave_balances_insert_admin"
  ON leave_balances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "leave_balances_update_admin"
  ON leave_balances FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

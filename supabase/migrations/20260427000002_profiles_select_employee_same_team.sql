-- Employees need to read teammates' profiles so that the profiles!user_id
-- INNER JOIN in useCalendar's fetchEvents query returns rows for team members'
-- approved leave requests. Without this policy, PostgREST drops those rows
-- entirely because the join target is inaccessible under RLS.
CREATE POLICY "profiles_select_employee_same_team"
  ON profiles FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'employee'
    AND public.auth_team_id() IS NOT NULL
    AND profiles.team_id = public.auth_team_id()
  );

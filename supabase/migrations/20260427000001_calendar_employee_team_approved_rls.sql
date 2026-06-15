-- Allow employees to see approved requests from team members.
-- Employees need this for the calendar view (F18/T-010-003): teammates' approved
-- leave appears as coloured bands, while non-approved statuses remain hidden.
CREATE POLICY "leave_requests_select_employee_team_approved"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'employee'
    AND status = 'approved'
    AND public.auth_team_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles requester
      WHERE requester.id = leave_requests.user_id
        AND requester.team_id = public.auth_team_id()
    )
  );

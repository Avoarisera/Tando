-- TND-26 (b) — A manager sees the Linear data of THEIR TEAM MEMBERS only:
-- tickets assigned to a member of their WakaBods team (profiles.linear_user_id),
-- in the Linear teams linked to it. Tickets of people from other teams, and
-- unassigned tickets, are not shown (feedback 05/11: "only the data of my team").

-- Linear accounts of the signed-in manager's team members (empty for anyone else)
CREATE OR REPLACE FUNCTION public.manager_linear_user_ids()
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT m.linear_user_id
  FROM profiles me
  JOIN profiles m ON m.team_id = me.team_id AND m.linear_user_id IS NOT NULL
  WHERE me.id = auth.uid() AND me.role = 'manager' AND me.team_id IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.manager_linear_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_linear_user_ids() TO authenticated;

DROP POLICY IF EXISTS "linear_issues_select_manager" ON public.linear_issues;
CREATE POLICY "linear_issues_select_manager" ON public.linear_issues
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.manager_linear_team_ids())
         AND assignee_id IN (SELECT public.manager_linear_user_ids()));

DROP POLICY IF EXISTS "linear_users_select_manager" ON public.linear_users;
CREATE POLICY "linear_users_select_manager" ON public.linear_users
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.manager_linear_user_ids()));

DROP POLICY IF EXISTS "issue_history_select_manager" ON public.issue_history;
CREATE POLICY "issue_history_select_manager" ON public.issue_history
  FOR SELECT TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM public.linear_issues i
    WHERE i.team_id IN (SELECT public.manager_linear_team_ids())
      AND i.assignee_id IN (SELECT public.manager_linear_user_ids())));

DROP POLICY IF EXISTS "monthly_snapshots_select_manager" ON public.monthly_snapshots;
CREATE POLICY "monthly_snapshots_select_manager" ON public.monthly_snapshots
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.manager_linear_team_ids())
         AND user_id IN (SELECT public.manager_linear_user_ids()));

-- TND-26 — Manager space: their team's dashboard, people and Vélocité.
--
-- 1. team_linear_teams: the admin links a WakaBods team to Linear teams.
-- 2. profiles.linear_user_id: explicit person ↔ Linear user link (e-mails do not match).
-- 3. Managers read the Linear data of the Linear teams linked to their team only.
--    workspaces (Linear API key) stays admin-only.
-- 4. get_dashboard_snapshot: managers get their own team.

-- ── 1. Team ↔ Linear teams ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_linear_teams (
  team_id        uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  linear_team_id text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, linear_team_id)
);
CREATE INDEX IF NOT EXISTS team_linear_teams_linear_idx ON public.team_linear_teams (linear_team_id);
ALTER TABLE public.team_linear_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_linear_teams_admin_all" ON public.team_linear_teams;
CREATE POLICY "team_linear_teams_admin_all" ON public.team_linear_teams
  FOR ALL TO authenticated
  USING ((SELECT public.auth_role()) = 'admin')
  WITH CHECK ((SELECT public.auth_role()) = 'admin');

DROP POLICY IF EXISTS "team_linear_teams_select_manager" ON public.team_linear_teams;
CREATE POLICY "team_linear_teams_select_manager" ON public.team_linear_teams
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) = 'manager' AND team_id = (SELECT public.auth_team_id()));

-- ── 2. Person ↔ Linear user ────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linear_user_id text;
CREATE INDEX IF NOT EXISTS profiles_linear_user_idx ON public.profiles (linear_user_id) WHERE linear_user_id IS NOT NULL;

-- ── 3. Manager read access ─────────────────────────────────────────────────
-- Linear teams linked to the signed-in manager's team (empty for anyone else)
CREATE OR REPLACE FUNCTION public.manager_linear_team_ids()
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT l.linear_team_id
  FROM team_linear_teams l
  JOIN profiles p ON p.id = auth.uid() AND p.role = 'manager' AND p.team_id = l.team_id
$$;
REVOKE EXECUTE ON FUNCTION public.manager_linear_team_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_linear_team_ids() TO authenticated;

-- Workspaces of those links (to read the workspace's Linear users)
CREATE OR REPLACE FUNCTION public.manager_workspace_ids()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT DISTINCT l.workspace_id
  FROM team_linear_teams l
  JOIN profiles p ON p.id = auth.uid() AND p.role = 'manager' AND p.team_id = l.team_id
$$;
REVOKE EXECUTE ON FUNCTION public.manager_workspace_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_workspace_ids() TO authenticated;

DROP POLICY IF EXISTS "linear_teams_select_manager" ON public.linear_teams;
CREATE POLICY "linear_teams_select_manager" ON public.linear_teams
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.manager_linear_team_ids()));

DROP POLICY IF EXISTS "linear_issues_select_manager" ON public.linear_issues;
CREATE POLICY "linear_issues_select_manager" ON public.linear_issues
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.manager_linear_team_ids()));

DROP POLICY IF EXISTS "linear_users_select_manager" ON public.linear_users;
CREATE POLICY "linear_users_select_manager" ON public.linear_users
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.manager_workspace_ids()));

DROP POLICY IF EXISTS "issue_history_select_manager" ON public.issue_history;
CREATE POLICY "issue_history_select_manager" ON public.issue_history
  FOR SELECT TO authenticated
  USING (issue_id IN (SELECT i.id FROM public.linear_issues i WHERE i.team_id IN (SELECT public.manager_linear_team_ids())));

DROP POLICY IF EXISTS "monthly_snapshots_select_manager" ON public.monthly_snapshots;
CREATE POLICY "monthly_snapshots_select_manager" ON public.monthly_snapshots
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.manager_linear_team_ids()));

-- Teams shown in Vélocité: admin → every team of their workspaces (selected_teams
-- respected); manager → the Linear teams linked to their team. Never the API key.
CREATE OR REPLACE FUNCTION public.velocity_teams()
  RETURNS TABLE (workspace_id uuid, workspace_name text, team_id text, team_name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT w.id, w.name, t.id, t.name
  FROM workspaces w
  JOIN linear_teams t ON t.workspace_id = w.id
  WHERE public.auth_role() = 'admin'
    AND (jsonb_typeof(w.selected_teams) IS DISTINCT FROM 'array'
         OR jsonb_array_length(w.selected_teams) = 0
         OR w.selected_teams @> jsonb_build_array(jsonb_build_object('id', t.id)))
  UNION
  SELECT w.id, w.name, t.id, t.name
  FROM team_linear_teams l
  JOIN profiles p ON p.id = auth.uid() AND p.role = 'manager' AND p.team_id = l.team_id
  JOIN workspaces w ON w.id = l.workspace_id
  JOIN linear_teams t ON t.id = l.linear_team_id AND t.workspace_id = l.workspace_id
  ORDER BY 4
$$;
REVOKE EXECUTE ON FUNCTION public.velocity_teams() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.velocity_teams() TO authenticated;

-- ── 4. Dashboard snapshot: managers see their own team ─────────────────────
CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role       text := public.auth_role();
  v_team       uuid := public.auth_team_id();
  v_today      date := CURRENT_DATE;
  v_week_start date := date_trunc('week', CURRENT_DATE)::date;
  v_week_end   date := (date_trunc('week', CURRENT_DATE) + interval '6 days')::date;
  v_total          int;
  v_on_leave_today int;
  v_on_leave_week  int;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' AND NOT (v_role = 'manager' AND v_team IS NOT NULL) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM profiles p WHERE p.role IN ('employee', 'manager') AND (v_role = 'admin' OR p.team_id = v_team);

  SELECT COUNT(DISTINCT lr.user_id) INTO v_on_leave_today
  FROM leave_requests lr
  JOIN profiles p ON p.id = lr.user_id AND p.role IN ('employee', 'manager') AND (v_role = 'admin' OR p.team_id = v_team)
  WHERE lr.status = 'approved' AND lr.start_date <= v_today AND lr.end_date >= v_today;

  SELECT COUNT(DISTINCT lr.user_id) INTO v_on_leave_week
  FROM leave_requests lr
  JOIN profiles p ON p.id = lr.user_id AND p.role IN ('employee', 'manager') AND (v_role = 'admin' OR p.team_id = v_team)
  WHERE lr.status = 'approved' AND lr.start_date <= v_week_end AND lr.end_date >= v_week_start;

  RETURN (
    SELECT json_build_object(
      'total_employees', v_total,
      'on_leave_today',  v_on_leave_today,
      'on_leave_week',   v_on_leave_week,
      'present',         v_total - v_on_leave_today,
      'employees', (
        SELECT json_agg(
          json_build_object(
            'id',              p.id,
            'first_name',      p.first_name,
            'last_name',       p.last_name,
            'role',            p.role,
            'team_name',       t.name,
            'joined_at',       p.joined_at,
            'on_leave',        (lr_today.id IS NOT NULL),
            'leave_type_name', lt.name,
            'leave_end_date',  lr_today.end_date
          )
          ORDER BY p.last_name, p.first_name
        )
        FROM profiles p
        LEFT JOIN teams t ON t.id = p.team_id
        LEFT JOIN LATERAL (
          SELECT lr.id, lr.end_date, lr.leave_type_id
          FROM leave_requests lr
          WHERE lr.user_id = p.id AND lr.status = 'approved'
            AND lr.start_date <= v_today AND lr.end_date >= v_today
          ORDER BY lr.start_date
          LIMIT 1
        ) lr_today ON true
        LEFT JOIN leave_types lt ON lt.id = lr_today.leave_type_id
        WHERE p.role IN ('employee', 'manager') AND (v_role = 'admin' OR p.team_id = v_team)
      )
    )
  );
END;
$$;

-- ── 5. Privileges (table rights start from nothing since lot 0, TND-13) ─────
GRANT SELECT, INSERT, DELETE ON public.team_linear_teams TO authenticated;
GRANT SELECT (linear_user_id) ON public.profiles TO authenticated;

-- profiles are written through admin RPCs only: the Linear account link too
CREATE OR REPLACE FUNCTION public.admin_set_linear_user(p_id uuid, p_linear_user_id text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET linear_user_id = NULLIF(trim(p_linear_user_id), '') WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personne introuvable'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_linear_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_linear_user(uuid, text) TO authenticated;

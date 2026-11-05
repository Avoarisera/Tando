-- =============================================================================
-- TND-24 (05/11/2026) — Vélocité performance
--
-- 1. Indexes for the queries the pages actually run (period filters on
--    updated_at, per-workspace lists).
-- 2. RLS: `auth_role() = 'admin'` was evaluated for every row read (the plan
--    showed `Filter: (auth_role() = 'admin')` on each of ~23,000 history rows).
--    Wrapped in a sub-select, Postgres evaluates it once per query (InitPlan).
--    Same rule, same result.
-- =============================================================================

CREATE INDEX IF NOT EXISTS linear_issues_ws_team_updated_idx ON public.linear_issues (workspace_id, team_id, updated_at);
CREATE INDEX IF NOT EXISTS linear_issues_ws_updated_idx      ON public.linear_issues (workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS linear_users_workspace_idx        ON public.linear_users (workspace_id);
CREATE INDEX IF NOT EXISTS linear_teams_workspace_idx        ON public.linear_teams (workspace_id);
CREATE INDEX IF NOT EXISTS issue_history_ws_changed_idx      ON public.issue_history (workspace_id, changed_at);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('linear_issues', 'issue_history', 'linear_users', 'linear_teams', 'monthly_snapshots', 'workspaces')
      AND qual = '(auth_role() = ''admin''::text)'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING ((SELECT public.auth_role()) = ''admin'')', r.policyname, r.tablename);
  END LOOP;
END $$;

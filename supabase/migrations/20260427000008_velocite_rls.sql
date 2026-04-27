-- RLS pour les tables Vélocité Dev

ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE linear_teams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE linear_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE linear_issues    ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_snapshots ENABLE ROW LEVEL SECURITY;

-- workspaces : un user ne voit que les siens
CREATE POLICY "workspaces_all_own"
  ON workspaces FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- tables liées : filtrées par workspace appartenant à l'user
CREATE POLICY "linear_teams_all_own"
  ON linear_teams FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "linear_users_all_own"
  ON linear_users FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "linear_issues_all_own"
  ON linear_issues FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "issue_history_all_own"
  ON issue_history FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "monthly_snapshots_all_own"
  ON monthly_snapshots FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

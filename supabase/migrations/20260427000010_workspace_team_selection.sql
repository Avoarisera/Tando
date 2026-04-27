-- Add team selection to workspaces.
-- selected_teams: [{id, name}] — null means "sync all teams" (backward-compatible).
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS selected_teams jsonb;

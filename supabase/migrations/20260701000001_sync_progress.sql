-- Background sync job status on workspaces.
-- Sync now runs in the background (event.waitUntil) and reports progress here;
-- the UI polls these columns to render a progress bar.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sync_status      text NOT NULL DEFAULT 'idle'
    CHECK (sync_status IN ('idle', 'running', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS sync_teams_total int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_teams_done  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_issues_done int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error       text,
  ADD COLUMN IF NOT EXISTS sync_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS sync_finished_at timestamptz;

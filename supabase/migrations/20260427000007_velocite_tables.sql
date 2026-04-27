-- Vélocité Dev : tables Linear + snapshots mensuels

CREATE TABLE workspaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  linear_api_key   text NOT NULL,
  last_synced_at   timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE linear_teams (
  id           text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text,
  raw          jsonb
);

CREATE TABLE linear_users (
  id           text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text,
  display_name text,
  is_active    boolean,
  raw          jsonb,
  synced_at    timestamptz DEFAULT now()
);

CREATE TABLE linear_issues (
  id            text PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  identifier    text,
  title         text,
  team_id       text REFERENCES linear_teams(id),
  assignee_id   text,
  status        text,
  status_type   text,
  estimate      float,
  created_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  qa_started_at timestamptz,
  updated_at    timestamptz,
  raw           jsonb
);
CREATE INDEX ON linear_issues(workspace_id, assignee_id, qa_started_at);
CREATE INDEX ON linear_issues(workspace_id, team_id, status);

CREATE TABLE issue_history (
  id           bigserial PRIMARY KEY,
  issue_id     text NOT NULL REFERENCES linear_issues(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text,
  changed_at   timestamptz NOT NULL,
  actor_id     text
);
CREATE INDEX ON issue_history(issue_id, changed_at);

CREATE TABLE monthly_snapshots (
  id                      bigserial PRIMARY KEY,
  workspace_id            uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id                 text,
  team_id                 text,
  month                   date NOT NULL,
  tickets_count           int,
  points_sum              float,
  bugs_count              int,
  avg_size                float,
  median_dev_cycle_hours  float,
  ticket_ids              text[],
  computed_at             timestamptz DEFAULT now(),
  UNIQUE (workspace_id, user_id, team_id, month)
);

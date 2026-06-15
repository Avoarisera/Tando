-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Leave types (configurable by admin)
CREATE TABLE IF NOT EXISTS leave_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  color       text NOT NULL CHECK (color ~* '^#[0-9A-F]{6}$'),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  team_id     uuid REFERENCES teams(id),
  joined_at   date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES profiles(id),
  leave_type_id         uuid NOT NULL REFERENCES leave_types(id),
  start_date            date NOT NULL,
  end_date              date NOT NULL,
  days_count            int NOT NULL CHECK (days_count >= 1),
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','manager_approved','approved','rejected')),
  comment               text CHECK (char_length(comment) <= 500),
  manager_reviewed_by   uuid REFERENCES profiles(id),
  manager_reviewed_at   timestamptz,
  admin_reviewed_by     uuid REFERENCES profiles(id),
  admin_reviewed_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- Leave balances (used_days maintained by trigger)
CREATE TABLE IF NOT EXISTS leave_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id),
  leave_type_id   uuid NOT NULL REFERENCES leave_types(id),
  year            int NOT NULL,
  allocated_days  int NOT NULL DEFAULT 25,
  used_days       int NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, leave_type_id, year)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id   ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status    ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year ON leave_balances(user_id, year);
CREATE INDEX IF NOT EXISTS idx_profiles_team_id         ON profiles(team_id);

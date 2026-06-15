# RFC-001 — Project Setup & Database Foundation

**ID:** RFC-001  
**Title:** Project Setup + Database Schema + RLS Policies + Balance Trigger  
**Sprint:** 1  
**Complexity:** High  
**Predecessor:** —  
**Successor:** RFC-002

---

## Summary

This RFC establishes the entire technical foundation of the WakaBods POC before any application code can be written. It covers three tightly coupled sub-tasks:

1. **F24** — Nuxt 4.4.2 + Tailwind CSS + `@nuxtjs/supabase` project configuration
2. **F05** — All SQL migrations: tables, constraints, indexes, and RLS policies
3. **F17** — PostgreSQL trigger `update_leave_balance` maintaining `leave_balances.used_days`

Nothing else can be implemented until this RFC is complete.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F24 | Nuxt + Tailwind + Supabase setup | Low |
| F05 | Database schema + RLS policies | High |
| F17 | Trigger `update_leave_balance` | High |

---

## Dependencies

- **Predecessors:** none
- **Successors:** RFC-002 (seed), all subsequent RFCs

---

## Technical Approach

### F24 — Project Configuration

**Files to create or modify:**

```
nuxt.config.ts                  ← Module config, Supabase redirect:false
package.json                    ← Dependencies declared
app/app.vue                     ← Root component with <NuxtLayout><NuxtPage/>
app/types/index.ts              ← Business interfaces (all defined now)
app/types/database.ts           ← Supabase-generated types placeholder
.env                      ← Never committed (gitignored)
```

**`nuxt.config.ts` target configuration:**

```ts
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  future: { compatibilityVersion: 4 },   // Nuxt 4 app/ directory
  modules: ['@nuxtjs/supabase'],
  supabase: {
    redirect: false,   // auth redirect handled by auth.global.ts middleware
  },
  css: ['~/assets/css/main.css'],         // Tailwind entry point
})
```

**Tailwind CSS v4 configuration** — `app/assets/css/main.css`:

```css
@import "tailwindcss";

@theme {
  --color-brand-primary: #2563EB;
  --color-brand-success: #16A34A;
  --color-brand-warning: #D97706;
  --color-brand-danger:  #DC2626;
  --color-brand-muted:   #6B7280;
}
```

> Tailwind v4 uses CSS-first configuration (`@theme`) instead of `tailwind.config.ts`. No JS config file is needed.

**Environment variables (`.env`):**

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_KEY` must never appear in `nuxt.config.ts` or any client-accessible file.

**TypeScript interfaces** — all defined in `app/types/index.ts` at setup time:

```ts
export type UserRole = 'admin' | 'manager' | 'employee'
export type LeaveStatus = 'pending' | 'manager_approved' | 'approved' | 'rejected'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  role: UserRole
  team_id: string | null
  joined_at: string
  created_at: string
}

export interface LeaveRequest {
  id: string
  user_id: string
  leave_type_id: string
  start_date: string        // ISO date 'YYYY-MM-DD'
  end_date: string
  days_count: number
  status: LeaveStatus
  comment: string | null
  manager_reviewed_by: string | null
  manager_reviewed_at: string | null
  admin_reviewed_by: string | null
  admin_reviewed_at: string | null
  created_at: string
}

export interface LeaveType {
  id: string
  name: string
  color: string             // hex '#RRGGBB'
  is_active: boolean
  created_at: string
}

export interface LeaveBalance {
  id: string
  user_id: string
  leave_type_id: string
  year: number
  allocated_days: number
  used_days: number
  created_at: string
}

export interface Team {
  id: string
  name: string
  created_at: string
}
```

---

### F05 — Database Migrations

Four SQL migration files, executed in order:

**`supabase/migrations/20260421_001_create_tables.sql`**

Creates all five tables with constraints and indexes.

```sql
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
```

**`supabase/migrations/20260421_002_rls_policies.sql`**

Enable RLS and create all policies:

```sql
-- Enable RLS on all tables
ALTER TABLE teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances  ENABLE ROW LEVEL SECURITY;

-- ==================== TEAMS ====================
CREATE POLICY "teams_select_authenticated"
  ON teams FOR SELECT TO authenticated USING (true);

-- ==================== LEAVE TYPES ====================
CREATE POLICY "leave_types_select_authenticated"
  ON leave_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "leave_types_insert_admin"
  ON leave_types FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "leave_types_update_admin"
  ON leave_types FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== PROFILES ====================
-- Employee sees only own row
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Manager sees own row + team members
CREATE POLICY "profiles_select_manager_team"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles mgr
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'manager'
        AND mgr.team_id IS NOT NULL
        AND mgr.team_id = profiles.team_id
    )
  );

-- Admin sees all
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== LEAVE REQUESTS ====================
-- Employee sees own requests
CREATE POLICY "leave_requests_select_employee"
  ON leave_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Manager sees team requests
CREATE POLICY "leave_requests_select_manager"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_requests.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  );

-- Admin sees all
CREATE POLICY "leave_requests_select_admin"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Employee inserts own requests (via RPC SECURITY DEFINER — also allow direct for RPC)
CREATE POLICY "leave_requests_insert_employee"
  ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Manager updates pending → manager_approved/rejected on own team
CREATE POLICY "leave_requests_update_manager"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_requests.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  );

-- Admin updates any request
CREATE POLICY "leave_requests_update_admin"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== LEAVE BALANCES ====================
-- Employee sees own balances
CREATE POLICY "leave_balances_select_employee"
  ON leave_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Manager sees team balances
CREATE POLICY "leave_balances_select_manager"
  ON leave_balances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles requester
      JOIN profiles mgr ON mgr.team_id = requester.team_id
      WHERE requester.id = leave_balances.user_id
        AND mgr.id = auth.uid()
        AND mgr.role = 'manager'
    )
  );

-- Admin sees all balances
CREATE POLICY "leave_balances_select_admin"
  ON leave_balances FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Only service role / admin can insert or update balances (seed + admin operations)
CREATE POLICY "leave_balances_insert_admin"
  ON leave_balances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "leave_balances_update_admin"
  ON leave_balances FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

**`supabase/migrations/20260421_003_trigger_balance.sql`**

Trigger function and trigger registration (also satisfies F17):

```sql
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year int;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.start_date, OLD.start_date))::int;

  -- Case 1: transition TO 'approved' (from any other status, or on INSERT directly approved)
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'approved')
  THEN
    UPDATE leave_balances
    SET used_days = used_days + NEW.days_count
    WHERE user_id       = NEW.user_id
      AND leave_type_id = NEW.leave_type_id
      AND year          = v_year;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année';
    END IF;

  -- Case 2: transition FROM 'approved' to something else (admin correction)
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'approved'
    AND NEW.status <> 'approved'
  THEN
    UPDATE leave_balances
    SET used_days = GREATEST(0, used_days - OLD.days_count)
    WHERE user_id       = OLD.user_id
      AND leave_type_id = OLD.leave_type_id
      AND year          = v_year;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_leave_balance
  AFTER INSERT OR UPDATE OF status
  ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_balance();
```

**`supabase/migrations/20260421_004_rpc_functions.sql`**

The `create_leave_request` RPC (used in RFC-007, defined here to keep all SQL in migrations):

```sql
CREATE OR REPLACE FUNCTION create_leave_request(
  p_leave_type_id  uuid,
  p_start_date     date,
  p_end_date       date,
  p_comment        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_days_count int  := (p_end_date - p_start_date) + 1;
  v_balance    leave_balances;
  v_new_id     uuid;
BEGIN
  -- Validate dates
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début';
  END IF;

  -- Check overlap with existing requests
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = v_user_id
      AND status IN ('pending', 'manager_approved', 'approved')
      AND start_date <= p_end_date
      AND end_date   >= p_start_date
  ) THEN
    RAISE EXCEPTION 'Vous avez déjà une demande sur cette période';
  END IF;

  -- Check balance
  SELECT * INTO v_balance
  FROM leave_balances
  WHERE user_id       = v_user_id
    AND leave_type_id = p_leave_type_id
    AND year          = EXTRACT(YEAR FROM p_start_date)::int;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun solde configuré pour ce type de congé';
  END IF;

  IF (v_balance.allocated_days - v_balance.used_days) < v_days_count THEN
    RAISE EXCEPTION 'Solde insuffisant — il vous reste % jour(s)',
      (v_balance.allocated_days - v_balance.used_days);
  END IF;

  -- Insert request
  INSERT INTO leave_requests (
    user_id, leave_type_id, start_date, end_date, days_count, comment
  )
  VALUES (v_user_id, p_leave_type_id, p_start_date, p_end_date, v_days_count, p_comment)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
```

---

## Acceptance Criteria

### F24 — Project Setup

- [ ] `@nuxtjs/supabase` v2 installed and configured in `nuxt.config.ts`
- [ ] Tailwind CSS v4 configured with custom brand colors via `@theme` in CSS
- [ ] `SUPABASE_URL` and `SUPABASE_KEY` (anon) readable by the module
- [ ] `SUPABASE_SERVICE_KEY` present in `.env` only, never in any committed file
- [ ] `useSupabaseClient()` and `useSupabaseUser()` callable in composables
- [ ] All business interfaces defined in `app/types/index.ts`
- [ ] `yarn nuxt dev` starts without errors
- [ ] `.gitignore` includes `.env`

### F05 — Schema & RLS

- [ ] All 5 tables created with correct types, constraints, and indexes
- [ ] RLS enabled on all 5 tables
- [ ] Employee SELECT policies restrict to own data only
- [ ] Manager SELECT policies restrict to own team only
- [ ] Admin SELECT policies allow full access
- [ ] INSERT/UPDATE policies enforce role boundaries for `leave_requests` and `leave_types`
- [ ] No policy grants access beyond the documented matrix in PRD §9

### F17 — Balance Trigger

- [ ] Trigger fires AFTER INSERT OR UPDATE OF status ON leave_requests
- [ ] `pending → approved`: `used_days += days_count`
- [ ] `manager_approved → approved`: `used_days += days_count`
- [ ] `approved → rejected`: `used_days -= days_count` (GREATEST with 0)
- [ ] `pending → manager_approved`: no change to `used_days`
- [ ] Missing `leave_balances` row raises a French exception

---

## Data Models

All table definitions are in the migration files above. No additional data models are introduced in this RFC.

---

## API Contracts / Interfaces Exposed

After this RFC, the following Supabase primitives are available to all subsequent RFCs:

- `supabase.from('profiles').select(...)` — scoped by role via RLS
- `supabase.from('leave_requests').select(...)` — scoped by role via RLS
- `supabase.from('leave_balances').select(...)` — scoped by role via RLS
- `supabase.from('leave_types').select(...)` — readable by all authenticated users
- `supabase.from('teams').select(...)` — readable by all authenticated users
- `supabase.rpc('create_leave_request', {...})` — defined and ready (used in RFC-007)
- Trigger `update_leave_balance` — fires automatically on status changes

---

## Implementation Notes

### Migration execution

Run migrations via Supabase CLI against the **local** instance only:

```bash
supabase start           # start local Supabase (Docker)
supabase db reset        # drop + recreate schema + apply all migrations (dev)
```

`supabase db push` (remote) is reserved for RFC-013 deployment. Do not run it during development.

### Tailwind v4 specifics

Tailwind v4 does **not** use `tailwind.config.ts`. The `@theme` block in CSS replaces it. The purge/content configuration is automatic based on Vite file scanning.

### RLS note on RPC SECURITY DEFINER

The `create_leave_request` RPC uses `SECURITY DEFINER` so it can bypass the INSERT RLS check when inserting on behalf of `auth.uid()`. The `leave_requests_insert_employee` policy still applies for direct client inserts (belt-and-suspenders).

### `app/app.vue` minimal setup

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

---

## Testing Strategy

> All commands run against the **local** Supabase instance (`supabase start` must be running). "Supabase Studio" = `http://localhost:54323`.

- Run `supabase db reset` to verify all migrations apply cleanly from scratch
- Open local Supabase Studio > Table Editor — verify all 5 tables exist with correct columns
- Open local Supabase Studio > Authentication > Policies — verify all policies are listed
- Test trigger by manually inserting a `leave_balance` row and a `leave_request` with `status='approved'`, then verify `used_days` incremented
- Run `yarn nuxt typecheck` — should pass with no errors

---

## Error Handling

- SQL migrations are idempotent via `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION` / `CREATE POLICY` — safe to replay
- Trigger function raises French exceptions that bubble up through RPC calls to the client
- `used_days` has a `CHECK (used_days >= 0)` constraint + `GREATEST(0, ...)` in the trigger for safety

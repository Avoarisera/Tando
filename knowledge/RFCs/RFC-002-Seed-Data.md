# RFC-002 — Seed Data

**ID:** RFC-002  
**Title:** Idempotent Demo Seed (`supabase/seed.sql`)  
**Sprint:** 1  
**Complexity:** Medium  
**Predecessor:** RFC-001  
**Successor:** RFC-003

---

## Summary

This RFC creates the `supabase/seed.sql` script that populates the database with all demo data required to run and demonstrate the WakaBods POC. The script is idempotent: it can be run multiple times without creating duplicates or errors. It covers feature **F25**.

The seed creates:
- 1 team (Équipe A)
- 4 users in `auth.users` (via service role)
- 4 profiles
- 4 leave types
- 3 leave balances (Emma, Eddy, Marc — employees and manager)
- 4 demo leave requests at various statuses

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F25 | Idempotent seed script | Medium |

---

## Dependencies

- **Predecessors:** RFC-001 (all tables, RLS, trigger must exist)
- **Successors:** RFC-003 (auth tests require demo accounts)

---

## Technical Approach

### Execution context

The seed requires the **service role key** to create `auth.users` entries. This means it is executed locally via:

```bash
supabase db seed
# or via psql with service role connection string
```

It is **never** run in client-side code. `SUPABASE_SERVICE_KEY` remains in `.env` only.

### Fixed UUIDs strategy

All demo entities use hardcoded UUIDs to guarantee idempotence — same IDs on every run:

```
-- Teams
TEAM_A_ID          = '00000000-0000-0000-0000-000000000010'

-- Users / Profiles
ADMIN_ID           = '00000000-0000-0000-0000-000000000001'
MANAGER_ID         = '00000000-0000-0000-0000-000000000002'
EMPLOYEE1_ID       = '00000000-0000-0000-0000-000000000003'
EMPLOYEE2_ID       = '00000000-0000-0000-0000-000000000004'

-- Leave Types
LEAVE_TYPE_CP_ID   = '00000000-0000-0000-0000-000000000020'   -- Congé payé
LEAVE_TYPE_CM_ID   = '00000000-0000-0000-0000-000000000021'   -- Congé maladie
LEAVE_TYPE_RTT_ID  = '00000000-0000-0000-0000-000000000022'   -- RTT
LEAVE_TYPE_CSS_ID  = '00000000-0000-0000-0000-000000000023'   -- Congé sans solde

-- Leave Balances (for year 2026)
BALANCE_MARC_CP    = '00000000-0000-0000-0000-000000000031'
BALANCE_EMMA_CP    = '00000000-0000-0000-0000-000000000032'
BALANCE_EDDY_CP    = '00000000-0000-0000-0000-000000000033'

-- Leave Requests
REQ_EMMA_PENDING   = '00000000-0000-0000-0000-000000000041'
REQ_EDDY_MGRAPPR   = '00000000-0000-0000-0000-000000000042'
REQ_EMMA_APPROVED  = '00000000-0000-0000-0000-000000000043'
REQ_EDDY_REJECTED  = '00000000-0000-0000-0000-000000000044'
```

### Insertion order

The order matters due to foreign key constraints and the balance trigger:

1. `teams`
2. `leave_types`
3. `auth.users` (requires service role)
4. `profiles`
5. `leave_balances` (with `used_days = 0` initially)
6. `leave_requests` — non-approved requests first, then the `approved` request last (so the trigger increments `used_days` on the final insert)

### `supabase/seed.sql` full content

```sql
-- =============================================================
-- WakaBods Seed — idempotent demo data
-- Requires: service role key (run via supabase db seed)
-- =============================================================

-- 1. Teams
INSERT INTO teams (id, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'Équipe A')
ON CONFLICT (id) DO NOTHING;

-- 2. Leave Types
INSERT INTO leave_types (id, name, color, is_active) VALUES
  ('00000000-0000-0000-0000-000000000020', 'Congé payé',        '#4CAF50', true),
  ('00000000-0000-0000-0000-000000000021', 'Congé maladie',     '#F44336', true),
  ('00000000-0000-0000-0000-000000000022', 'RTT',               '#2196F3', true),
  ('00000000-0000-0000-0000-000000000023', 'Congé sans solde',  '#9E9E9E', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Auth users (requires service role)
-- NOTE: Supabase seed.sql executes with service role via `supabase db seed`
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, aud, role
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'admin@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'manager@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'employee1@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'employee2@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- Also insert identity rows for email auth
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'admin@waka.com',
   '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@waka.com"}'::jsonb,
   'email', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'manager@waka.com',
   '{"sub":"00000000-0000-0000-0000-000000000002","email":"manager@waka.com"}'::jsonb,
   'email', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'employee1@waka.com',
   '{"sub":"00000000-0000-0000-0000-000000000003","email":"employee1@waka.com"}'::jsonb,
   'email', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000004', 'employee2@waka.com',
   '{"sub":"00000000-0000-0000-0000-000000000004","email":"employee2@waka.com"}'::jsonb,
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 4. Profiles
INSERT INTO profiles (id, first_name, last_name, role, team_id, joined_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alice',  'Admin',     'admin',    NULL,                                   '2024-01-15'),
  ('00000000-0000-0000-0000-000000000002', 'Marc',   'Manager',   'manager',  '00000000-0000-0000-0000-000000000010', '2024-01-15'),
  ('00000000-0000-0000-0000-000000000003', 'Emma',   'Employée',  'employee', '00000000-0000-0000-0000-000000000010', '2024-01-15'),
  ('00000000-0000-0000-0000-000000000004', 'Eddy',   'Employé',   'employee', '00000000-0000-0000-0000-000000000010', '2024-01-15')
ON CONFLICT (id) DO NOTHING;

-- 5. Leave balances (used_days = 0 initially; trigger updates Emma's after step 6)
INSERT INTO leave_balances (id, user_id, leave_type_id, year, allocated_days, used_days) VALUES
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000020', 2026, 25, 0),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000020', 2026, 25, 0),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000020', 2026, 25, 0)
ON CONFLICT (id) DO NOTHING;

-- 6. Leave requests — non-approved first, approved last (trigger fires on approved INSERT)
-- Emma — pending (5 days Congé payé, future)
INSERT INTO leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status)
VALUES (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000020',
  '2026-05-12', '2026-05-16', 5, 'pending'
)
ON CONFLICT (id) DO NOTHING;

-- Eddy — manager_approved (3 days RTT)
INSERT INTO leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status,
                            manager_reviewed_by, manager_reviewed_at)
VALUES (
  '00000000-0000-0000-0000-000000000042',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000022',
  '2026-05-05', '2026-05-07', 3, 'manager_approved',
  '00000000-0000-0000-0000-000000000002', '2026-04-20 10:00:00+00'
)
ON CONFLICT (id) DO NOTHING;

-- Eddy — rejected (3 days Congé maladie)
INSERT INTO leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status,
                            manager_reviewed_by, manager_reviewed_at)
VALUES (
  '00000000-0000-0000-0000-000000000044',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000021',
  '2026-03-10', '2026-03-12', 3, 'rejected',
  '00000000-0000-0000-0000-000000000002', '2026-03-08 09:00:00+00'
)
ON CONFLICT (id) DO NOTHING;

-- Emma — approved (5 days Congé payé) — INSERT LAST so trigger increments used_days
INSERT INTO leave_requests (id, user_id, leave_type_id, start_date, end_date, days_count, status,
                            manager_reviewed_by, manager_reviewed_at,
                            admin_reviewed_by, admin_reviewed_at)
VALUES (
  '00000000-0000-0000-0000-000000000043',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000020',
  '2026-04-14', '2026-04-18', 5, 'approved',
  '00000000-0000-0000-0000-000000000002', '2026-04-10 08:00:00+00',
  '00000000-0000-0000-0000-000000000001', '2026-04-11 09:00:00+00'
)
ON CONFLICT (id) DO NOTHING;
```

### Expected final state after seed

| Entity | Value |
|--------|-------|
| `leave_balances` Emma (Congé payé 2026) | `allocated_days=25`, `used_days=5` (trigger fired on approved insert) |
| `leave_balances` Eddy (Congé payé 2026) | `allocated_days=25`, `used_days=0` (no approved requests) |
| `leave_balances` Marc (Congé payé 2026) | `allocated_days=25`, `used_days=0` |

---

## Acceptance Criteria

- [ ] 4 users in `auth.users` with email/password `Waka2026!` — login works for all 4
- [ ] 1 team "Équipe A" exists
- [ ] 4 leave types seeded: Congé payé (#4CAF50), Congé maladie (#F44336), RTT (#2196F3), Congé sans solde (#9E9E9E)
- [ ] 4 profiles: Alice (admin, no team), Marc (manager, Équipe A), Emma (employee, Équipe A), Eddy (employee, Équipe A)
- [ ] 3 leave balances for year 2026: Marc, Emma, Eddy — Congé payé only, 25 allocated
- [ ] Emma's `used_days = 5` (trigger auto-fired on approved request insert)
- [ ] Eddy's `used_days = 0`
- [ ] 4 leave requests with correct statuses: pending (Emma), manager_approved (Eddy), approved (Emma), rejected (Eddy)
- [ ] Script is idempotent: running twice produces no errors and no duplicate rows

---

## Testing Strategy

> All commands run against the **local** Supabase instance (`supabase start` must be running). "Supabase Studio" = `http://localhost:54323`.

1. Run `supabase db reset` (applies migrations) then `supabase db seed`
2. Open local Supabase Studio > Table Editor — verify row counts per table
3. Check `leave_balances` for Emma: `used_days` must equal 5
4. Re-run `supabase db seed` — no errors, no duplicates
5. Test login with all 4 accounts at `/login` once RFC-003 is implemented

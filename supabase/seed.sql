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
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, aud, role,
  confirmation_token, recovery_token, email_change_token_new, email_change, reauthentication_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated',
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'manager@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated',
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'employee1@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated',
    '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'employee2@waka.com',
    crypt('Waka2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), 'authenticated', 'authenticated',
    '', '', '', '', ''
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

-- 5. Leave balances — all non-admin users × all leave types for 2026
-- Congé payé seeded with 25 allocated days; all other types start at 0.
-- used_days = 0 initially; trigger updates Emma's Congé payé after step 6.
INSERT INTO leave_balances (id, user_id, leave_type_id, year, allocated_days, used_days) VALUES
  -- Marc (manager) — Congé payé
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000020', 2026, 25, 0),
  -- Marc — other types (0 days)
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000021', 2026, 0, 0),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000022', 2026, 0, 0),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000023', 2026, 0, 0),
  -- Emma (employee) — Congé payé
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000020', 2026, 25, 0),
  -- Emma — other types (0 days)
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000021', 2026, 0, 0),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000022', 2026, 0, 0),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000023', 2026, 0, 0),
  -- Eddy (employee) — Congé payé
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000020', 2026, 25, 0),
  -- Eddy — other types (0 days)
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000021', 2026, 0, 0),
  ('00000000-0000-0000-0000-000000000057', '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000022', 2026, 0, 0),
  ('00000000-0000-0000-0000-000000000058', '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000023', 2026, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 6. Leave requests — non-approved first (trigger must not fire before balances exist)
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
-- RTT balance seeded at 0 days — admin approval will result in used_days > allocated_days (negative remaining)
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

-- 7. Invoices — pdf_path pre-set to match scripts/seed-invoices.mjs upload paths
INSERT INTO invoices (id, reference, client, amount, currency, invoice_date, due_date, notes, status, pdf_path, created_by)
VALUES
  (
    '00000000-0000-0000-0000-000000000060',
    'FAC-2026-001', 'ACME Corp', 1500.00, 'EUR',
    '2026-02-01', '2026-03-01', 'Prestation de conseil — Janvier 2026',
    'payee',
    '00000000-0000-0000-0000-000000000060/FAC-2026-001.pdf',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000061',
    'FAC-2026-002', 'SoWell Technologies', 2800.00, 'EUR',
    '2026-03-15', '2026-04-14', NULL,
    'envoyee',
    '00000000-0000-0000-0000-000000000061/FAC-2026-002.pdf',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000062',
    'FAC-2026-003', 'Startup XYZ', 750.00, 'USD',
    '2026-04-10', NULL, NULL,
    'en_attente',
    '00000000-0000-0000-0000-000000000062/FAC-2026-003.pdf',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

-- 8. Leave requests — approved last so trigger fires correctly
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

# Implementation Prompt — RFC-002: Seed Data

## Context

You are implementing **RFC-002** of the WakaBods POC — the idempotent demo seed script that populates the database with all data needed for demonstrations and testing.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 is complete:
- All 5 database tables exist with constraints and indexes
- Full RLS policies are active on all tables
- Trigger `update_leave_balance` is installed
- RPC `create_leave_request` is installed
- Nuxt project is configured and starts without errors

## Your task

Implement `supabase/seed.sql` as defined in `RFCs/RFC-002-Seed-Data.md`.

The seed must create, in order:
1. 1 team: "Équipe A"
2. 4 leave types: Congé payé (#4CAF50), Congé maladie (#F44336), RTT (#2196F3), Congé sans solde (#9E9E9E)
3. 4 users in `auth.users` + `auth.identities` (email/password `Waka2026!`)
4. 4 profiles (Alice Admin, Marc Manager, Emma Employée, Eddy Employé)
5. 3 leave balances for year 2026 (Marc, Emma, Eddy — Congé payé, 25 days)
6. 4 leave requests: non-approved first, then Emma's approved request LAST (so the trigger fires correctly)

Use the exact hardcoded UUIDs specified in the RFC. All `INSERT` statements use `ON CONFLICT (id) DO NOTHING` for idempotence.

## Non-negotiable rules

1. **`SUPABASE_SERVICE_KEY` never client-side** — this script runs via `supabase db seed` (CLI) with service role, never from app code
2. **Insertion order must be respected** — the approved leave request must be inserted last so the trigger increments `used_days`
3. **All UUIDs must be hardcoded** exactly as specified in the RFC (not `gen_random_uuid()`)
4. **French** for all string data (team name "Équipe A", profile names, etc.)

## Checklist before declaring done

- [ ] `supabase db seed` runs without errors
- [ ] Running it a second time produces no errors (idempotent)
- [ ] `auth.users` has 4 rows
- [ ] `profiles` has 4 rows matching the demo accounts
- [ ] `leave_types` has 4 rows with correct names and hex colors
- [ ] `leave_balances` has 3 rows (Marc, Emma, Eddy), all for year 2026, 25 allocated days
- [ ] Emma's `used_days = 5` (trigger fired on the approved request insert)
- [ ] Eddy's `used_days = 0`
- [ ] All 4 demo accounts can login at `/login` with password `Waka2026!`

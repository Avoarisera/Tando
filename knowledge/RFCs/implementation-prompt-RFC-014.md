# Implementation Prompt — RFC-014: Sprint 4 DB Schema Extensions

## Context

You are implementing **RFC-014** of the WakaBods POC — all DB schema extensions needed for Sprint 4.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-013 are complete. The DB has the core schema (teams, profiles, leave_types, leave_requests, leave_balances), all RLS policies, the `update_leave_balance` trigger, the `create_leave_request` RPC, and the seed. The app is deployed on Vercel.

## Your task

Implement all changes defined in `RFCs/RFC-014-Sprint4-DB-Schema.md`:

1. New SQL migration adding `birth_date` and `trial_ends_at` to `profiles`
2. New `invoices` table with RLS
3. New `notification_logs` table (no client RLS — service role only)
4. Updated RLS policy on `profiles` for admin date fields update
5. New RPC `get_dashboard_snapshot()` (SECURITY DEFINER, admin-gated)
6. Supabase Storage bucket `invoices` (private, admin-only policy)

**This is a DB-only RFC.** No Vue/Nuxt files are created or modified.

## Phase 1 — Planning (No Code)

1. Read `RFCs/RFC-014-Sprint4-DB-Schema.md` for the exact SQL
2. Check existing migrations to avoid conflicts on policy names
3. Present the migration file name and confirm the SQL sequence before writing

## Phase 2 — Implementation

Create `supabase/migrations/[timestamp]_005_sprint4_schema.sql` with the full SQL from the RFC.

Apply with `supabase db reset` (local) or `supabase db push` (remote).

## Non-negotiable rules

1. Migrations are **immutable once applied** — no editing existing files
2. All SQL function messages in **French**
3. All new tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
4. Migration is idempotent (`IF NOT EXISTS`, `OR REPLACE`)

## Checklist before declaring done

- [ ] Migration applies cleanly with `supabase db reset`
- [ ] `profiles` has `birth_date` and `trial_ends_at` columns (nullable)
- [ ] `invoices` table with all constraints and RLS created
- [ ] `notification_logs` with UNIQUE constraint created, no client policies
- [ ] `get_dashboard_snapshot()` returns correct JSON from admin, throws from employee
- [ ] Bucket `invoices` created and private with admin-only policy

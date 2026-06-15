# Implementation Prompt — RFC-001: Project Setup & Database Foundation

## Context

You are implementing **RFC-001** of the WakaBods POC — the complete technical foundation: Nuxt 4.4.2 project setup, all SQL migrations (5 tables, full RLS policies, balance trigger, RPC function), and the TypeScript type definitions.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French** (all user-facing strings must be in French, including SQL error messages).

## What has already been implemented

Nothing. This is the first RFC. The project directory exists but is empty (or contains only a base Nuxt scaffold).

## Your task

Implement everything defined in `RFCs/RFC-001-Project-Setup-Database.md`:

1. Configure `nuxt.config.ts` with `@nuxtjs/supabase` and Tailwind CSS v4
2. Create `app/assets/css/main.css` with Tailwind `@import` and `@theme` brand colors
3. Create `app/types/index.ts` with all business interfaces (Profile, LeaveRequest, LeaveType, LeaveBalance, Team, UserRole, LeaveStatus)
4. Create `app/app.vue` minimal root component
5. Create `.gitignore` that includes `.env`
6. Create all 4 SQL migration files in `supabase/migrations/`:
   - `20260421_001_create_tables.sql`
   - `20260421_002_rls_policies.sql`
   - `20260421_003_trigger_balance.sql`
   - `20260421_004_rpc_functions.sql`

The full SQL for each file is provided in the RFC document. Copy it exactly — do not simplify or restructure.

## Non-negotiable rules

1. **TypeScript strict everywhere** — zero `any`, interfaces in `app/types/index.ts`
2. **No Pinia** — `useState()` Nuxt + composables only
3. **RLS never disabled** — the RLS policies in migration 002 are the security boundary
4. **`SUPABASE_SERVICE_KEY` never client-side** — `.env` only, never in `nuxt.config.ts`
5. **French** for all SQL exception messages (already in the RFC SQL)
6. **Yarn only** — `yarn add`, never `npm install`

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] `yarn nuxt dev` starts without errors
- [ ] `supabase db reset` applies all 4 migrations without errors
- [ ] All 5 tables exist in Supabase Studio with correct columns and constraints
- [ ] RLS is enabled on all 5 tables (visible in Supabase Studio → Authentication → Policies)
- [ ] Trigger `trigger_update_leave_balance` exists (visible in Supabase Studio → Database → Triggers)
- [ ] RPC `create_leave_request` exists (visible in Supabase Studio → Database → Functions)
- [ ] All interfaces in `app/types/index.ts` exported and covering all DB entities
- [ ] `.env` is gitignored, not committed

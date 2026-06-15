# Implementation Prompt — RFC-017: Notification Engine

## Context

You are implementing **RFC-017** — the Supabase Edge Function + pg_cron notification system for birthday, work anniversary, and trial period emails.

WakaBods is a lightweight HR platform built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. Product language: **French**.

## What has already been implemented

RFC-001 through RFC-016 are complete. The `profiles` table has `birth_date` and `trial_ends_at` (RFC-014). The `notification_logs` table with UNIQUE deduplication constraint exists. 

## Your task

Implement all changes in `RFCs/RFC-017-Notification-Engine.md`:

1. `supabase/functions/daily-notifications/index.ts` — Deno Edge Function (full implementation in the RFC)
2. SQL snippet to schedule the pg_cron job (add as a comment in a new migration or a README in the functions directory)
3. `supabase/functions/daily-notifications/.env.example` — list required env vars

**This RFC has no Nuxt/Vue files.** It is purely a backend/infra RFC.

## Two-Phase Approach

### Phase 1 — Planning (No Code)
1. Read `RFCs/RFC-017-Notification-Engine.md` carefully — the Edge Function code is fully specified
2. Identify if any helper utilities are needed
3. Confirm the pg_cron setup steps

### Phase 2 — Implementation
Create the Edge Function file. The code in the RFC is the reference implementation — follow it precisely. Add any missing imports or minor fixes needed for Deno compatibility.

## Non-negotiable rules

1. `RESEND_API_KEY` ONLY in Edge Function env — never in Nuxt code or committed to git
2. `SUPABASE_SERVICE_ROLE_KEY` ONLY in Edge Function env
3. `x-cron-secret` check at the top of the handler — return 401 if missing or wrong
4. Deduplication check before every send — no email sent if log entry exists
5. Email subjects in **French**
6. An error for one employee must NOT abort processing of the others (catch per employee)

## Setup steps for the implementer

```bash
# 1. Deploy the function
supabase functions deploy daily-notifications

# 2. Set secrets
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)

# 3. Enable pg_cron and pg_net extensions via Supabase Dashboard
# 4. Set app.supabase_url and app.cron_secret in DB settings
# 5. Run the cron.schedule() SQL from the RFC
```

## Checklist before declaring done

- [ ] Edge Function deploys without error
- [ ] Manual curl → response JSON with `sent` array
- [ ] Email received at admin address for a birthday set to today
- [ ] Second call same day → empty `sent` array (dedup working)
- [ ] `notification_logs` has 1 row after first call
- [ ] Call without `x-cron-secret` → 401
- [ ] `trial_ends_at = NULL` → no trial email
- [ ] `birth_date = NULL` → no birthday email

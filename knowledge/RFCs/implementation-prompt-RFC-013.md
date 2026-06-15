# Implementation Prompt — RFC-013: Vercel Deployment

## Context

You are implementing **RFC-013** of the WakaBods POC — the final production deployment to Vercel and smoke testing across all 5 demo journeys.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-012 are complete — all features are implemented, polished, and passing typecheck with zero errors, no `console.log`, no `any`, no TODOs.

## Your task

Execute the deployment and smoke test defined in `RFCs/RFC-013-Deployment.md`:

### Pre-deployment

1. Run and confirm:
   ```bash
   yarn nuxt typecheck    # must pass with zero errors
   yarn nuxt build        # must complete successfully
   ```
2. Confirm `.env` is gitignored and not committed
3. Confirm `SUPABASE_SERVICE_KEY` does not appear anywhere in committed files

### Deployment to Vercel

1. Push code to GitHub `main` branch
2. Connect to Vercel: New Project → Import repo → Framework: Nuxt.js (auto-detected)
3. Configure environment variables in Vercel Dashboard (Production + Preview):
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_KEY` = your Supabase anon key
   - **DO NOT** add `SUPABASE_SERVICE_KEY`
4. Trigger deploy (push or manual in dashboard)

### Smoke test (5 journeys)

After deployment is live, execute all 5 journeys from `RFCs/RFC-013-Deployment.md`:

1. **Journey 1** — Employee creates a leave request → confirmed with toast + list updated
2. **Journey 2** — Manager approves at level 1 → status becomes "Validé manager"
3. **Journey 3** — Admin approves at level 2 → status becomes "Approuvé", employee balance updated
4. **Journey 4** — Manager views calendar → approved leaves visible in grid
5. **Journey 5** — Admin creates and disables a leave type → employee form reflects change

## Non-negotiable rules

1. **`SUPABASE_SERVICE_KEY` never in Vercel env** — seed was run locally only
2. **Build must pass before deploy** — do not deploy a broken build
3. **All 5 journeys must complete without HTTP 500 errors**
4. **Smoke test on production URL** — not local

## Checklist before declaring done

- [ ] `yarn nuxt build` completes locally with zero errors
- [ ] Vercel build succeeds (green in dashboard)
- [ ] Production URL loads `/login` in under 2 seconds
- [ ] All 4 demo accounts can log in on production
- [ ] Journey 1: leave request created successfully → "En attente" in list
- [ ] Journey 2: manager approves → "Validé manager"
- [ ] Journey 3: admin approves → "Approuvé", employee balance updated (verify on `/profile`)
- [ ] Journey 4: calendar shows approved leave for correct users
- [ ] Journey 5: admin adds and disables a leave type → employee form reflects change
- [ ] Vercel function logs show no server errors after smoke test
- [ ] `SUPABASE_SERVICE_KEY` NOT in Vercel environment variables (verify in Vercel Dashboard)

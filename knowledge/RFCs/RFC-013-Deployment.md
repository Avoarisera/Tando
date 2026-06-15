# RFC-013 — Vercel Deployment

**ID:** RFC-013  
**Title:** Vercel Deployment + Smoke Test  
**Sprint:** 3  
**Complexity:** Low  
**Predecessor:** RFC-012  
**Successor:** —

---

## Summary

This RFC covers the production deployment of the WakaBods POC to Vercel (Nuxt SSR) connected to the Supabase project, followed by a full smoke test across all 5 demo user journeys. It covers feature **F26**.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F26 | Déploiement Vercel + smoke test | Low |

---

## Dependencies

- **Predecessors:** RFC-012 (all features complete, zero typecheck errors, no TODOs)
- **Successors:** — (final RFC)

---

## Technical Approach

### Pre-deployment checklist

Before deploying, verify locally:

```bash
# 1. TypeScript — zero errors
yarn nuxt typecheck

# 2. Build — must succeed
yarn nuxt build

# 3. No debug artifacts
grep -r "console.log" app/          # must return nothing
grep -r ": any" app/               # must return nothing
grep -r "TODO\|FIXME\|HACK" app/   # must return nothing

# 4. Test with production env vars
NUXT_PUBLIC_SUPABASE_URL=... NUXT_PUBLIC_SUPABASE_KEY=... yarn nuxt build
```

---

### Vercel deployment setup

**Step 1 — Connect repository**

1. Push code to GitHub (main branch)
2. In Vercel Dashboard → New Project → Import repository
3. Framework: Nuxt.js (auto-detected)
4. Build command: `yarn nuxt build` (auto-detected)
5. Output directory: `.output` (auto-detected by Nitro)

**Step 2 — Environment variables in Vercel Dashboard**

Configure for both Production and Preview environments:

| Variable | Value | Note |
|----------|-------|------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | Public |
| `SUPABASE_KEY` | `eyJhbGc...` (anon key) | Public |

**DO NOT add `SUPABASE_SERVICE_KEY` to Vercel.** That key is local-only for seeding.

**Nuxt 4 + Vercel:** Nitro automatically detects Vercel via `VERCEL=1` env var and sets the `vercel` deployment preset. No manual `nuxt.config.ts` changes needed.

**Step 3 — Trigger deployment**

```bash
git push origin main   # triggers Vercel auto-deploy
```

Or manually via Vercel CLI:
```bash
npx vercel --prod
```

---

### Vercel `nuxt.config.ts` additions

For correct SSR behavior on Vercel, ensure the Nuxt config is production-ready:

```ts
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  future: { compatibilityVersion: 4 },
  modules: ['@nuxtjs/supabase'],
  supabase: {
    redirect: false,
  },
  // Nitro auto-detects Vercel — no explicit preset needed
  // but can be forced if needed:
  // nitro: { preset: 'vercel' },
  css: ['~/assets/css/main.css'],
})
```

---

### Smoke test script (5 journeys)

After deployment is live, execute the following manual smoke test with the production URL:

#### Journey 1 — Employé pose un congé

1. Open production URL → `/login` displayed ✓
2. Login as `employee1@waka.com` / `Waka2026!` → redirect to `/profile` ✓
3. Verify profile: "Emma Employée", role "Employé", team "Équipe A", balance 25/5/20 ✓
4. Navigate to `/leave-requests` → history shows 2 seeded requests ✓
5. Click "Nouvelle demande" → modal opens ✓
6. Select "Congé payé", dates 2026-08-01 → 2026-08-05 (5 days) → submit ✓
7. Toast "Demande créée" → new request appears as "En attente" ✓

#### Journey 2 — Manager valide niveau 1

1. Login as `manager@waka.com` / `Waka2026!` → `/leave-requests` ✓
2. "À valider" shows Emma's request ✓
3. Click "Approuver" → confirm modal → confirm ✓
4. Status becomes "Validé manager", request moves to "Historique équipe" ✓
5. Toast "Demande approuvée" ✓

#### Journey 3 — Admin valide niveau 2

1. Login as `admin@waka.com` / `Waka2026!` → `/leave-requests` ✓
2. Filter "Validé manager" → Emma's request visible ✓
3. Click "Approuver" → confirm → status "Approuvé" ✓
4. Toast "Demande approuvée — solde mis à jour" ✓
5. Login back as employee1 → `/profile` → balance now 25/10/15 ✓

#### Journey 4 — Manager consulte calendrier

1. Login as manager → `/calendar` ✓
2. Navigate to August 2026 → Emma's approved leave visible in grid ✓
3. "Absents aujourd'hui" panel visible (may show nothing if not currently August) ✓
4. Prev/next month navigation works ✓

#### Journey 5 — Admin gère les types de congé

1. Login as admin → `/leave-types` ✓
2. Click "Ajouter un type" → fill "Congé exceptionnel" + color → save ✓
3. New type appears in list as "Actif" ✓
4. Login as employee → "Nouvelle demande" → new type appears in dropdown ✓
5. Back as admin → "Désactiver" the new type → grayed out ✓
6. Back as employee → new type no longer in dropdown ✓

---

## Acceptance Criteria

- [ ] `nuxt build` completes with zero errors
- [ ] Vercel deployment succeeds (green build in Vercel Dashboard)
- [ ] Production URL loads `/login` page in < 2 seconds
- [ ] `SUPABASE_URL` and `SUPABASE_KEY` configured in Vercel environment (NOT service key)
- [ ] All 5 smoke test journeys complete without any HTTP 500 errors
- [ ] Login works for all 4 demo accounts on production
- [ ] Full leave validation cycle (pending → manager_approved → approved) works on production
- [ ] Solde updated after admin approval (trigger fires correctly in production DB)
- [ ] Calendar shows correct data for all roles
- [ ] Admin can create and disable leave types on production

---

## Post-deployment verification

Check the Vercel function logs for any server-side errors after smoke testing:

```
Vercel Dashboard → Project → Functions → View logs
```

Common issues to check:
- Supabase connection errors (wrong URL or key)
- RLS policy errors (missing `anon` grants)
- SSR hydration mismatches (should be zero if middleware is server-side)

---

## Rollback procedure

If the production build has a critical bug:

1. In Vercel Dashboard → Deployments → select the previous successful deployment
2. Click "..." → "Promote to Production"
3. Previous build goes live immediately (Vercel keeps deployment history)

---

## Security final checklist

- [ ] `SUPABASE_SERVICE_KEY` is NOT in Vercel environment variables
- [ ] `.env` is in `.gitignore` and not committed
- [ ] Vercel Preview deployments also do NOT include `SUPABASE_SERVICE_KEY`
- [ ] Supabase RLS is enabled on all 5 tables (verify in Supabase Studio → Authentication → Policies)
- [ ] Supabase project is not set to "Bypass RLS" mode

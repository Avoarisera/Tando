# Implementation Prompt — RFC-[ID]: [Title]

## Context

You are implementing **RFC-[ID]** of the WakaBods POC — [brief description].

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French** (all user-facing strings must be in French).

## What has already been implemented

Everything defined in the preceding RFCs (RFC-001 through RFC-[ID-1]) is complete and working. Build on that foundation without re-implementing anything already done.

## Your task

Implement all features defined in RFC-[ID]. Refer to the RFC document at `RFCs/RFC-[ID]-[Title].md` for full specifications, acceptance criteria, and technical details.

## Non-negotiable rules

1. **TypeScript strict everywhere** — zero `any`, interfaces in `app/types/index.ts`
2. **No Pinia** — `useState()` Nuxt + composables only
3. **RLS never disabled** — fix the policy, never bypass it
4. **`SUPABASE_SERVICE_KEY` never client-side** — local seed only
5. **4 mandatory UI states** on every async section: loading → error → empty → content
6. **French** for all user-facing strings including SQL error messages
7. **Zero placeholders** — `TODO`, `any`, `console.log` forbidden in delivered code
8. **Consult PRD + features** before implementing — do not assume behavior

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] 4 UI states present on every async section (loading, error, empty, content)
- [ ] Responsive verified at 375px and 1280px
- [ ] No `console.log`, `TODO`, or `any` remaining
- [ ] All acceptance criteria from `RFCs/RFC-[ID]-[Title].md` are satisfied
- [ ] Manual test with demo accounts confirms the happy path works end-to-end

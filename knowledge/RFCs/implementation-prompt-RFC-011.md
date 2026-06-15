# Implementation Prompt — RFC-011: Leave Types Management

## Context

You are implementing **RFC-011** of the WakaBods POC — the admin-only `/leave-types` page with list, create/edit modal, and active/inactive toggle.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-010 are complete:
- `useLeaveTypes` composable exists (fetches active types)
- `AppModal`, `AppButton`, `AppBadge`, `useToast` exist
- Stub `app/pages/leave-types.vue` exists with `definePageMeta({ middleware: 'admin-only', layout: 'private' })`
- `leave_types_insert_admin` and `leave_types_update_admin` RLS policies are active

## Your task

Implement everything defined in `RFCs/RFC-011-Leave-Types-Management.md`:

1. **Extend `app/composables/useLeaveTypes.ts`** — add `createLeaveType(name, color)`, `updateLeaveType(id, name, color)`, `toggleLeaveType(id, isActive)`; update `fetchLeaveTypes` to support `activeOnly = false` for admin view

2. **`app/pages/leave-types.vue`** — replaces stub:
   - On mount: `fetchLeaveTypes(false)` (load all, active + inactive)
   - "Ajouter un type" button → opens create modal
   - Table with columns: Couleur (5×5 color circle), Nom, Statut (AppBadge green/gray), Actions (Modifier + Désactiver/Activer)
   - Inactive rows shown at `opacity-50`
   - Warning banner when ALL types are inactive
   - "Modifier" button → opens edit modal with pre-filled values
   - "Désactiver"/"Activer" button → calls `toggleLeaveType`, shows toast, refreshes list
   - 4 UI states (loading/error/empty/table)

3. **Leave type form modal** (inline in leave-types.vue or as a sub-component):
   - Title: "Ajouter un type de congé" or "Modifier le type de congé"
   - Fields: name (text input, required), color (`<input type="color">`)
   - Pre-filled when editing (`watch(editingType, ...)`)
   - Submit disabled when name is empty
   - Inline `formError` for server errors (modal stays open)
   - Success: toast + modal closes + list refreshes

## Non-negotiable rules

1. **`definePageMeta({ middleware: 'admin-only', layout: 'private' })`** must remain on the page
2. **`fetchLeaveTypes(false)`** on the admin page — show ALL types (active and inactive), not just active
3. **No delete button** — deletion is out of scope (referential integrity risk)
4. **No confirmation modal for toggle** — it's immediately reversible
5. **`<input type="color">`** for color selection — native, no library
6. **4 UI states** on the types table

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Login as admin → `/leave-types` shows all 4 seeded types
- [ ] "Ajouter un type" → fill name + pick color → save → appears in table, toast shown
- [ ] "Modifier" on existing type → modal pre-filled → change name → save → updated in table
- [ ] "Désactiver" on active type → type grayed out, badge shows "Inactif"
- [ ] Login as employee → "Nouvelle demande" → disabled type not in dropdown
- [ ] Login as admin → "Activer" the type → it reappears as active
- [ ] Warning banner shown when all types are inactive
- [ ] Login as manager → accessing `/leave-types` → 403 page (middleware enforced)
- [ ] Responsive at 375px and 1280px

# RFC-012 — Global UI States & Error Pages

**ID:** RFC-012  
**Title:** UI State Audit, AppSpinner, and 404 Error Page  
**Sprint:** 3  
**Complexity:** Medium  
**Predecessor:** RFC-011  
**Successor:** RFC-013

---

## Summary

This RFC ensures full coverage of the mandatory 4-state UI pattern (loading → error → empty → content) across every async section of the application, adds an `AppSpinner` component for button loading states, and implements the Nuxt `error.vue` page for 404 and unhandled errors. It covers features **F27** and **F28**.

This RFC is an audit + completion pass — some components were introduced earlier (RFC-005), but this RFC formalizes their usage and fills any gaps.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F27 | États UI globaux (loading / erreur / vide / succès) | Medium |
| F28 | Page 404 (`app/error.vue`) | Low |

---

## Dependencies

- **Predecessors:** RFC-011 (all features implemented; this is the final polish pass)
- **Successors:** RFC-013 (deployment)

---

## Technical Approach

### Files created/modified in this RFC

```
app/
├── error.vue                         ← NEW: 404 + global error handler
└── components/
    └── app/
        └── AppSpinner.vue            ← NEW: spinner component
```

**Audit tasks** (no new files, just verification and fixes):
- Every `await supabase...` block has loading, error, empty, and content states
- Every submit button uses `AppSpinner` + `disabled` during async operations
- Every page section that loads data has `AppSkeleton`, `AppErrorBanner`, and `AppEmptyState`

---

### AppSpinner.vue

```vue
<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md'
  color?: 'white' | 'gray'
}>(), {
  size: 'sm',
  color: 'white',
})
</script>

<template>
  <span
    :class="[
      'inline-block animate-spin rounded-full border-2 border-t-transparent',
      size === 'sm' ? 'w-4 h-4' : 'w-5 h-5',
      color === 'white' ? 'border-white' : 'border-gray-400',
    ]"
    aria-hidden="true"
  />
</template>
```

Used in all button loading states:

```vue
<AppButton :disabled="isSubmitting" @click="handleSubmit">
  <span v-if="isSubmitting" class="flex items-center gap-2">
    <AppSpinner /> Envoi en cours…
  </span>
  <span v-else>Envoyer</span>
</AppButton>
```

---

### F28 — app/error.vue (404 + global errors)

Nuxt's native error handling file. Handles 404 for unknown routes and any unhandled `createError()` exceptions.

```vue
<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const user = useSupabaseUser()

const is404 = computed(() => props.error.statusCode === 404)
const is403 = computed(() => props.error.statusCode === 403)

const title = computed(() => {
  if (is404.value) return 'Page introuvable'
  if (is403.value) return 'Accès refusé'
  return 'Une erreur est survenue'
})

const description = computed(() => {
  if (is404.value) return 'La page que vous cherchez n\'existe pas ou a été déplacée.'
  if (is403.value) return 'Vous n\'avez pas les droits nécessaires pour accéder à cette page.'
  return props.error.message || 'Veuillez réessayer ou contacter votre administrateur.'
})

const homeLink = computed(() => user.value ? '/profile' : '/login')

function handleError() {
  clearError({ redirect: homeLink.value })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full text-center">
      <p class="text-6xl font-bold text-brand-primary mb-4">
        {{ error.statusCode ?? '?' }}
      </p>
      <h1 class="text-2xl font-semibold text-gray-900 mb-2">{{ title }}</h1>
      <p class="text-gray-500 mb-8">{{ description }}</p>
      <AppButton @click="handleError">
        Retour à l'accueil
      </AppButton>
    </div>
  </div>
</template>
```

**Key behaviors:**
- `clearError({ redirect: ... })` is the Nuxt-idiomatic way to dismiss the error and redirect
- Redirects to `/profile` if authenticated, `/login` otherwise
- Works for 404 (unknown routes), 403 (from `admin-only` middleware), and any `createError()` throw

---

### F27 — UI State Audit Checklist

For each async section, verify all 4 states are present:

#### `/profile` (RFC-005)

| Section | Loading | Error | Empty | Content |
|---------|---------|-------|-------|---------|
| Profile card | `AppSkeleton` × 4 | `AppErrorBanner` + retry | — | profile data |
| Leave balances | `AppSkeleton` × 3 | `AppErrorBanner` + retry | `AppEmptyState` "Aucun solde" | `LeaveBalanceCard` list |

#### `/leave-requests` — Employee view (RFC-007/008)

| Section | Loading | Error | Empty | Content |
|---------|---------|-------|-------|---------|
| Request list | `AppSkeleton` × 5 | `AppErrorBanner` + retry | `AppEmptyState` + CTA button | `LeaveRequestTable` |

#### `/leave-requests` — Manager view (RFC-008)

| Section | Loading | Error | Empty | Content |
|---------|---------|-------|-------|---------|
| "À valider" | `AppSkeleton` | `AppErrorBanner` | "Aucune demande en attente" text | pending table |
| Team balances | `AppSkeleton` | `AppErrorBanner` | "Aucun solde" | balance table |
| Historique équipe | shared with fetch | shared | "Aucune demande" | full history table |

#### `/leave-requests` — Admin view (RFC-009)

| Section | Loading | Error | Empty | Content |
|---------|---------|-------|-------|---------|
| Request table | `AppSkeleton` × 5 | `AppErrorBanner` + retry | `AppEmptyState` "Aucune demande" | filtered table |

#### `/calendar` (RFC-010)

| Section | Loading | Error | Content |
|---------|---------|-------|---------|
| Calendar grid | `AppSkeleton` full-height | `AppErrorBanner` + retry | `CalendarGrid` |

#### `/leave-types` (RFC-011)

| Section | Loading | Error | Empty | Content |
|---------|---------|-------|-------|---------|
| Types table | `AppSkeleton` × 4 | `AppErrorBanner` + retry | `AppEmptyState` | table |

---

### Skeleton sizing guidelines

Skeletons must approximate the shape of the content they replace to avoid layout shift:

```vue
<!-- Profile card skeleton -->
<div class="space-y-3">
  <AppSkeleton class="h-6 w-48" />    <!-- name -->
  <AppSkeleton class="h-4 w-64" />    <!-- email -->
  <AppSkeleton class="h-5 w-20" />    <!-- role badge -->
  <AppSkeleton class="h-4 w-32" />    <!-- team -->
</div>

<!-- Table row skeleton -->
<AppSkeleton v-for="i in 5" :key="i" class="h-12 w-full mb-2" />
```

---

## Acceptance Criteria

### F27 — Global UI States

- [ ] Every page with async data shows a skeleton during initial load
- [ ] Every async section shows `AppErrorBanner` with retry when fetch fails
- [ ] Every empty list shows `AppEmptyState` with contextual message and CTA where appropriate
- [ ] Every submit/action button shows `AppSpinner` and is disabled during async operation
- [ ] Success mutations trigger a toast (3s auto-dismiss)
- [ ] Error mutations trigger a persistent error toast OR inline form error (never silent)
- [ ] No `console.log` statements remain in any component or composable
- [ ] No `any` type anywhere in the codebase

### F28 — Error Page

- [ ] Navigating to `/undefined-route` → `error.vue` renders with "Page introuvable" (404)
- [ ] Employee accessing `/leave-types` → `error.vue` renders with "Accès refusé" (403)
- [ ] "Retour à l'accueil" button → redirects to `/profile` when authenticated
- [ ] "Retour à l'accueil" button → redirects to `/login` when not authenticated
- [ ] Error page uses consistent brand styling (no raw browser error page)

---

## TypeScript Compliance Audit

Run `yarn nuxt typecheck` and fix all errors. Common issues to check:

```bash
yarn nuxt typecheck
```

Known areas to verify:
- Joined Supabase query return types (use explicit cast or type assertion)
- `readonly()` refs accessed with `.value` correctly
- `profile.value!.id` — ensure `!` non-null assertions are only used where truly safe
- Event emit types in components

---

## Testing Strategy

1. Throttle network to "Slow 3G" in DevTools → verify skeletons appear on all pages
2. Block Supabase URL in DevTools Network → verify error banners appear on all pages with retry buttons
3. Click retry after error → data loads correctly
4. Navigate to `/nonexistent` → 404 page with correct message
5. Login as employee → navigate to `/leave-types` → 403 page
6. Run `yarn nuxt typecheck` → zero errors
7. Grep codebase for `console.log` → zero results in `app/` directory
8. Grep codebase for `: any` → zero explicit `any` types

# Implementation Prompt — RFC-006: Shared UI Components (Toast + Confirm Modal)

## Context

You are implementing **RFC-006** of the WakaBods POC — the global toast notification system and the reusable confirmation modal. These are prerequisites for all mutation actions in the app.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-005 are complete:
- Full auth, layout, profile page working
- `AppButton`, `AppSkeleton`, `AppErrorBanner`, `AppEmptyState`, `AppBadge` components exist
- `app/layouts/private.vue` exists

## Your task

Implement everything defined in `RFCs/RFC-006-Shared-UI-Components.md`:

1. **`app/components/app/AppModal.vue`** — base modal: backdrop with `@click.self` close, dialog with `role="dialog"` + `aria-modal="true"`, Escape key listener, title header, close button, default slot for content

2. **`app/components/app/AppConfirmModal.vue`** — uses `AppModal`: displays description prop, "Confirmer" and "Annuler" buttons, spinner on Confirmer during async, emits `confirm` and `cancel`

3. **`app/composables/useToast.ts`** — global toast state via `useState('toasts')`, `add(message, type)`, `remove(id)`, success auto-dismisses after 3s, error persists, max 3 toasts (oldest evicted)

4. **`app/components/app/AppToast.vue`** — single toast: green (success) or red (error), dismiss button, `role="alert"`

5. **`app/components/app/AppToastContainer.vue`** — `Teleport to="body"`, positioned `fixed bottom-4 right-4`, lists all toasts with `TransitionGroup` enter/leave animation

6. **Update `app/layouts/private.vue`** — add `<AppToastContainer />` at the end of the template

## Non-negotiable rules

1. **Toast system via `useState('toasts')`** — not local state, global and shared across all components
2. **Escape key and backdrop click close modal** — both required for accessibility
3. **`role="dialog"` + `aria-modal="true"`** on the dialog element
4. **Max 3 toasts** — oldest evicted when exceeded
5. **Error toasts persist** — only success auto-dismisses (3s)
6. **French default labels** — "Confirmer" and "Annuler" as defaults, overridable via props

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] `useToast().add('Test')` renders a green toast that auto-dismisses after 3 seconds
- [ ] `useToast().add('Erreur', 'error')` renders a red toast that persists
- [ ] Manual close (✕) button dismisses any toast immediately
- [ ] 4 simultaneous toasts → only 3 shown (oldest removed)
- [ ] `AppConfirmModal` renders with title, description, two buttons
- [ ] Clicking "Confirmer" shows spinner and disables the button
- [ ] Clicking "Annuler" or backdrop or pressing Escape closes the modal
- [ ] `AppToastContainer` is in `layouts/private.vue` and toasts appear above all other content
- [ ] Toast transition is smooth (200ms)

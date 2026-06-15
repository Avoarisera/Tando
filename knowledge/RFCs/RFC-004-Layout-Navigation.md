# RFC-004 — Layout & Navigation

**ID:** RFC-004  
**Title:** Private Layout with Responsive Sidebar Navigation  
**Sprint:** 1  
**Complexity:** Medium  
**Predecessor:** RFC-003  
**Successor:** RFC-005

---

## Summary

This RFC implements the shared layout used by all authenticated pages: a fixed sidebar on desktop and a hamburger drawer on mobile. Navigation links are filtered by user role. This covers feature **F08**.

All pages built in subsequent RFCs will use `definePageMeta({ layout: 'private' })` and rely on this layout.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F08 | Navigation principale responsive (rôle-aware) | Medium |

---

## Dependencies

- **Predecessors:** RFC-003 (`useCurrentUser` composable and auth session)
- **Successors:** RFC-005 and all page RFCs — every private page uses this layout

---

## Technical Approach

### Files created in this RFC

```
app/
├── layouts/
│   └── private.vue                  ← Main layout
└── components/
    ├── nav/
    │   ├── AppSidebar.vue           ← Desktop sidebar
    │   └── AppMobileDrawer.vue      ← Mobile hamburger drawer
    └── app/
        └── AppButton.vue            ← Generic button component (needed by nav)
```

---

### Layout architecture

```
private.vue
├── AppSidebar       (lg:flex, hidden on mobile)
├── AppMobileDrawer  (flex on mobile, lg:hidden)
└── <slot />         (page content)
```

**`layouts/private.vue`** structure:

```vue
<script setup lang="ts">
const { profile, loadProfile, isAdmin } = useCurrentUser()

onMounted(() => loadProfile())
</script>

<template>
  <div class="flex min-h-screen bg-gray-50">
    <!-- Desktop sidebar -->
    <AppSidebar class="hidden lg:flex" />

    <!-- Mobile drawer -->
    <AppMobileDrawer />

    <!-- Page content -->
    <main class="flex-1 min-w-0 p-6">
      <slot />
    </main>
  </div>
</template>
```

---

### Navigation link definitions

Define a computed nav items array based on role:

```ts
// In AppSidebar.vue and AppMobileDrawer.vue (shared logic)
const navItems = computed(() => {
  const base = [
    { label: 'Profil',            to: '/profile' },
    { label: 'Demandes de congé', to: '/leave-requests' },
    { label: 'Calendrier',        to: '/calendar' },
  ]
  if (isAdmin.value) {
    base.push({ label: 'Types de congé', to: '/leave-types' })
  }
  return base
})
```

---

### AppSidebar.vue (desktop)

**Layout specs:**
- `w-60` (240px), `min-h-screen`, fixed position, `bg-white`, `border-r border-gray-200`
- WakaBods logo/brand at top
- Nav links in the middle
- Déconnexion button pinned to bottom

**Active link detection:**

```ts
const route = useRoute()
const isActive = (path: string) => route.path === path
```

Active link classes: `bg-brand-primary/10 text-brand-primary font-medium`  
Inactive link classes: `text-gray-600 hover:bg-gray-100`

**Component props:** none — reads from `useCurrentUser()` directly (layout component, business logic allowed)

---

### AppMobileDrawer.vue (mobile)

**Behavior:**
- Hamburger button (☰) visible in a top bar on mobile, hidden on `lg:`
- Click opens a full-height overlay drawer from the left
- Drawer closes automatically after navigation (watch `useRoute().path`)
- Click on the overlay backdrop also closes the drawer
- Escape key closes the drawer

**State:**
```ts
const isOpen = ref(false)
const route = useRoute()

watch(() => route.path, () => { isOpen.value = false })
```

**Overlay:** `fixed inset-0 bg-black/30 z-40` (behind drawer)  
**Drawer:** `fixed top-0 left-0 h-full w-72 bg-white z-50 shadow-xl`

**Accessibility:**
- Hamburger button has `aria-label="Ouvrir le menu"`
- Drawer has `role="dialog"` + `aria-modal="true"`
- Focus is trapped inside the drawer when open (Tab key stays within)

---

### AppButton.vue (generic)

Used throughout the app. Defined here as it's needed by the nav logout button.

```vue
<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit'
}>(), {
  variant: 'primary',
  disabled: false,
  type: 'button',
})
</script>
```

Variant classes:
- `primary`: `bg-brand-primary text-white hover:bg-blue-700`
- `secondary`: `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50`
- `danger`: `bg-brand-danger text-white hover:bg-red-700`
- `ghost`: `text-gray-600 hover:bg-gray-100`

All variants: `inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

---

### Stub pages (placeholder content only)

To make routing and layout testable after this RFC, create empty stub pages for all private routes:

```
app/pages/profile.vue         → definePageMeta({ layout: 'private' }) + "Profil — à venir"
app/pages/leave-requests.vue  → definePageMeta({ layout: 'private' }) + "Demandes — à venir"
app/pages/calendar.vue        → definePageMeta({ layout: 'private' }) + "Calendrier — à venir"
app/pages/leave-types.vue     → definePageMeta({ middleware: 'admin-only', layout: 'private' }) + "Types — à venir"
```

These stubs will be replaced in subsequent RFCs. They just need `definePageMeta` set correctly and a visible heading so testers can confirm navigation works.

---

## Acceptance Criteria

- [ ] Private layout renders on all four private routes
- [ ] Desktop (≥ 1280px): sidebar visible, 240px wide, fixed to the left
- [ ] Mobile (≤ 375px): sidebar hidden, hamburger button visible in top bar
- [ ] Hamburger click opens drawer overlay; link click or back-tap closes it
- [ ] Employee/Manager nav: Profil, Demandes de congé, Calendrier, Déconnexion
- [ ] Admin nav: same + Types de congé
- [ ] Active route link is visually highlighted (different background/color)
- [ ] Déconnexion button calls `signOut()` from `useCurrentUser`
- [ ] After logout, redirect to `/login` and nav is no longer accessible
- [ ] No layout flash or skeleton on initial load (role resolved before render or skeleton shown)
- [ ] Drawer closes when navigating to a new route
- [ ] Drawer has `role="dialog"` and `aria-modal="true"`

---

## Responsive Breakpoints

| Viewport | Sidebar | Mobile Bar | Drawer |
|----------|---------|------------|--------|
| < 1024px | `hidden` | visible | triggered by hamburger |
| ≥ 1024px (`lg:`) | `flex` | `hidden` | — |

---

## Testing Strategy

1. Log in as employee → confirm nav has Profil, Demandes, Calendrier, Déconnexion (no Types)
2. Log in as admin → confirm nav has Types de congé link
3. On mobile viewport (375px): hamburger visible, sidebar hidden, drawer opens on click
4. Click a nav link in the drawer → drawer closes, correct page loaded
5. Click Déconnexion → redirected to `/login`
6. Resize from desktop to mobile → sidebar hides, hamburger appears without page reload

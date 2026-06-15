# RFC-003 — Authentication & Routing

**ID:** RFC-003  
**Title:** Authentication (Login, Auth Guard, Admin Guard, Logout)  
**Sprint:** 1  
**Complexity:** Low  
**Predecessor:** RFC-002  
**Successor:** RFC-004

---

## Summary

This RFC implements the complete authentication boundary for WakaBods: the login page, the global route protection middleware, the admin-only route guard, and the logout action. It covers features **F01, F02, F03, F04**.

After this RFC, all four demo accounts can log in, routes are protected, and users can log out.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F01 | Login page (`/login`) | Low |
| F02 | Global auth middleware (`auth.global.ts`) | Low |
| F03 | Admin-only middleware (`admin-only.ts`) | Low |
| F04 | Logout action | Low |

---

## Dependencies

- **Predecessors:** RFC-002 (demo accounts must exist to test login)
- **Successors:** RFC-004 (layout needs auth working to resolve user roles)

---

## Technical Approach

### File structure created in this RFC

```
app/
├── pages/
│   └── login.vue                   ← F01
├── middleware/
│   ├── auth.global.ts              ← F02
│   └── admin-only.ts               ← F03
└── composables/
    └── useCurrentUser.ts           ← Shared, needed by F03 and F04
```

---

### F01 — Login Page (`app/pages/login.vue`)

**Route:** `/login` (public, no layout)

The page must redirect to `/profile` if already authenticated (checked in `auth.global.ts`).

**Component structure:**

```vue
<script setup lang="ts">
definePageMeta({ layout: false })  // No private layout on public page

const supabase = useSupabaseClient()
const router = useRouter()

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

async function handleSubmit() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (error) throw error
    await router.push('/profile')
  } catch {
    errorMessage.value = 'Identifiants incorrects. Veuillez réessayer.'
  } finally {
    isLoading.value = false
  }
}
</script>
```

**Template requirements:**
- Centered card on a light gray background
- WakaBods logo/title at top
- Email input (`type="email"`, `id="email"`, `autocomplete="email"`) with `<label for="email">`
- Password input (`type="password"`, `id="password"`, `autocomplete="current-password"`) with label
- Error message div: `v-if="errorMessage"` with red styling
- Submit button: disabled when `isLoading`, shows spinner when loading
- No "Mot de passe oublié" link (out of scope)

**Error message policy:** The same message is shown regardless of whether the email is unknown or the password is incorrect (security: avoid user enumeration).

---

### F02 — Global Auth Middleware (`app/middleware/auth.global.ts`)

```ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  const publicRoutes = ['/login']

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login')
  }
  if (user.value && to.path === '/login') {
    return navigateTo('/profile')
  }
})
```

**Notes:**
- The `.global.ts` suffix makes Nuxt apply this middleware to every route automatically
- `useSupabaseUser()` is reactive and SSR-safe via `@nuxtjs/supabase` — no manual JWT handling needed
- This middleware runs server-side on first request, preventing flash of private content

---

### F03 — Admin-Only Middleware (`app/middleware/admin-only.ts`)

```ts
export default defineNuxtRouteMiddleware(async () => {
  const { profile, loadProfile } = useCurrentUser()
  await loadProfile()
  if (!profile.value || profile.value.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }
})
```

Applied only to `/leave-types` via `definePageMeta` (implemented in RFC-011):

```vue
<!-- app/pages/leave-types.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin-only', layout: 'private' })
</script>
```

---

### F04 — Logout Action (via `useCurrentUser`)

The logout logic lives in `useCurrentUser.ts` and is called from the navigation component (implemented in RFC-004).

```ts
// app/composables/useCurrentUser.ts
export function useCurrentUser() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('current-profile', () => null)

  async function loadProfile() {
    if (profile.value || !user.value) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    profile.value = data
  }

  async function signOut() {
    await supabase.auth.signOut()
    // Clear all global state to prevent data leaking between sessions
    useState('current-profile').value = null
    useState('leave-requests').value = []
    useState('leave-balances').value = []
    useState('leave-types').value = []
    useState('toasts').value = []
    await navigateTo('/login')
  }

  const isAdmin    = computed(() => profile.value?.role === 'admin')
  const isManager  = computed(() => profile.value?.role === 'manager')
  const isEmployee = computed(() => profile.value?.role === 'employee')

  return {
    user,
    profile: readonly(profile),
    isAdmin,
    isManager,
    isEmployee,
    loadProfile,
    signOut,
  }
}
```

**State invalidation on logout:** All `useState` keys must be cleared to prevent one user's data being shown to the next user on the same browser session.

---

## Acceptance Criteria

### F01 — Login

- [ ] Page at `/login` with email and password fields, each with `<label>` and correct `for`/`id`
- [ ] Button disabled and spinner shown during Supabase request
- [ ] Successful login with `admin@waka.com` / `Waka2026!` → redirect to `/profile`
- [ ] Successful login with `employee1@waka.com` / `Waka2026!` → redirect to `/profile`
- [ ] Failed login → French error message, no redirect
- [ ] Already authenticated user visiting `/login` → redirect to `/profile`

### F02 — Auth Guard

- [ ] Unauthenticated access to `/profile` → redirect to `/login`
- [ ] Unauthenticated access to `/leave-requests` → redirect to `/login`
- [ ] Unauthenticated access to `/calendar` → redirect to `/login`
- [ ] Unauthenticated access to `/leave-types` → redirect to `/login`
- [ ] Authenticated user accessing `/login` → redirect to `/profile`

### F03 — Admin Guard

- [ ] Authenticated `employee` accessing `/leave-types` → 403 error page
- [ ] Authenticated `manager` accessing `/leave-types` → 403 error page
- [ ] Authenticated `admin` accessing `/leave-types` → page loads (no error)

### F04 — Logout

- [ ] `signOut()` calls `supabase.auth.signOut()`
- [ ] All `useState` caches cleared after logout
- [ ] Redirect to `/login` after logout
- [ ] Accessing a private route after logout → redirect to `/login`

---

## Data Flow

```
User submits login form
  → supabase.auth.signInWithPassword()
    → success: Supabase sets httpOnly cookie with JWT
    → middleware auth.global.ts: useSupabaseUser() becomes truthy
    → router.push('/profile')
  → failure: errorMessage displayed inline

User clicks Déconnexion
  → supabase.auth.signOut()
    → Supabase clears JWT cookie
    → useState caches cleared
    → navigateTo('/login')
```

---

## Security Notes

- JWT is managed in httpOnly cookies by `@nuxtjs/supabase` — never in `localStorage`
- Role is never read from the JWT; always fetched from `profiles` via `loadProfile()`
- Error message on login failure is generic to prevent user enumeration
- `admin-only` middleware is server-side: even if the nav link is hidden, direct URL access is blocked

---

## Testing Strategy

1. Visit `/profile` without logging in → should redirect to `/login`
2. Submit login form with wrong credentials → French error message displayed
3. Login with `admin@waka.com` → redirected to `/profile`
4. While logged in as employee, navigate to `/leave-types` → 403 error
5. Log out → all state cleared, redirect to `/login`
6. After logout, hit browser Back button → `/login` shown again (not cached private page)

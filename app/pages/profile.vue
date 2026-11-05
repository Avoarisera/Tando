<script setup lang="ts">
definePageMeta({ titleKey: 'nav.profile', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const supabaseUser = useSupabaseUser()
const { profile, loadProfile, isAdmin } = useCurrentUser()
const { balances, isLoading: balancesLoading, error: balancesError, fetchBalances } = useLeaveBalances()
const { requests: mine, fetchMine } = useMyLeave()
const toast = useToast()
const { choice: theme } = useTheme()
const themeOptions = computed(() => [
  { value: 'light', label: t('profile.themeLight'), icon: 'sun' },
  { value: 'dark', label: t('profile.themeDark'), icon: 'moon' },
  { value: 'system', label: t('profile.themeSystem'), icon: 'monitor' },
])

const teamName = ref<string | null>(null)
const year = new Date().getFullYear()

async function loadTeamName() {
  if (!profile.value?.team_id) return
  const { data } = await supabase.from('teams').select('name').eq('id', profile.value.team_id).single()
  teamName.value = data?.name ?? null
}

async function loadBalances() {
  await Promise.all([fetchBalances(), fetchMine()])
}

onMounted(async () => {
  await loadProfile()
  await Promise.all([loadTeamName(), isAdmin.value ? Promise.resolve() : loadBalances()])
})

const name = computed(() => (profile.value ? fullName(profile.value) : ''))
const email = computed(() => supabaseUser.value?.email ?? '')
const subtitle = computed(() => [profile.value ? t(`roles.${profile.value.role}`) : '', teamName.value ?? t('profile.allCompany'), profile.value?.country ? t(`countries.${profile.value.country}`) : ''].filter(Boolean).join(' · '))
const joined = computed(() => (profile.value?.joined_at ? fmtDate(profile.value.joined_at, tag.value, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''))

const rows = computed(() => balances.value.map((b) => {
  const reserved = reservedDays(mine.value, b.leave_type_id, year)
  return { id: b.id, name: b.leave_types.name, color: b.leave_types.color, allocated: b.allocated_days, used: b.used_days, reserved, left: b.allocated_days - b.used_days - reserved }
}))

// Password change: the current password is checked by signing in again first
const currentPw = ref('')
const newPw = ref('')
const pwSubmitted = ref(false)
const pwSaving = ref(false)
const pwError = ref<string | null>(null)
const newPwError = computed(() => (pwSubmitted.value && !isPasswordValid(newPw.value) ? t('auth.reset.tooWeak') : null))

async function changePassword() {
  pwSubmitted.value = true
  pwError.value = null
  if (newPwError.value || !currentPw.value || !email.value) return
  pwSaving.value = true
  try {
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.value, password: currentPw.value })
    if (authError) {
      pwError.value = t('profile.wrongCurrent')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPw.value })
    if (error) {
      pwError.value = t('auth.reset.error')
      return
    }
    currentPw.value = ''
    newPw.value = ''
    pwSubmitted.value = false
    toast.add(t('profile.passwordChanged'))
  }
  finally {
    pwSaving.value = false
  }
}
</script>

<template>
  <div class="wb-page wb-stack">
    <section class="wb-card wb-card-b wb-prof-id">
      <WbAvatar :name="name || '?'" :size="56" />
      <div class="wb-grow">
        <h2 class="h2">{{ name }}</h2>
        <p class="small wb-mut2">{{ subtitle }}</p>
      </div>
      <dl class="wb-prof-kv small">
        <div><dt class="wb-mut">{{ t('v1.email') }}</dt><dd>{{ email }}</dd></div>
        <div v-if="joined"><dt class="wb-mut">{{ t('v1.joined') }}</dt><dd class="wb-num">{{ joined }}</dd></div>
      </dl>
      <p class="caption wb-mut wb-prof-hint">{{ t('profile.identityHint') }}{{ isAdmin ? ` ${t('v1.adminNoBalance')}` : '' }}</p>
    </section>

    <div :class="['wb-split wb-prof-grid', { 'is-admin': isAdmin }]">

    <div v-if="!isAdmin" class="wb-stack">
    <WbCard :title="t('profile.balances', { year })" :pad="false">
      <div v-if="balancesError" class="wb-card-b"><WbErrorState :message="balancesError" @retry="loadBalances" /></div>
      <div v-else-if="balancesLoading && !rows.length" class="wb-card-b"><WbSkeleton variant="table" :count="3" /></div>
      <p v-else-if="!rows.length" class="wb-card-b wb-mut">{{ t('home.welcomeText') }}</p>
      <div v-else class="wb-scroll wb-dt">
        <table>
          <caption class="wb-sr">{{ t('profile.balances', { year }) }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ t('balance.type') }}</th>
              <th scope="col" class="is-r">{{ t('balance.allocated') }}</th>
              <th scope="col" class="is-r">{{ t('balance.used') }}</th>
              <th scope="col" class="is-r">{{ t('balance.reserved') }}</th>
              <th scope="col" class="is-r">{{ t('balance.left') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td><WbTypeBadge :name="r.name" :color="r.color" /></td>
              <td class="is-r wb-num">{{ r.allocated }}</td>
              <td class="is-r wb-num">{{ r.used }}</td>
              <td class="is-r wb-num">{{ r.reserved }}</td>
              <td class="is-r wb-num" :class="{ 'wb-c-danger': r.left <= 0 }"><b>{{ r.left }}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </WbCard>
    </div>

    <div class="wb-stack">
      <WbCard :title="t('profile.preferences')">
        <div class="wb-stack-s">
          <WbLangSelect with-label />
          <div class="wb-field">
            <span class="wb-label">{{ t('profile.theme') }}</span>
            <WbSegmented v-model="theme" :options="themeOptions" :label="t('profile.theme')" />
          </div>
          <WbInput :label="t('profile.dateFormat')" :model-value="t('profile.dateFormatAuto')" readonly />
        </div>
      </WbCard>

      <WbCard :title="t('profile.security')">
        <form class="wb-stack-s" novalidate @submit.prevent="changePassword">
          <WbBanner v-if="pwError" tone="danger">{{ pwError }}</WbBanner>
          <WbPasswordInput id="current-password" v-model="currentPw" :label="t('profile.currentPassword')" autocomplete="current-password" />
          <WbPasswordInput id="new-password" v-model="newPw" :label="t('auth.reset.password')" autocomplete="new-password" :hint="t('auth.reset.hint')" :error="newPwError" />
          <div><WbButton type="submit" variant="secondary" :loading="pwSaving" :disabled="!currentPw || !newPw">{{ t('profile.changePassword') }}</WbButton></div>
        </form>
      </WbCard>
    </div>
    </div>
  </div>
</template>

<style scoped>
.wb-prof-id { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }
.wb-prof-kv { display: flex; gap: var(--space-6); margin: 0; flex-wrap: wrap; }
.wb-prof-kv dd { margin: 2px 0 0; color: var(--ink); }
.wb-prof-hint { flex-basis: 100%; margin-top: calc(-1 * var(--space-2)); }
/* Admin: no balance column, preferences and security side by side */
.wb-prof-grid.is-admin { grid-template-columns: minmax(0, 1fr); }
@container wbapp (min-width: 1024px) {
  .wb-prof-grid.is-admin > .wb-stack { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
}
</style>

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
const subtitle = computed(() => [profile.value ? t(`roles.${profile.value.role}`) : '', teamName.value ?? t('profile.allCompany')].filter(Boolean).join(' · '))
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
    <WbCard :title="t('profile.identity')" :subtitle="t('profile.identityHint')">
      <div class="is-row" style="gap: 16px; flex-wrap: wrap">
        <WbAvatar :name="name || '?'" :size="64" />
        <div class="wb-grow" style="min-width: 200px">
          <p class="h2">{{ name }}</p>
          <p class="wb-mut2">{{ subtitle }}</p>
          <p class="small wb-mut">{{ email }}</p>
          <p v-if="joined" class="small wb-mut">{{ t('profile.joined', { date: joined }) }}</p>
        </div>
      </div>
    </WbCard>

    <WbCard v-if="!isAdmin" :title="t('profile.balances', { year })" :pad="false">
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

    <div class="wb-grid wb-cols-2">
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
</template>

<script setup lang="ts">
import type { PublicOpening } from '~/utils/recruitment'

// Public careers page (TND-30): who we are, open positions, filters. No session.
definePageMeta({ layout: false })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const { data, error, refresh } = await useFetch<{ company: { name: string, intro: string }, openings: PublicOpening[] }>('/api/careers')
useHead(() => ({ title: `${t('tnd30.public.careers')} · ${data.value?.company.name ?? ''}` }))

const team = ref('all')
const contract = ref('all')
const remote = ref('all')
const openings = computed(() => data.value?.openings ?? [])
const teamOptions = computed(() => [{ value: 'all', label: t('tnd30.public.allTeams') },
  ...[...new Set(openings.value.map(o => o.teams?.name).filter((x): x is string => !!x))].sort().map(n => ({ value: n, label: n }))])
const contractOptions = computed(() => [{ value: 'all', label: t('tnd30.public.allContracts') },
  ...[...new Set(openings.value.map(o => o.contract_type))].map(c => ({ value: c, label: t(`tnd30.contract.${c}`) }))])
const remoteOptions = computed(() => [{ value: 'all', label: t('tnd30.public.allRemote') },
  ...[...new Set(openings.value.map(o => o.remote))].map(r => ({ value: r, label: t(`tnd30.remote.${r}`) }))])
const shown = computed(() => openings.value.filter(o =>
  (team.value === 'all' || o.teams?.name === team.value)
  && (contract.value === 'all' || o.contract_type === contract.value)
  && (remote.value === 'all' || o.remote === remote.value)))
const salary = (o: PublicOpening) => salaryLabel(o, tag.value, t('tnd30.perYear'), t('tnd30.perMonth'))
</script>

<template>
  <NuxtLayout name="public" :company="data?.company.name">
    <div class="wb-stack wb-car">
      <section class="wb-car-hero">
        <h1 class="display">{{ t('tnd30.public.joinUs', { name: data?.company.name ?? '' }) }}</h1>
        <RichText v-if="data?.company.intro" class="wb-car-intro" :text="data.company.intro" />
      </section>

      <WbErrorState v-if="error" :message="t('tnd30.public.loadError')" @retry="refresh" />
      <template v-else>
        <div class="wb-row wb-wrap wb-car-f">
          <span class="h3">{{ t('tnd30.public.openings', { n: openings.length }, openings.length) }}</span>
          <span class="wb-grow" />
          <WbSelect v-if="teamOptions.length > 2" v-model="team" :options="teamOptions" :aria-label="t('calendar.team')" />
          <WbSelect v-if="contractOptions.length > 2" v-model="contract" :options="contractOptions" :aria-label="t('tnd30.fields.contract')" />
          <WbSelect v-if="remoteOptions.length > 2" v-model="remote" :options="remoteOptions" :aria-label="t('tnd30.fields.remote')" />
        </div>

        <div v-if="!openings.length" class="wb-card">
          <WbEmptyState art="search" :title="t('tnd30.public.noneTitle')">{{ t('tnd30.public.noneText') }}</WbEmptyState>
        </div>
        <ul v-else class="wb-car-list">
          <li v-for="o in shown" :key="o.id">
            <NuxtLink :to="`/carrieres/${o.slug}`" class="wb-card wb-car-o" :data-slug="o.slug">
              <div class="wb-grow">
                <h2 class="h3">{{ o.title }}</h2>
                <p v-if="o.summary" class="small wb-mut2">{{ o.summary }}</p>
                <p class="wb-car-meta caption">
                  <span v-if="o.teams?.name">{{ o.teams.name }}</span>
                  <span v-if="o.location"><WbIcon name="globe" :size="13" />{{ o.location }}</span>
                  <span>{{ t(`tnd30.contract.${o.contract_type}`) }}</span>
                  <span>{{ t(`tnd30.remote.${o.remote}`) }}</span>
                  <span v-if="salary(o)" class="wb-num">{{ salary(o) }}</span>
                </p>
              </div>
              <span class="wb-car-cta small">{{ t('tnd30.public.see') }} <WbIcon name="chevron-right" :size="16" /></span>
            </NuxtLink>
          </li>
          <li v-if="!shown.length" class="wb-mut small">{{ t('tnd30.public.noMatch') }}</li>
        </ul>
      </template>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.wb-car { gap: var(--space-5); }
.wb-car-hero { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4) 0 var(--space-2); }
.wb-car-hero h1 { margin: 0; }
.wb-car-intro { max-width: 680px; color: var(--ink-2); }
.wb-car-f { gap: var(--space-2); align-items: center; }
.wb-car-f :deep(.wb-field) { flex: 0 0 auto; }
.wb-car-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.wb-car-o { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); color: inherit; text-decoration: none; transition: border-color .15s, box-shadow .15s; }
.wb-car-o:hover { border-color: var(--brand); box-shadow: var(--shadow-2); }
.wb-car-o h2 { margin: 0 0 4px; }
.wb-car-o p { margin: 0; }
.wb-car-meta { display: flex; flex-wrap: wrap; gap: 4px var(--space-3); margin-top: var(--space-2) !important; color: var(--ink-2); }
.wb-car-meta span { display: inline-flex; align-items: center; gap: 4px; }
.wb-car-cta { display: inline-flex; align-items: center; gap: 2px; color: var(--brand-text); white-space: nowrap; }
@container wbapp (max-width: 767px) {
  .wb-car-o { flex-direction: column; align-items: flex-start; }
}
</style>

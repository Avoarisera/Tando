<script setup lang="ts">
import type { ReviewResponse, TemplateContent } from '~/utils/reviews'
import { averageRating, compareRatings } from '~/utils/reviews'

/**
 * TND-29 — side-by-side reading: per competency the self rating and the
 * manager's, gaps of 2 levels or more highlighted; then comments, answers and
 * the objectives review of each.
 */
const props = defineProps<{ content: TemplateContent, self: ReviewResponse | null, manager: ReviewResponse | null, hasManager: boolean }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const rows = computed(() => compareRatings(props.content, props.self?.ratings, props.manager?.ratings))
const avgSelf = computed(() => averageRating(props.self?.ratings))
const avgMgr = computed(() => averageRating(props.manager?.ratings))
const gaps = computed(() => rows.value.filter(r => r.flag).length)
const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString(tag.value, { maximumFractionDigits: 1 }))
const level = (n: number | null) => (n ? t(`tnd29.level.${n}`) : t('tnd29.form.cantSayShort'))
const objStatus = (s: string) => (s ? t(`tnd29.obj.${s}`) : '—')
</script>

<template>
  <div class="wb-stack wb-rs2">
    <section class="wb-card wb-rs2-card">
      <header class="wb-row-b wb-wrap">
        <h2 class="h2">{{ t('tnd29.syn.title') }}</h2>
        <div class="wb-row wb-wrap wb-rs2-legend caption">
          <span><i class="wb-rs2-dot is-self" />{{ t('tnd29.syn.self') }} · {{ fmt(avgSelf) }}</span>
          <span v-if="hasManager"><i class="wb-rs2-dot is-mgr" />{{ t('tnd29.syn.manager') }} · {{ fmt(avgMgr) }}</span>
          <WbBadge v-if="gaps" tone="warning" size="sm" icon="triangle-alert">{{ t('tnd29.syn.gaps', { n: gaps }, gaps) }}</WbBadge>
        </div>
      </header>
      <ul class="wb-rs2-rows">
        <li v-for="r in rows" :key="r.id" :class="{ 'is-gap': r.flag }">
          <span class="small wb-rs2-l">{{ r.label }}</span>
          <span class="wb-rs2-scale" :aria-label="`${t('tnd29.syn.self')} ${r.self ?? '—'}, ${t('tnd29.syn.manager')} ${r.manager ?? '—'}`">
            <i v-for="n in 4" :key="n" class="wb-rs2-tick" :style="{ left: `${((n - 1) / 3) * 100}%` }" />
            <b v-if="r.self" class="wb-rs2-dot is-self" :style="{ left: `${((r.self - 1) / 3) * 100}%` }" :title="`${t('tnd29.syn.self')} : ${level(r.self)}`" />
            <b v-if="r.manager" class="wb-rs2-dot is-mgr" :style="{ left: `${((r.manager - 1) / 3) * 100}%` }" :title="`${t('tnd29.syn.manager')} : ${level(r.manager)}`" />
          </span>
          <span class="caption wb-mut2 wb-rs2-v">{{ level(r.self) }}<template v-if="hasManager"> / {{ level(r.manager) }}</template></span>
        </li>
      </ul>
      <p class="caption wb-mut">{{ t('tnd29.syn.scale') }}</p>
    </section>

    <section v-for="c in content.competencies" v-show="self?.comments[c.id] || manager?.comments[c.id]" :key="c.id" class="wb-rs2-cm">
      <h3 class="h3">{{ c.label }}</h3>
      <p v-if="self?.comments[c.id]" class="small"><b>{{ t('tnd29.syn.self') }} :</b> {{ self.comments[c.id] }}</p>
      <p v-if="manager?.comments[c.id]" class="small"><b>{{ t('tnd29.syn.manager') }} :</b> {{ manager.comments[c.id] }}</p>
    </section>

    <section v-if="content.questions.length" class="wb-card wb-rs2-card wb-stack-s">
      <h2 class="h2">{{ t('tnd29.form.questions') }}</h2>
      <div v-for="q in content.questions" :key="q.id" class="wb-rs2-q">
        <p class="small wb-mut2">{{ q.label }}</p>
        <p v-if="q.roles.includes('self')" class="small"><b>{{ t('tnd29.syn.self') }} :</b> {{ self?.answers[q.id] || '—' }}</p>
        <p v-if="q.roles.includes('manager') && hasManager" class="small"><b>{{ t('tnd29.syn.manager') }} :</b> {{ manager?.answers[q.id] || '—' }}</p>
      </div>
    </section>

    <section v-if="content.objectives && (self?.objectives.length || manager?.objectives.length)" class="wb-card wb-rs2-card wb-stack-s">
      <h2 class="h2">{{ t('tnd29.form.objectives') }}</h2>
      <div v-for="(who, k) in [{ label: t('tnd29.syn.self'), r: self }, { label: t('tnd29.syn.manager'), r: manager }]" v-show="who.r?.objectives.length" :key="k">
        <p class="small"><b>{{ who.label }}</b></p>
        <ul class="wb-list">
          <li v-for="(o, i) in who.r?.objectives ?? []" :key="i" class="small"><span class="wb-grow">{{ o.text }}<span v-if="o.comment" class="wb-mut2"> — {{ o.comment }}</span></span><WbBadge size="sm" :tone="o.status === 'met' ? 'success' : o.status === 'partial' ? 'warning' : o.status === 'missed' ? 'danger' : 'neutral'">{{ objStatus(o.status) }}</WbBadge></li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wb-rs2-card { padding: var(--space-4) var(--space-5); }
.wb-rs2-card h2 { margin: 0; }
.wb-rs2-legend { gap: var(--space-3); align-items: center; }
.wb-rs2-legend span { display: inline-flex; align-items: center; gap: 6px; }
.wb-rs2-rows { list-style: none; margin: var(--space-3) 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-rs2-rows li { display: grid; grid-template-columns: 220px minmax(0, 1fr) 180px; gap: var(--space-3); align-items: center; padding: 6px var(--space-2); border-radius: var(--radius-md); }
.wb-rs2-rows li.is-gap { background: var(--warning-tint); }
.wb-rs2-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-rs2-scale { position: relative; height: 18px; margin: 0 9px; border-bottom: 2px solid var(--border); }
.wb-rs2-tick { position: absolute; bottom: -5px; width: 2px; height: 8px; margin-left: -1px; background: var(--border); }
.wb-rs2-dot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--surface); }
.wb-rs2-scale .wb-rs2-dot { position: absolute; bottom: -8px; margin-left: -7px; }
.wb-rs2-dot.is-self { background: var(--chart-1); }
.wb-rs2-dot.is-mgr { background: var(--chart-3); }
.wb-rs2-scale .wb-rs2-dot.is-mgr { bottom: 4px; }
.wb-rs2-v { text-align: right; }
.wb-rs2-cm { padding: 0 var(--space-2); }
.wb-rs2-cm h3, .wb-rs2-cm p, .wb-rs2-q p { margin: 0 0 4px; }
.wb-rs2-q + .wb-rs2-q { border-top: 1px solid var(--border); padding-top: var(--space-2); }
@container wbapp (max-width: 767px) {
  .wb-rs2-rows li { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .wb-rs2-v { text-align: left; }
}
</style>

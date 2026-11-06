<script setup lang="ts">
// Public pages (careers, TND-30): no menu, no session needed; company name in the header.
const props = defineProps<{ company?: string }>()
const { t } = useI18n()
const name = computed(() => props.company)
</script>

<template>
  <div class="wb-app wb-pub">
    <header class="wb-pub-h">
      <div class="wb-pub-in">
        <NuxtLink to="/carrieres" class="wb-pub-brand">
          <slot name="brand"><span class="h3">{{ name || t('tnd30.public.careers') }}</span></slot>
        </NuxtLink>
        <span class="caption wb-mut2">{{ t('tnd30.public.careers') }}</span>
      </div>
    </header>
    <main class="wb-pub-in wb-pub-main"><slot /></main>
    <footer class="wb-pub-f caption wb-mut">
      <div class="wb-pub-in">{{ t('tnd30.public.footer') }}</div>
    </footer>
  </div>
</template>

<style scoped>
.wb-pub { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg, var(--surface-2)); container: wbapp / inline-size; }
.wb-pub-in { width: 100%; max-width: 980px; margin: 0 auto; padding: 0 var(--space-5); }
.wb-pub-h { background: var(--surface); border-bottom: 1px solid var(--border); }
.wb-pub-h .wb-pub-in { display: flex; align-items: center; justify-content: space-between; height: 60px; }
.wb-pub-brand { color: var(--ink); text-decoration: none; }
.wb-pub-main { flex: 1; padding-top: var(--space-6); padding-bottom: var(--space-8); }
.wb-pub-f { border-top: 1px solid var(--border); padding: var(--space-4) 0; }
@container wbapp (max-width: 767px) {
  .wb-pub-in { padding: 0 var(--space-4); }
  .wb-pub-main { padding-top: var(--space-4); }
}
</style>

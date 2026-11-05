<script setup lang="ts">
// Full-screen shell for the public pages (login, password reset, invitation, errors).
// Desktop: brand panel on the left, compact form on the right. Phones: form only.
const { t } = useI18n()
const points = computed(() => [t('v3.auth.point1'), t('v3.auth.point2'), t('v3.auth.point3')])
</script>

<template>
  <div class="wb-app wb-auth-page">
    <div class="wb-auth-grid">
      <aside class="wb-auth-brand" aria-hidden="true">
        <span class="wb-auth-logo">Waka<b>Bods</b></span>
        <div class="wb-auth-pitch">
          <p class="wb-auth-title">{{ t('v3.auth.tagline') }}</p>
          <ul>
            <li v-for="p in points" :key="p"><WbIcon name="check" :size="16" /><span>{{ p }}</span></li>
          </ul>
        </div>
        <p class="wb-auth-small">{{ t('v3.auth.footer') }}</p>
      </aside>

      <main class="wb-auth-main">
        <div class="wb-auth-c">
          <WbWordmark :size="24" class="wb-auth-mlogo" />
          <slot />
        </div>
        <div v-if="$slots.footer" class="wb-auth-f small"><slot name="footer" /></div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.wb-auth-page { min-height: 100dvh; background: var(--bg); }
.wb-auth-grid { min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1fr); }

/* Brand panel: deep brand gradient, white type */
.wb-auth-brand {
  display: none;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-12);
  color: #ffffff;
  background:
    radial-gradient(120% 80% at 0% 0%, rgba(255, 255, 255, .14) 0%, transparent 55%),
    linear-gradient(150deg, #1d4ed8 0%, #2563eb 45%, #4338ca 100%);
}
:global([data-theme='dark']) .wb-auth-brand { background: linear-gradient(150deg, #172554 0%, #1e3a8a 55%, #312e81 100%); }
.wb-auth-logo { font-size: 24px; font-weight: 500; letter-spacing: -.02em; }
.wb-auth-logo b { font-weight: 800; }
.wb-auth-pitch { max-width: 420px; }
.wb-auth-title { margin: 0 0 var(--space-5); font-size: 28px; line-height: 34px; font-weight: 700; letter-spacing: -.02em; }
.wb-auth-pitch ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.wb-auth-pitch li { display: flex; gap: var(--space-2); align-items: flex-start; font-size: 15px; line-height: 22px; color: rgba(255, 255, 255, .92); }
.wb-auth-pitch li :deep(svg) { margin-top: 3px; flex: none; }
.wb-auth-small { margin: 0; font-size: 13px; color: rgba(255, 255, 255, .75); }

/* Form column */
.wb-auth-main { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-6) var(--space-4); }
.wb-auth-c {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--surface);
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
}
.wb-auth-f { color: var(--ink-3); }

@container wbapp (min-width: 960px) {
  .wb-auth-grid { grid-template-columns: minmax(380px, 5fr) minmax(0, 7fr); }
  .wb-auth-brand { display: flex; }
  .wb-auth-mlogo { display: none; }
  /* On the white side the form stands on its own: no card chrome */
  .wb-auth-main { background: var(--surface); }
  .wb-auth-c { border: 0; box-shadow: none; padding: 0; max-width: 380px; }
}

@container wbapp (max-width: 767px) {
  .wb-auth-main { justify-content: flex-start; padding-top: var(--space-8); }
  .wb-auth-c { padding: var(--space-5) var(--space-4); }
}
</style>

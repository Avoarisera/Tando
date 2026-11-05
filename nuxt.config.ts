import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase', '@nuxtjs/i18n'],
  i18n: {
    defaultLocale: 'fr',
    vueI18n: './i18n.config.ts',
    strategy: 'no_prefix',
    locales: [
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
    ],
    // Unit tests (happy-dom reports an English browser) assert the French copy
    detectBrowserLanguage: process.env.VITEST
      ? false
      : { useCookie: true, cookieKey: 'wb_lang', fallbackLocale: 'fr', redirectOn: 'root' },
  },
  supabase: {
    redirect: false,
    types: '~/types/database.ts',
    // `secure: true` (module default) makes Firefox/Zen drop the session cookie on
    // http://localhost, so a reload logged the user out in dev (TND-01).
    cookieOptions: {
      maxAge: 60 * 60 * 8,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  app: {
    // Native <input type="date"> follows the page language in Firefox/Zen (TND-08)
    head: { htmlAttrs: { lang: 'fr' } },
  },
  components: {
    dirs: [{ path: '~/components', pathPrefix: false }],
  },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    // pre-bundled so the first invoice PDF does not trigger a Vite reload in dev
    optimizeDeps: { include: ['pdf-lib'] },
  },
})

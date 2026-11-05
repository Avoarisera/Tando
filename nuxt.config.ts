import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
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
  },
})

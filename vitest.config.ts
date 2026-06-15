import { defineVitestConfig } from '@nuxt/test-utils/config'

// @nuxt/test-utils starts its own Nuxt instance and does not load the project .env file.
// @nuxtjs/supabase reads process.env at module setup time, before any config override applies.
// Provide dummy values so the module does not warn — unit tests never call Supabase.
process.env.NUXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.NUXT_PUBLIC_SUPABASE_KEY ||= 'test-anon-key'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['tests/unit/**/*.test.ts'],
    environmentOptions: {
      nuxt: { rootDir: '.' },
    },
  },
})

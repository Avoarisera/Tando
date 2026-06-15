// Sets data-hydrated on <html> after the Nuxt app is fully mounted.
// Playwright tests use this as a gate before interacting with the page.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    document.documentElement.setAttribute('data-hydrated', 'true')
  })
})

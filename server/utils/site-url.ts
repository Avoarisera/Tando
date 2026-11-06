import type { H3Event } from 'h3'

/**
 * Public address of the app for links sent by e-mail. NUXT_PUBLIC_SITE_URL (or
 * SITE_URL) wins: behind the Coolify proxy the request origin can be internal.
 */
export function siteUrl(event?: H3Event): string {
  const env = process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL
  if (env) return env.replace(/\/+$/, '')
  return event ? getRequestURL(event).origin : 'http://localhost:3000'
}

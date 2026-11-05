export type ThemeChoice = 'light' | 'dark' | 'system'

/**
 * Light / dark theme from the design tokens ([data-theme="dark"] in tokens.css).
 * The choice is kept in a cookie so the server renders the right theme;
 * "system" follows the OS on the client.
 */
export function useTheme() {
  const choice = useCookie<ThemeChoice>('wb_theme', { default: () => 'system', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const systemDark = useState<boolean>('wb-system-dark', () => false)

  const resolved = computed<'light' | 'dark'>(() => (choice.value === 'system' ? (systemDark.value ? 'dark' : 'light') : choice.value))

  function watchSystem() {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = mq.matches
    mq.addEventListener('change', (e) => { systemDark.value = e.matches })
  }

  return { choice, resolved, watchSystem }
}

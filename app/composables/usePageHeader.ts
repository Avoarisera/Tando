export interface Crumb { label: string, to?: string }
interface PageHeaderState { path: string, title?: string, crumbs?: Crumb[] }

/**
 * Lets a page set the title (or breadcrumbs) shown in the app header.
 * The value is tied to the current path, so a stale title never leaks
 * onto the next page. Pages without a call fall back to meta.titleKey.
 */
export function usePageHeader(value?: MaybeRefOrGetter<{ title?: string, crumbs?: Crumb[] }>) {
  const route = useRoute()
  const state = useState<PageHeaderState | null>('wb-page-header', () => null)

  if (value !== undefined) {
    watchEffect(() => {
      state.value = { path: route.path, ...toValue(value) }
    })
  }

  const current = computed(() => (state.value?.path === route.path ? state.value : null))
  return { current }
}

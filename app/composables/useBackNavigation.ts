export function useBackNavigation(fallback: string) {
  const router = useRouter()

  function goBack() {
    // window.history.state.back is set by Vue Router on in-app navigation
    if (window.history.state?.back) {
      router.back()
    } else {
      router.push(fallback)
    }
  }

  return { goBack }
}

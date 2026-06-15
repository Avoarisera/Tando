interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

const MAX_TOASTS = 3

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function add(message: string, type: Toast['type'] = 'success') {
    const id = crypto.randomUUID()
    if (toasts.value.length >= MAX_TOASTS) {
      toasts.value = toasts.value.slice(toasts.value.length - MAX_TOASTS + 1)
    }
    toasts.value.push({ id, message, type })
    if (type === 'success') {
      setTimeout(() => remove(id), 3000)
    }
  }

  function remove(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts: readonly(toasts), add, remove }
}

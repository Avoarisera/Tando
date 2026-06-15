import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useState<Array<{ id: string; message: string; type: string }>>('toasts').value = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('add()', () => {
    it('pushes a toast with correct shape, defaults type to success', () => {
      vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' })
      const { toasts, add } = useToast()
      add('Opération réussie')
      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0]).toMatchObject({ id: 'uuid-1', message: 'Opération réussie', type: 'success' })
    })

    it('accepts "error" type', () => {
      vi.stubGlobal('crypto', { randomUUID: () => 'uuid-2' })
      const { toasts, add } = useToast()
      add('Erreur serveur', 'error')
      expect(toasts.value[0].type).toBe('error')
    })

    it('schedules success toast removal after exactly 3000ms', () => {
      vi.stubGlobal('crypto', { randomUUID: () => 'auto-id' })
      const { toasts, add } = useToast()
      add('Succès')
      expect(toasts.value).toHaveLength(1)
      vi.advanceTimersByTime(2999)
      expect(toasts.value).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(toasts.value).toHaveLength(0)
    })

    it('does not auto-dismiss error toasts', () => {
      vi.stubGlobal('crypto', { randomUUID: () => 'err-id' })
      const { toasts, add } = useToast()
      add('Erreur persistante', 'error')
      vi.advanceTimersByTime(10_000)
      expect(toasts.value).toHaveLength(1)
    })

    it('evicts the oldest toast when exceeding MAX_TOASTS (3)', () => {
      const uuidMock = vi.fn()
        .mockReturnValueOnce('id-1')
        .mockReturnValueOnce('id-2')
        .mockReturnValueOnce('id-3')
        .mockReturnValueOnce('id-4')
      vi.stubGlobal('crypto', { randomUUID: uuidMock })
      const { toasts, add } = useToast()
      add('A', 'error'); add('B', 'error'); add('C', 'error')
      expect(toasts.value).toHaveLength(3)
      add('D', 'error')
      expect(toasts.value).toHaveLength(3)
      expect(toasts.value.map(t => t.id)).toEqual(['id-2', 'id-3', 'id-4'])
    })

    it('always removes the oldest, never the newest', () => {
      const uuidMock = vi.fn()
        .mockReturnValueOnce('a').mockReturnValueOnce('b')
        .mockReturnValueOnce('c').mockReturnValueOnce('d')
      vi.stubGlobal('crypto', { randomUUID: uuidMock })
      const { toasts, add } = useToast()
      add('A', 'error'); add('B', 'error'); add('C', 'error'); add('D', 'error')
      expect(toasts.value.map(t => t.message)).toEqual(['B', 'C', 'D'])
    })
  })

  describe('remove()', () => {
    it('removes only the toast matching the given id', () => {
      const uuidMock = vi.fn()
        .mockReturnValueOnce('keep-1')
        .mockReturnValueOnce('remove-me')
        .mockReturnValueOnce('keep-2')
      vi.stubGlobal('crypto', { randomUUID: uuidMock })
      const { toasts, add, remove } = useToast()
      add('Keep 1', 'error'); add('Remove me', 'error'); add('Keep 2', 'error')
      remove('remove-me')
      expect(toasts.value).toHaveLength(2)
      expect(toasts.value.map(t => t.id)).toEqual(['keep-1', 'keep-2'])
    })

    it('is a no-op for an unknown id', () => {
      vi.stubGlobal('crypto', { randomUUID: () => 'real-id' })
      const { toasts, add, remove } = useToast()
      add('Present', 'error')
      remove('ghost-id')
      expect(toasts.value).toHaveLength(1)
    })
  })

  describe('shared state', () => {
    it('two useToast() calls share the same state via useState key', () => {
      vi.stubGlobal('crypto', { randomUUID: () => 'shared-id' })
      const toast1 = useToast()
      const toast2 = useToast()
      toast1.add('Shared', 'error')
      expect(toast2.toasts.value).toHaveLength(1)
      expect(toast2.toasts.value[0].id).toBe('shared-id')
    })
  })
})

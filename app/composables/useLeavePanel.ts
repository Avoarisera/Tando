/** Opens the "Poser un congé" panel from anywhere (header, tab bar, home). */
export function useLeavePanel() {
  const isOpen = useState<boolean>('leave-panel-open', () => false)
  const detailId = useState<string | null>('leave-detail-id', () => null)
  return {
    isOpen,
    detailId,
    open: () => { isOpen.value = true },
    close: () => { isOpen.value = false },
    openDetail: (id: string) => { detailId.value = id },
    closeDetail: () => { detailId.value = null },
  }
}

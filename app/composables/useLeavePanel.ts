/** Opens the "Poser un congé" panel from anywhere (header, tab bar, home). */
export function useLeavePanel() {
  const isOpen = useState<boolean>('leave-panel-open', () => false)
  const detailId = useState<string | null>('leave-detail-id', () => null)
  // When set, the panel edits this pending request instead of creating one
  const editId = useState<string | null>('leave-edit-id', () => null)
  return {
    isOpen,
    detailId,
    editId,
    open: () => { editId.value = null; isOpen.value = true },
    openEdit: (id: string) => { detailId.value = null; editId.value = id; isOpen.value = true },
    close: () => { isOpen.value = false; editId.value = null },
    openDetail: (id: string) => { detailId.value = id },
    closeDetail: () => { detailId.value = null },
  }
}

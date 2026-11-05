<script setup lang="ts">
const { toasts, remove } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="wb-toasts">
      <TransitionGroup name="toast">
        <AppToast
          v-for="toast in toasts"
          :id="toast.id"
          :key="toast.id"
          :message="toast.message"
          :type="toast.type"
          @dismiss="remove"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
/* Bottom right on desktop; centred above the tab bar on phones */
.wb-toasts { position: fixed; right: var(--space-6); bottom: var(--space-6); z-index: 100; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); pointer-events: none; }
.wb-toasts > * { pointer-events: auto; }
@media (max-width: 767px) {
  .wb-toasts { left: var(--space-4); right: var(--space-4); bottom: calc(72px + env(safe-area-inset-bottom, 0px)); align-items: center; }
}
.toast-enter-active, .toast-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active { transition: none; }
}
</style>

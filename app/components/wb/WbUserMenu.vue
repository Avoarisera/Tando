<script setup lang="ts">
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ signOut: [] }>()
const { t } = useI18n()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const route = useRoute()

watch(() => route.path, () => { open.value = false })

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false
    button.value?.focus()
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})

function go(path: string) {
  open.value = false
  navigateTo(path)
}
</script>

<template>
  <span ref="root" class="wb-head-u">
    <button
      ref="button"
      type="button"
      :aria-label="`${t('nav.userMenu')} : ${props.name}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <WbAvatar :name="props.name" :size="34" />
    </button>
    <div v-if="open" class="wb-menu" role="menu" style="position: absolute; right: 0; top: 44px; z-index: 40; width: 220px">
      <button type="button" role="menuitem" @click="go('/profile')">
        <WbIcon name="circle-user-round" :size="16" /><span>{{ t('nav.myProfile') }}</span>
      </button>
      <!-- signed in: change the password on the profile (the reset page is for the e-mail link) -->
      <button type="button" role="menuitem" data-action="menu-password" @click="go('/profile#security')">
        <WbIcon name="key-round" :size="16" /><span>{{ t('nav.password') }}</span>
      </button>
      <hr>
      <button type="button" role="menuitem" @click="open = false; emit('signOut')">
        <WbIcon name="log-out" :size="16" /><span>{{ t('nav.signOut') }}</span>
      </button>
    </div>
  </span>
</template>

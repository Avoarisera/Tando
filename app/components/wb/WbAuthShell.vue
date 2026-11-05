<script setup lang="ts">
// Full-screen shell for the public pages (login, password reset, invitation).
</script>

<template>
  <div class="wb-app wb-auth-page">
    <div class="wb-auth">
      <div class="wb-auth-c">
        <WbWordmark :size="26" />
        <slot />
      </div>
      <div v-if="$slots.footer" class="wb-auth-f small"><slot name="footer" /></div>
    </div>
  </div>
</template>

<style scoped>
.wb-auth-page { min-height: 100dvh; background: var(--surface-nav); }
</style>

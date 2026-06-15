<script setup lang="ts">
const user = useSupabaseUser()
await navigateTo(user.value ? '/profile' : '/login')
</script>

<template>
  <div />
</template>

<script setup lang="ts">
const props = defineProps<{
  typeName: string
  typeColor: string
  allocatedDays: number
  usedDays: number
}>()

const remainingDays = computed(() => Math.max(0, props.allocatedDays - props.usedDays))
</script>

<template>
  <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
    <div class="flex items-center gap-3 min-w-0">
      <span
        class="w-3 h-3 rounded-full shrink-0"
        :style="{ backgroundColor: typeColor }"
        :aria-label="typeName"
      />
      <span class="font-medium text-gray-900 truncate">{{ typeName }}</span>
    </div>
    <div class="flex gap-4 md:gap-6 text-sm text-center shrink-0 ml-4">
      <div>
        <p class="text-gray-500">Acquis</p>
        <p class="font-semibold text-gray-900">{{ allocatedDays }}</p>
      </div>
      <div>
        <p class="text-gray-500">Utilisés</p>
        <p class="font-semibold text-gray-900">{{ usedDays }}</p>
      </div>
      <div>
        <p class="text-gray-500">Restants</p>
        <p
          class="font-semibold"
          :class="remainingDays === 0 ? 'text-red-600' : 'text-green-600'"
        >
          {{ remainingDays }}
        </p>
      </div>
    </div>
  </div>
</template>

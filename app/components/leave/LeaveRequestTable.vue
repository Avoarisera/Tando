<script setup lang="ts">
import type { LeaveRequestWithRelations } from '~/types/index'

const props = withDefaults(defineProps<{
  requests: readonly LeaveRequestWithRelations[]
  showEmployee?: boolean
  showActions?: boolean
}>(), {
  showEmployee: false,
  showActions: false,
})

const emit = defineEmits<{
  approve: [requestId: string]
  reject: [requestId: string]
}>()
</script>

<template>
  <!-- Mobile: card layout -->
  <ul class="space-y-3 md:hidden">
    <li
      v-for="req in props.requests"
      :key="req.id"
      class="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="w-3 h-3 rounded-full shrink-0"
            :style="{ backgroundColor: req.leave_types.color }"
            :aria-label="req.leave_types.name"
          />
          <span class="font-medium text-gray-900 truncate text-sm">{{ req.leave_types.name }}</span>
        </div>
        <LeaveStatusBadge v-if="!props.showActions" :status="req.status" />
      </div>

      <div v-if="props.showEmployee" class="text-sm text-gray-700 font-medium">
        {{ req.profiles.first_name }} {{ req.profiles.last_name }}
      </div>

      <div class="text-sm text-gray-600">
        Du {{ formatDate(req.start_date) }} au {{ formatDate(req.end_date) }}
        <span class="text-gray-400 ml-1">({{ req.days_count }} j)</span>
      </div>

      <div v-if="req.comment" class="text-sm text-gray-500 italic">
        « {{ req.comment }} »
      </div>

      <div class="text-xs text-gray-400">
        Créée le {{ formatDate(req.created_at) }}
      </div>

      <div v-if="props.showActions" class="flex gap-2 pt-1">
        <AppButton
          variant="primary"
          class="flex-1 text-xs py-1.5"
          @click="emit('approve', req.id)"
        >
          Approuver
        </AppButton>
        <AppButton
          variant="danger"
          class="flex-1 text-xs py-1.5"
          @click="emit('reject', req.id)"
        >
          Refuser
        </AppButton>
      </div>
    </li>
  </ul>

  <!-- Desktop: table layout -->
  <div class="hidden md:block overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th
            v-if="props.showEmployee"
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
          >
            Employé
          </th>
          <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Type
          </th>
          <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Période
          </th>
          <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Durée
          </th>
          <th v-if="props.showActions" scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Commentaire
          </th>
          <th v-if="!props.showActions" scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Statut
          </th>
          <th v-if="!props.showActions" scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Créée le
          </th>
          <th v-if="props.showActions" scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-100">
        <tr v-for="req in props.requests" :key="req.id" class="hover:bg-gray-50">
          <td v-if="props.showEmployee" class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
            {{ req.profiles.first_name }} {{ req.profiles.last_name }}
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: req.leave_types.color }"
                :aria-label="req.leave_types.name"
              />
              <span class="text-sm text-gray-900">{{ req.leave_types.name }}</span>
            </div>
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
            {{ formatDate(req.start_date) }} → {{ formatDate(req.end_date) }}
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
            {{ req.days_count }} j
          </td>
          <td v-if="props.showActions" class="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
            {{ req.comment ?? '—' }}
          </td>
          <td v-if="!props.showActions" class="px-4 py-3 whitespace-nowrap">
            <LeaveStatusBadge :status="req.status" />
          </td>
          <td v-if="!props.showActions" class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
            {{ formatDate(req.created_at) }}
          </td>
          <td v-if="props.showActions" class="px-4 py-3 whitespace-nowrap text-right">
            <div class="flex justify-end gap-2">
              <AppButton variant="primary" @click="emit('approve', req.id)">
                Approuver
              </AppButton>
              <AppButton variant="danger" @click="emit('reject', req.id)">
                Refuser
              </AppButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

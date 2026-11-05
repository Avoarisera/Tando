<script setup lang="ts">
// Tickets per person and month: colour heat-1 … heat-6 AND the number in each cell.
export interface WbHeatRow { id: string, name: string, values: readonly number[] }

const props = withDefaults(defineProps<{ cols: readonly string[], rows: readonly WbHeatRow[], unitLabel: string, max?: number }>(), {})
const emit = defineEmits<{ 'row-click': [id: string], 'cell-click': [id: string, index: number] }>()

const mx = computed(() => props.max || Math.max(1, ...props.rows.flatMap(r => r.values)))
const level = (v: number) => (v <= 0 ? 1 : Math.min(6, Math.ceil((v / mx.value) * 6)) || 1)
</script>

<template>
  <div class="wb-scroll">
    <table class="wb-hm">
      <caption class="wb-sr">{{ unitLabel }}</caption>
      <thead>
        <tr><th /><th v-for="c in cols" :key="c" scope="col" class="caption">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <th scope="row" class="small">
            <button type="button" class="wb-hm-n" @click="emit('row-click', r.id)">
              <span class="wb-cp"><WbAvatar :name="r.name" :size="24" />{{ r.name }}</span>
            </button>
          </th>
          <td v-for="(v, i) in r.values" :key="i">
            <button
              type="button"
              class="wb-hm-c"
              :style="{ background: `var(--heat-${level(v)})`, color: `var(--hm-t${level(v)})` }"
              :aria-label="`${r.name}, ${cols[i]} : ${v} ${unitLabel}`"
              @click="emit('cell-click', r.id, i)"
            >
              <b class="wb-num">{{ v }}</b>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wb-hm-n { all: unset; cursor: pointer; border-radius: var(--radius-sm); }
.wb-hm-n:hover { color: var(--brand-text); }
.wb-hm-n:focus-visible { outline: 2px solid var(--focus); }
</style>

<script setup lang="ts">
import type { PeerRequest } from '~/composables/useReviews'
import type { ReviewResponse } from '~/utils/reviews'
import { peerContent } from '~/utils/reviews'

// TND-29 lot 2 — a colleague's feedback: the short form of the campaign. The
// answer is never shown with the author's name — only within an aggregate of
// at least 3 responses.
definePageMeta({ titleKey: 'nav.reviews', layout: 'private', key: r => `peer-${String(r.params.id)}` })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const route = useRoute()
const id = String(route.params.id)
const { profile } = useCurrentUser()
const { myPeerRequests, listResponses } = useReviews()

const req = ref<PeerRequest | null>(null)
const mine = ref<ReviewResponse | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)
async function load() {
  error.value = null
  try {
    const [all, rows] = await Promise.all([myPeerRequests(), listResponses(id)])
    req.value = all.find(r => r.packet_id === id) ?? null
    if (!req.value) throw new Error(t('tnd29.cycle.notFound'))
    mine.value = rows.find(r => r.role === 'peer' && r.author_id === profile.value?.id) ?? null
  }
  catch (e) { error.value = errorMessage(e) }
  finally { loaded.value = true }
}
onMounted(load)
usePageHeader(() => ({ crumbs: [{ label: t('nav.reviews'), to: '/mes-evaluations' }, { label: req.value?.employee_name ?? '…' }] }))
const content = computed(() => (req.value ? peerContent(req.value.content) : null))
const canWrite = computed(() => !!req.value?.open && !mine.value?.submitted_at)
</script>

<template>
  <div class="wb-page wb-stack wb-my">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!loaded || !profile" variant="table" />
    <template v-else-if="req && content">
      <header class="wb-stack-s">
        <h1 class="h2">{{ t('tnd29.peer.pageTitle', { who: req.employee_name }) }}</h1>
        <p class="small wb-mut2">{{ req.cycle_name }}<template v-if="req.peer_due"> · {{ t('tnd29.list.due', { date: fmtShort(req.peer_due, tag) }) }}</template></p>
      </header>
      <ReviewForm v-if="canWrite || mine" :content="content" role="peer" :packet-id="id" :author-id="profile.id" :initial="mine" :subject="req.employee_name" @submitted="load" />
      <p v-else class="wb-why small"><WbIcon name="lock" :size="14" /> {{ t('tnd29.peer.closed') }}</p>
    </template>
  </div>
</template>

<style scoped>
.wb-my header h1, .wb-my header p { margin: 0; }
</style>

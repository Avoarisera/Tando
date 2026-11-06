import type { ObjectiveReview, ReviewResponse, TemplateContent } from '~/utils/reviews'

export interface ReviewTemplate { id: string, name: string, kind: 'annual' | 'probation' | 'custom', content: TemplateContent, archived: boolean, updated_at: string }
export interface ReviewCycle {
  id: string, name: string, period_start: string, period_end: string, template_id: string, content: TemplateContent | null
  self_due: string | null, manager_due: string | null, hr_due: string | null, status: 'draft' | 'active' | 'closed'
  launched_at: string | null, closed_at: string | null, created_at: string
}
export interface HrPacket {
  id: string, cycle_id: string, employee_id: string, manager_id: string | null
  hr_rating: number | null, hr_strengths: string, hr_improvements: string, hr_objectives: { text: string }[]
  hr_done_at: string | null, shared_at: string | null, acknowledged_at: string | null, employee_comment: string | null
  employee: { first_name: string, last_name: string, team_id: string | null } | null
  manager: { first_name: string, last_name: string } | null
}
/** One row of my_review_packets(): what an employee / manager may see */
export interface MyPacket {
  id: string, cycle_id: string, cycle_name: string, period_start: string, period_end: string, cycle_status: string
  self_due: string | null, manager_due: string | null, content: TemplateContent
  employee_id: string, employee_name: string, manager_id: string | null, manager_name: string | null
  my_role: 'self' | 'manager', self_submitted: boolean, manager_submitted: boolean
  shared_at: string | null, acknowledged_at: string | null, employee_comment: string | null
  hr_rating: number | null, hr_strengths: string, hr_improvements: string, hr_objectives: { text: string }[]
}

/** TND-29 — performance reviews (RLS + RPCs do the access rules) */
export function useReviews() {
  const supabase = useSupabaseClient()
  const fail = (e: unknown) => { throw new Error(errorMessage(e)) }

  // ── HR ─────────────────────────────────────────────────────────────────
  async function listTemplates() {
    const { data, error } = await supabase.from('review_templates').select('*').eq('archived', false).order('created_at')
    if (error) fail(error)
    return (data ?? []) as unknown as ReviewTemplate[]
  }
  async function saveTemplate(t: Pick<ReviewTemplate, 'id' | 'name' | 'content'>) {
    const { error } = await supabase.from('review_templates').update({ name: t.name, content: t.content, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (error) fail(error)
  }
  async function listCycles() {
    const [{ data: cycles, error }, { data: packets, error: e2 }, { data: resp, error: e3 }] = await Promise.all([
      supabase.from('review_cycles').select('*').order('created_at', { ascending: false }),
      supabase.from('review_packets').select('id, cycle_id, manager_id, hr_done_at, shared_at, acknowledged_at'),
      supabase.from('review_responses').select('packet_id, role, submitted_at').not('submitted_at', 'is', null),
    ])
    if (error || e2 || e3) fail(error ?? e2 ?? e3)
    return { cycles: (cycles ?? []) as unknown as ReviewCycle[], packets: (packets ?? []) as { id: string, cycle_id: string, manager_id: string | null, hr_done_at: string | null, shared_at: string | null, acknowledged_at: string | null }[], submitted: (resp ?? []) as { packet_id: string, role: string }[] }
  }
  async function createCycle(c: Pick<ReviewCycle, 'name' | 'period_start' | 'period_end' | 'template_id' | 'self_due' | 'manager_due' | 'hr_due'>, me: string) {
    const { data, error } = await supabase.from('review_cycles').insert({ ...c, created_by: me }).select('id').single()
    if (error) fail(error)
    return (data as { id: string }).id
  }
  async function updateCycle(id: string, patch: Partial<ReviewCycle>) {
    const { error } = await supabase.from('review_cycles').update(patch).eq('id', id)
    if (error) fail(error)
  }
  async function deleteCycle(id: string) {
    const { error } = await supabase.from('review_cycles').delete().eq('id', id).eq('status', 'draft')
    if (error) fail(error)
  }
  async function launchCycle(id: string, people: string[]) {
    const { data, error } = await supabase.rpc('launch_review_cycle', { p_cycle: id, p_people: people })
    if (error) fail(error)
    return data as number
  }
  async function getCycle(id: string) {
    const [{ data: cycle, error }, { data: packets, error: e2 }] = await Promise.all([
      supabase.from('review_cycles').select('*').eq('id', id).maybeSingle(),
      supabase.from('review_packets').select('*, employee:employee_id (first_name, last_name, team_id), manager:manager_id (first_name, last_name)').eq('cycle_id', id),
    ])
    if (error || e2) fail(error ?? e2)
    const ids = (packets ?? []).map(p => (p as { id: string }).id)
    const { data: resp } = ids.length ? await supabase.from('review_responses').select('packet_id, role, submitted_at').in('packet_id', ids) : { data: [] }
    return { cycle: cycle as unknown as ReviewCycle | null, packets: (packets ?? []) as unknown as HrPacket[], responses: (resp ?? []) as { packet_id: string, role: string, submitted_at: string | null }[] }
  }
  async function getPacket(id: string) {
    const { data, error } = await supabase.from('review_packets')
      .select('*, employee:employee_id (first_name, last_name, team_id), manager:manager_id (first_name, last_name), review_cycles (*)').eq('id', id).maybeSingle()
    if (error) fail(error)
    return data as unknown as (HrPacket & { review_cycles: ReviewCycle }) | null
  }
  async function conclude(id: string, rating: number | null, strengths: string, improvements: string, objectives: { text: string }[]) {
    const { error } = await supabase.rpc('hr_conclude_review', { p_packet: id, p_rating: rating as number, p_strengths: strengths, p_improvements: improvements, p_objectives: objectives })
    if (error) fail(error)
  }
  async function share(id: string) {
    const { error } = await supabase.rpc('share_review', { p_packet: id })
    if (error) fail(error)
  }

  // ── Participants ───────────────────────────────────────────────────────
  async function myPackets() {
    const { data, error } = await supabase.rpc('my_review_packets')
    if (error) fail(error)
    return (data ?? []) as unknown as MyPacket[]
  }
  async function listResponses(packetId: string) {
    const { data, error } = await supabase.from('review_responses').select('*').eq('packet_id', packetId)
    if (error) fail(error)
    return (data ?? []) as unknown as ReviewResponse[]
  }
  async function saveResponse(r: ReviewResponse) {
    const row = { packet_id: r.packet_id, author_id: r.author_id, role: r.role, ratings: r.ratings, comments: r.comments, answers: r.answers, objectives: r.objectives as ObjectiveReview[], submitted_at: r.submitted_at }
    const { error } = r.id
      ? await supabase.from('review_responses').update(row).eq('id', r.id)
      : await supabase.from('review_responses').insert(row)
    if (error) fail(error)
  }
  async function acknowledge(packetId: string, comment: string) {
    const { error } = await supabase.rpc('acknowledge_review', { p_packet: packetId, p_comment: comment })
    if (error) fail(error)
  }

  return { listTemplates, saveTemplate, listCycles, createCycle, updateCycle, deleteCycle, launchCycle, getCycle, getPacket, conclude, share, myPackets, listResponses, saveResponse, acknowledge }
}

/**
 * What the candidate sees: 4 coarse steps, never the internal stage names or
 * a rejection reason. received → in review → interviews → decision.
 */
export function publicStep(stage: string, status: string): 'received' | 'review' | 'interviews' | 'offer' | 'closed' | 'withdrawn' | 'hired' {
  if (status === 'withdrawn') return 'withdrawn'
  if (status === 'rejected') return 'closed'
  if (status === 'hired' || stage === 'hired') return 'hired'
  if (stage === 'new') return 'received'
  if (stage === 'screen') return 'review'
  if (stage === 'offer') return 'offer'
  return 'interviews'
}

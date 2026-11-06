import { describe, expect, it } from 'vitest'
import { reviewMail } from '../../server/utils/review-mails'

const SITE = 'https://tando.example.com'
describe('reviewMail (TND-32)', () => {
  it('self review: subject with the campaign, link to the packet', () => {
    const m = reviewMail({ kind: 'review_requested', data: { cycle: 'Revue 2026', packet_id: 'p1', role: 'self' } }, 'Emma', SITE)
    expect(m.subject).toBe('Votre auto-évaluation est ouverte — Revue 2026')
    expect(m.text).toContain('Bonjour Emma,')
    expect(m.text).toContain(`${SITE}/mes-evaluations/p1`)
  })
  it('manager review names the employee', () => {
    const m = reviewMail({ kind: 'review_requested', data: { cycle: 'Revue 2026', packet_id: 'p1', role: 'manager', who: 'Emma Employée' } }, 'Marc', SITE)
    expect(m.subject).toBe('Évaluation de Emma Employée à rédiger — Revue 2026')
  })
  it('peer request links to the colleague form and recalls anonymity', () => {
    const m = reviewMail({ kind: 'review_peer_requested', data: { cycle: 'Revue 2026', packet_id: 'p1', who: 'Emma Employée' } }, '', SITE)
    expect(m.text).toContain(`${SITE}/mes-evaluations/collegue/p1`)
    expect(m.text).toMatch(/anonyme/)
    expect(m.text.startsWith('Bonjour,')).toBe(true)
  })
  it('proposal and share', () => {
    expect(reviewMail({ kind: 'review_peers_proposed', data: { cycle: 'R', packet_id: 'p', who: 'Emma' } }, 'Marc', SITE).subject).toBe('Emma propose ses collègues — R')
    expect(reviewMail({ kind: 'review_shared', data: { cycle: 'R', packet_id: 'p' } }, 'Emma', SITE).subject).toBe('Votre dossier d’évaluation est disponible — R')
  })
})

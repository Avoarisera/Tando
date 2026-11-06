import { requireAdmin } from '../../../utils/require-admin'
/**
 * Domain check (TND-30 lot 4): status of the sending domain at Resend and the
 * DNS records to add (SPF / DKIM), so the admin can fix deliverability alone.
 */
interface ResendRecord { record: string, name: string, type: string, value: string, status: string, ttl?: string, priority?: number }
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { data: s } = await supabase.from('mail_settings').select('from_email').eq('id', true).single()
  const { data: key } = await supabase.rpc('get_mail_api_key')
  const domain = s?.from_email?.split('@')[1]
  if (!domain || typeof key !== 'string' || !key) throw createError({ statusCode: 400, statusMessage: 'Enregistrez d’abord la clé et l’adresse d’expédition' })
  const headers = { Authorization: `Bearer ${key}` }
  const list = await fetch('https://api.resend.com/domains', { headers }).catch(() => null)
  if (!list) throw createError({ statusCode: 502, statusMessage: 'Resend injoignable' })
  if (list.status === 401 || list.status === 403) throw createError({ statusCode: 400, statusMessage: 'Clé refusée par Resend (droits « Full access » nécessaires pour lire les domaines)' })
  const body = await list.json().catch(() => null) as { data?: { id: string, name: string, status: string }[] } | null
  const found = body?.data?.find(d => d.name.toLowerCase() === domain.toLowerCase())
  if (!found) return { domain, status: 'missing', records: [] as ResendRecord[] }
  const one = await fetch(`https://api.resend.com/domains/${found.id}`, { headers }).catch(() => null)
  const detail = one ? await one.json().catch(() => null) as { status?: string, records?: ResendRecord[] } | null : null
  return { domain, status: detail?.status ?? found.status, records: (detail?.records ?? []).map(r => ({ record: r.record, name: r.name, type: r.type, value: r.value, status: r.status, priority: r.priority })) }
})

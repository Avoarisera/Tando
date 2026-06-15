# RFC-017 — Notification Engine

**ID:** RFC-017  
**Title:** Notification Engine — Supabase pg_cron + Edge Function + Resend email  
**Sprint:** 4  
**Complexity:** High  
**Predecessor:** RFC-016  
**Successor:** —

---

## Summary

Ce RFC implémente l'envoi automatique d'emails de notification (anniversaires, ancienneté, fin de période d'essai). Avant ce RFC, les colonnes `birth_date` et `trial_ends_at` existent mais n'ont aucun effet. Après, un cron quotidien à 08h00 UTC déclenche une Edge Function qui interroge les profils, envoie les emails via Resend et log les envois pour éviter les doublons.

---

## Features Addressed

| Feature | Description |
|---------|-------------|
| F33 | Email anniversaire de naissance |
| F34 | Email anniversaire d'ancienneté |
| F35 | Email fin de période d'essai (J-7 + J0) |

---

## Dependencies

- **Requires:** RFC-014 (tables `profiles` avec `birth_date`/`trial_ends_at`, `notification_logs`)
- **Enables:** — (dernier RFC Sprint 4)

---

## Complexity: High

---

## Technical Approach

### Architecture

```
Supabase pg_cron (0 8 * * *)
  └─ pg_net HTTP POST → /functions/v1/daily-notifications
       └─ Edge Function (Deno)
            ├─ Requête profiles (tous les employés)
            ├─ Détection événements du jour (birthday, work_anniversary, trial_end_j7, trial_end_j0)
            ├─ Récupération emails destinataires (admins + managers)
            ├─ Vérification notification_logs (déduplication)
            ├─ Envoi Resend API
            └─ Insert notification_logs
```

### Edge Function — `supabase/functions/daily-notifications/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'notifications@wakabods.com'  // domaine vérifié sur Resend

interface Profile {
  id: string
  first_name: string
  last_name: string
  role: string
  team_id: string | null
  joined_at: string
  birth_date: string | null
  trial_ends_at: string | null
  email: string  // depuis auth.users via service role
}

Deno.serve(async (req) => {
  // Vérification basique du secret partagé cron
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]  // YYYY-MM-DD

  // Récupérer tous les employés avec leurs emails
  const { data: employees, error: empError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, team_id, joined_at, birth_date, trial_ends_at')
    .eq('role', 'employee')

  if (empError) return new Response(empError.message, { status: 500 })

  // Récupérer emails des admins et managers via auth admin API
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError) return new Response(usersError.message, { status: 500 })

  const userEmailMap = new Map(users.map(u => [u.id, u.email ?? '']))

  const adminEmails = (await supabase.from('profiles').select('id').eq('role', 'admin')).data
    ?.map(p => userEmailMap.get(p.id) ?? '')
    .filter(Boolean) ?? []

  const results: string[] = []

  for (const emp of employees ?? []) {
    const empEmail = userEmailMap.get(emp.id) ?? ''

    // Récupérer email du manager de l'équipe
    let managerEmail = ''
    if (emp.team_id) {
      const { data: mgr } = await supabase
        .from('profiles')
        .select('id')
        .eq('team_id', emp.team_id)
        .eq('role', 'manager')
        .single()
      if (mgr) managerEmail = userEmailMap.get(mgr.id) ?? ''
    }

    const recipients = [...adminEmails, ...(managerEmail ? [managerEmail] : [])].filter(Boolean)

    // F33 — Anniversaire de naissance
    if (emp.birth_date) {
      const bd = new Date(emp.birth_date)
      if (bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate()) {
        await sendIfNotSent({
          type: 'birthday',
          subjectUserId: emp.id,
          sentDate: todayStr,
          subject: `Anniversaire de ${emp.first_name} aujourd'hui !`,
          html: `<p>C'est l'anniversaire de <strong>${emp.first_name} ${emp.last_name}</strong> aujourd'hui !</p>`,
          recipients,
          results,
        })
      }
    }

    // F34 — Anniversaire d'ancienneté
    const joinedAt = new Date(emp.joined_at)
    const yearsWorked = today.getFullYear() - joinedAt.getFullYear()
    if (
      yearsWorked >= 1
      && joinedAt.getMonth() === today.getMonth()
      && joinedAt.getDate() === today.getDate()
    ) {
      await sendIfNotSent({
        type: 'work_anniversary',
        subjectUserId: emp.id,
        sentDate: todayStr,
        subject: `${emp.first_name} fête ses ${yearsWorked} an${yearsWorked > 1 ? 's' : ''} chez WakaBods !`,
        html: `<p><strong>${emp.first_name} ${emp.last_name}</strong> est chez WakaBods depuis ${yearsWorked} an${yearsWorked > 1 ? 's' : ''} aujourd'hui !</p>`,
        recipients,
        results,
      })
    }

    // F35 — Fin de période d'essai
    if (emp.trial_ends_at) {
      const trialDate = new Date(emp.trial_ends_at)
      trialDate.setUTCHours(0, 0, 0, 0)

      const j7 = new Date(today)
      j7.setUTCDate(j7.getUTCDate() + 7)

      if (trialDate.getTime() === j7.getTime()) {
        await sendIfNotSent({
          type: 'trial_end_j7',
          subjectUserId: emp.id,
          sentDate: todayStr,
          subject: `Période d'essai de ${emp.first_name} se termine dans 7 jours`,
          html: `<p>La période d'essai de <strong>${emp.first_name} ${emp.last_name}</strong> se termine le ${formatDate(emp.trial_ends_at)}.</p>`,
          recipients,
          results,
        })
      }

      if (trialDate.getTime() === today.getTime()) {
        await sendIfNotSent({
          type: 'trial_end_j0',
          subjectUserId: emp.id,
          sentDate: todayStr,
          subject: `Période d'essai de ${emp.first_name} terminée aujourd'hui`,
          html: `<p>La période d'essai de <strong>${emp.first_name} ${emp.last_name}</strong> se termine aujourd'hui.</p>`,
          recipients,
          results,
        })
      }
    }
  }

  return new Response(JSON.stringify({ sent: results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function sendIfNotSent(params: {
  type: string
  subjectUserId: string
  sentDate: string
  subject: string
  html: string
  recipients: string[]
  results: string[]
}) {
  const { type, subjectUserId, sentDate, subject, html, recipients, results } = params

  // Vérifier déduplication
  const { data: existing } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('notification_type', type)
    .eq('subject_user_id', subjectUserId)
    .eq('sent_date', sentDate)
    .maybeSingle()

  if (existing) return  // déjà envoyé aujourd'hui

  // Envoyer via Resend
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
    }),
  })

  if (!res.ok) {
    results.push(`ERROR ${type} ${subjectUserId}: ${await res.text()}`)
    return
  }

  // Log envoi
  await supabase.from('notification_logs').insert({
    notification_type: type,
    subject_user_id: subjectUserId,
    sent_date: sentDate,
    recipients,
  })

  results.push(`SENT ${type} ${subjectUserId}`)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
```

### pg_cron — Configuration SQL

```sql
-- Activer pg_cron et pg_net (via Supabase Dashboard > Extensions)
-- Puis créer le job :

SELECT cron.schedule(
  'daily-notifications',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/daily-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Variables d'environnement à configurer

```bash
# Secrets Edge Function (via supabase CLI)
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set CRON_SECRET=un-secret-aleatoire-fort

# Supabase app settings (pour pg_cron)
# Dans Supabase Dashboard > Settings > Database > Custom config :
# app.supabase_url = https://[project-ref].supabase.co
# app.cron_secret = un-secret-aleatoire-fort  (même valeur que ci-dessus)
```

### Déploiement Edge Function

```bash
supabase functions deploy daily-notifications
```

---

## Acceptance Criteria

- [ ] Edge Function `daily-notifications` déployée et accessible
- [ ] pg_cron job créé : `cron.schedule('daily-notifications', '0 8 * * *', ...)`
- [ ] Appel manuel → si `birth_date` d'un employé = aujourd'hui → email envoyé aux admins + manager
- [ ] Appel deux fois le même jour → deuxième appel ne renvoie pas (log existant)
- [ ] `notification_logs` contient une ligne par envoi avec les bons champs
- [ ] Sujet email correct pour chaque type de notification
- [ ] Si `birth_date = NULL` → aucun email birthday envoyé
- [ ] Si `trial_ends_at = NULL` → aucune alerte trial envoyée
- [ ] Calcul années d'ancienneté correct (testé avec `joined_at` d'il y a exactement N ans)
- [ ] CRON_SECRET requis — appel sans header → 401

---

## Security Considerations

- Edge Function utilise `SUPABASE_SERVICE_ROLE_KEY` pour accéder à `auth.admin.listUsers()` et `notification_logs` — jamais exposée côté client
- `RESEND_API_KEY` uniquement dans les secrets Supabase Edge Function — jamais dans le code Nuxt
- `x-cron-secret` partagé entre pg_cron et l'Edge Function — empêche les appels non autorisés

---

## Error Handling

- Erreur Resend API → loggée dans `results` mais n'arrête pas le traitement des autres employés
- Erreur DB fetch → Edge Function retourne HTTP 500 avec le message d'erreur
- L'absence d'une variable d'env au démarrage (`RESEND_API_KEY`) → `Deno.env.get()` retourne undefined → l'envoi échoue avec 401 Resend → résultat dans `results` sans crash global

---

## Testing Strategy

### Test manuel

1. Définir `birth_date` d'Emma = aujourd'hui via section admin sur `/profile`
2. Appeler l'Edge Function manuellement : `curl -X POST https://[url]/functions/v1/daily-notifications -H "x-cron-secret: [secret]"`
3. Vérifier réponse JSON : `{ "sent": ["SENT birthday [emma-id]"] }`
4. Vérifier email reçu sur la boîte admin
5. Rappeler la fonction → `results` vide (déduplication)
6. Vérifier `notification_logs` → 1 ligne

### Test annee bisextile (joined_at 29 fév)
7. Mettre `joined_at = 2024-02-29` pour un employé de test
8. Le 28 fév ou 1 mars d'une année non bissextile → comportement documenté dans le code (le `getDate()` comparaison fait le bon choix)

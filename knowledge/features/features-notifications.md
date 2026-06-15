# Features — Notifications & Admin Profile Fields

**Sprint:** 4  
**PRD refs:** NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04

---

### F32 — Saisie `birth_date` / `trial_ends_at` via Supabase Dashboard

**Priority:** Won't Have (in-app UI)  
**Status:** ~~Annulé — RFC-016 supprimé~~ Remplacé par approche backoffice  
**Complexity:** —  
**Personas:** admin technique  
**Depends on:** RFC-014 (migration profiles)

**Description**  
Les colonnes `birth_date` et `trial_ends_at` existent sur la table `profiles` (migration RFC-014). Leur saisie s'effectue **directement via le Supabase Dashboard** (Table Editor) — aucun code Nuxt/Vue n'est requis pour cette feature.

> **Décision D8 (confirmée):** pas d'UI app pour ces champs. Un admin technique renseigne les dates en base. Les notifications NOTIF-02 à NOTIF-04 se déclenchent dès que les valeurs sont présentes, quelle que soit la méthode de saisie.

---

### F33 — Notification email : anniversaire de naissance

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin (destinataire), Edge Function (émetteur)  
**Depends on:** RFC-014 (migration profiles + notification_logs), RFC-017 (Edge Function)

**Description**  
Le système envoie un email aux admins et au manager de l'équipe le jour de l'anniversaire d'un employé.

**Acceptance Criteria**
- [ ] Cron `0 8 * * *` (UTC) déclenche l'Edge Function `daily-notifications`
- [ ] La fonction interroge `profiles WHERE EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM birth_date) = EXTRACT(DAY FROM CURRENT_DATE)`
- [ ] Email envoyé à : tous les admins + le manager de l'équipe de l'employé concerné
- [ ] Sujet : `"Anniversaire de {first_name} aujourd'hui !"`
- [ ] Si aucun employé → aucun email envoyé
- [ ] Déduplication : avant envoi, vérifier `notification_logs` sur `(notification_type='birthday', subject_user_id, sent_date=CURRENT_DATE)` — si déjà présent, skip
- [ ] Log inséré dans `notification_logs` après envoi réussi

**Edge Cases**
- Employé sans `birth_date` renseigné → ignoré
- Manager non assigné à l'équipe → seuls les admins reçoivent l'email
- Cron tourne deux fois dans la journée → deuxième exécution ignorée (log existant)

**Technical Notes**
- Provider email : Resend (`RESEND_API_KEY` env var Edge Function)
- `notification_type = 'birthday'`
- Emails des destinataires : `auth.admin.listUsers()` filtré par rôle admin + manager de `team_id`

---

### F34 — Notification email : anniversaire d'ancienneté

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin (destinataire), Edge Function (émetteur)  
**Depends on:** RFC-017 (Edge Function)

**Description**  
Email annuel célébrant les années de fidélité d'un employé, calculé depuis `joined_at`.

**Acceptance Criteria**
- [ ] Même cron, même Edge Function que F33
- [ ] Condition : `EXTRACT(MONTH FROM joined_at) = mois courant AND EXTRACT(DAY FROM joined_at) = jour courant AND (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM joined_at)) >= 1`
- [ ] Sujet : `"{first_name} fête ses {N} an(s) chez WakaBods !"`
- [ ] `N` = nombre d'années complètes (utiliser `date_part('year', age(joined_at))` ou calcul équivalent)
- [ ] Calcul correct les années bissextiles (29 fév → email le 28 fév ou 1 mars selon la logique retenue — documenter le choix dans le code)
- [ ] Seules les anciennetés >= 1 an déclenchent une notification
- [ ] Même mécanisme de déduplication (`notification_type = 'work_anniversary'`)

**Edge Cases**
- `joined_at` le 29 février → comportement documenté dans l'Edge Function
- Employé dont c'est à la fois l'anniversaire et l'anniversaire d'ancienneté → deux emails distincts envoyés (via deux appels Resend séparés avec des `notification_type` différents)

**Technical Notes**
- `notification_type = 'work_anniversary'`

---

### F35 — Notification email : fin de période d'essai

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin (destinataire), Edge Function (émetteur)  
**Depends on:** RFC-014 (colonnes trial_ends_at), RFC-017 (Edge Function)

**Description**  
Deux alertes envoyées à J-7 et J0 pour préparer la décision de titularisation.

**Acceptance Criteria**
- [ ] Alerte **J-7** : `trial_ends_at = CURRENT_DATE + interval '7 days'`
  - Sujet : `"Période d'essai de {first_name} se termine dans 7 jours"`
  - `notification_type = 'trial_end_j7'`
- [ ] Alerte **J0** : `trial_ends_at = CURRENT_DATE`
  - Sujet : `"Période d'essai de {first_name} terminée aujourd'hui"`
  - `notification_type = 'trial_end_j0'`
- [ ] Destinataires : admins + manager direct de l'employé concerné
- [ ] Si `trial_ends_at IS NULL` → aucune alerte
- [ ] Déduplication via `notification_logs` sur `(notification_type, subject_user_id, sent_date)`

**Edge Cases**
- Si l'employé n'a pas de manager (`team_id = NULL`) → seuls les admins reçoivent l'email
- `trial_ends_at` dans le passé → la condition ne matche plus, aucune alerte (pas de rattrapage)

**Technical Notes**
- `notification_type` distinct pour J-7 et J0 → deux lignes dans `notification_logs`, permettant les deux alertes le bon jour

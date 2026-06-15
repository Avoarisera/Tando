# RFC-014 — Sprint 4 : DB Schema Extensions

**ID:** RFC-014  
**Title:** DB Schema Extensions — profiles dates, invoices table, notification_logs, new RLS  
**Sprint:** 4  
**Complexity:** Medium  
**Predecessor:** RFC-013  
**Successor:** RFC-015, RFC-016, RFC-017, RFC-018

---

## Summary

Ce RFC ajoute toutes les extensions de schéma nécessaires au Sprint 4. Avant ce RFC, la DB ne contient pas les champs `birth_date` / `trial_ends_at` sur `profiles`, ni les tables `invoices` et `notification_logs`. Après ce RFC, toutes les tables et politiques RLS du Sprint 4 sont en place et les autres RFCs peuvent s'appuyer dessus.

---

## Features Addressed

| Feature | Description |
|---------|-------------|
| F32 | Colonnes `birth_date` et `trial_ends_at` sur `profiles` |
| F33–F35 | Table `notification_logs` pour déduplication cron |
| F39–F41 | Table `invoices` avec statut et chemin storage |

---

## Dependencies

- **Requires:** RFC-013 (déploiement — pas strictement, mais la DB est stable après ce RFC)
- **Enables:** RFC-015 (dashboard RPC), RFC-016 (profile fields UI), RFC-017 (factures), RFC-018 (notifications)

---

## Complexity: Medium

---

## Technical Approach

### Migration unique — `supabase/migrations/[date]_005_sprint4_schema.sql`

```sql
-- 1. Ajout colonnes sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS trial_ends_at date;

-- 2. Table invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  client text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR'
    CHECK (currency IN ('EUR','USD','GBP','CAD','AUD','MGA')),
  invoice_date date NOT NULL,
  due_date date,
  notes text,
  status text NOT NULL DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'envoyee', 'payee')),
  pdf_path text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_invoices" ON invoices
FOR ALL TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- 3. Table notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL
    CHECK (notification_type IN ('birthday','work_anniversary','trial_end_j7','trial_end_j0')),
  subject_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sent_date date NOT NULL DEFAULT CURRENT_DATE,
  recipients text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (notification_type, subject_user_id, sent_date)
);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
-- Pas de politique TO authenticated — accès service role uniquement (Edge Function)

-- 4. Mise à jour RLS profiles — autoriser admin à modifier birth_date et trial_ends_at
CREATE POLICY "admin_update_profile_dates" ON profiles
FOR UPDATE TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- 5. RPC get_dashboard_snapshot (dashboard Sprint 4)
CREATE OR REPLACE FUNCTION get_dashboard_snapshot()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_week_start date := date_trunc('week', CURRENT_DATE)::date;
  v_week_end date := (date_trunc('week', CURRENT_DATE) + interval '6 days')::date;
  v_total int;
  v_on_leave_today int;
  v_on_leave_week int;
  v_present int;
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT COUNT(*) INTO v_total FROM profiles WHERE role = 'employee';

  SELECT COUNT(DISTINCT lr.user_id) INTO v_on_leave_today
  FROM leave_requests lr
  WHERE lr.status = 'approved'
    AND lr.start_date <= v_today
    AND lr.end_date >= v_today;

  SELECT COUNT(DISTINCT lr.user_id) INTO v_on_leave_week
  FROM leave_requests lr
  WHERE lr.status = 'approved'
    AND lr.start_date <= v_week_end
    AND lr.end_date >= v_week_start;

  v_present := v_total - v_on_leave_today;

  RETURN (
    SELECT json_build_object(
      'total_employees', v_total,
      'on_leave_today', v_on_leave_today,
      'on_leave_week', v_on_leave_week,
      'present', v_present,
      'employees', (
        SELECT json_agg(
          json_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'role', p.role,
            'team_name', t.name,
            'joined_at', p.joined_at,
            'on_leave', (
              lr_today.id IS NOT NULL
            ),
            'leave_type_name', lt.name,
            'leave_end_date', lr_today.end_date
          )
          ORDER BY p.last_name, p.first_name
        )
        FROM profiles p
        LEFT JOIN teams t ON t.id = p.team_id
        LEFT JOIN LATERAL (
          SELECT lr.id, lr.end_date, lr.leave_type_id
          FROM leave_requests lr
          WHERE lr.user_id = p.id
            AND lr.status = 'approved'
            AND lr.start_date <= v_today
            AND lr.end_date >= v_today
          ORDER BY lr.start_date
          LIMIT 1
        ) lr_today ON true
        LEFT JOIN leave_types lt ON lt.id = lr_today.leave_type_id
        WHERE p.role = 'employee'
      )
    )
  );
END;
$$;
```

### Supabase Storage — Bucket `invoices`

Créer via Supabase Dashboard ou CLI :
```bash
supabase storage create invoices --public=false
```

Ou via migration SQL :
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin_storage_invoices" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'invoices'
  AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  bucket_id = 'invoices'
  AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
```

---

## Acceptance Criteria

- [ ] `profiles` contient `birth_date date` et `trial_ends_at date` (nullables)
- [ ] Table `invoices` créée avec toutes les colonnes, contraintes et RLS
- [ ] Table `notification_logs` créée avec contrainte UNIQUE `(notification_type, subject_user_id, sent_date)`
- [ ] RLS `admin_update_profile_dates` active sur `profiles`
- [ ] RPC `get_dashboard_snapshot()` répond avec le JSON attendu depuis un compte admin
- [ ] Appel depuis un compte employee ou manager → exception `'Accès refusé'`
- [ ] Bucket `invoices` créé, privé, avec politique admin-only
- [ ] Migration idempotente (`IF NOT EXISTS`, `OR REPLACE`)

---

## Security Considerations

- `get_dashboard_snapshot` est SECURITY DEFINER avec guard `auth.uid()` → rôle admin — même pattern que `create_leave_request`
- `notification_logs` : RLS activée, aucune politique `authenticated` → impossible d'insérer côté client
- La politique `admin_update_profile_dates` permet à l'admin de modifier ANY colonne sur profiles — si le schéma évolue, resserrer la politique avec `WITH CHECK` sur une liste de colonnes (PostgreSQL 15 ne supporte pas le column-level RLS nativement, mais le composable côté client n'envoie que les champs autorisés)

---

## Testing Strategy

1. Lancer `supabase db reset` → migration appliquée sans erreur
2. `SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'` → contient `birth_date`, `trial_ends_at`
3. Connexion admin → `supabase.rpc('get_dashboard_snapshot')` → JSON valide
4. Connexion employee → même RPC → erreur 403 / exception
5. Connexion admin → `supabase.from('invoices').insert(...)` → succès
6. Connexion employee → même insert → RLS bloque (erreur 42501)
7. Upload test PDF en admin → URL signée générée → accessible 60s

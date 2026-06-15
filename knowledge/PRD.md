# PRD — WakaBods POC

**Version:** 1.3  
**Date:** 2026-05-18  
**Statut:** Draft  
**Langue produit:** Français  

---

## 1. Contexte & Problème

Les équipes remote souffrent d'un suivi des congés fragmenté : emails, tableurs, absence de validation structurée. WakaBods est une plateforme RH légère qui centralise le cycle complet des demandes de congé avec une validation à deux niveaux (manager → admin), un calendrier d'équipe et un suivi des soldes en temps réel.

Ce document couvre le **POC (Proof of Concept)**, dont l'objectif est de démontrer la valeur fondamentale du produit à un client ou investisseur en 2 à 3 semaines. Le POC doit être **propre, crédible et démontrable** : un employé pose un congé, le manager valide en premier, puis l'admin confirme. Tout le monde voit le calendrier selon son périmètre.

**Stack technique retenue :**
- **Frontend :** Nuxt 4.4.2 + Vue 3.5 + Tailwind CSS
- **Backend / Auth / DB :** Supabase (Auth, PostgreSQL, Row Level Security)
- **State management :** Composables Nuxt (`useState`, `useAsyncData`) — pas de Pinia pour le POC
- **Déploiement cible :** Vercel (Nuxt SSR) + projet Supabase Free tier

---

## 2. Goals and Objectives

| # | Objectif | Mesure de succès |
|---|----------|-----------------|
| G1 | Valider le flux complet congé end-to-end | Un congé suit le cycle complet : créé → validé manager → validé admin → reflété dans solde et calendrier |
| G2 | Démontrer la gestion multi-rôles avec validation à deux niveaux | Les 3 rôles ont des vues et des actions distinctes ; les permissions RLS sont respectées |
| G3 | Produire une base réutilisable pour le MVP | Zéro dette architecturale majeure : composants, routes et RLS structurés pour être étendus |
| G4 | Livrer en 2-3 semaines | Toutes les features du périmètre POC livrées et QA validée |

---

## 3. Scope

### Inclus dans le POC

- Authentification email/mot de passe
- Protection des routes privées
- Profil utilisateur avec solde congé
- Navigation principale responsive (avec lien Types de congé pour l'admin)
- Création et suivi de demandes de congé
- Validation à deux niveaux : manager (niveau 1) puis admin (niveau 2)
- Calendrier selon le rôle (employé / manager / admin)
- Calcul automatique du solde (quota annuel fixe, recalcul à la volée)
- Déconnexion
- Données de démo pré-seedées
- Types de congé configurables par l'admin (`/leave-types`)
- **Notifications email automatiques** (anniversaires, ancienneté, fin de période d'essai) via Supabase pg_cron + Edge Functions
- **Tableau de bord admin** — capacité équipe en temps réel (`/dashboard`)
- **Gestion des factures** — Factures Vault PDF avec Supabase Storage (`/invoices`)

### Explicitement exclus du POC

- Inscription en self-service (comptes créés via seed uniquement)
- Notifications push (email uniquement via Edge Functions)
- Export PDF / CSV
- Intégrations tierces (Slack, Google Calendar, HRIS)
- Gestion des jours fériés et weekends (jours calendaires simples)
- Acquisition mensuelle de congés (quota annuel fixe uniquement)
- Multi-langue (français uniquement)
- Gestion des équipes par l'admin (équipes pré-seedées — backoffice via Supabase Dashboard)
- Création / suppression de profils employés par l'admin (backoffice via Supabase Dashboard)
- Pagination des listes (volume de démo limité)
- Délégation de validation (absence du manager)

---

## 4. User Personas

### 4.1 Admin — *Responsable RH / Dirigeant*
- Accès total à toutes les données
- **Deuxième niveau de validation** : approuve ou refuse les demandes déjà validées par le manager
- Peut également rejeter directement une demande à n'importe quel stade (`pending` ou `manager_approved`)
- Consulte les soldes de toute l'entreprise
- Voit le calendrier global (toutes équipes)
- Configure les types de congé (`/leave-types`)
- **Tableau de bord capacité** (`/dashboard`) : métriques présents/absents + statut individuel de chaque employé
- **Gestion des factures** (`/invoices`) : crée, suit et archive les factures avec PDF
- `birth_date` et `trial_ends_at` des employés sont renseignés directement via le **Supabase Dashboard** (backoffice admin technique) — pas d'UI dédiée dans l'app

### 4.2 Manager — *Chef d'équipe*
- Voit uniquement les membres de son équipe
- **Premier niveau de validation** : approuve ou refuse les demandes `pending` de son équipe
- Si le manager approuve → statut passe à `manager_approved`, en attente de l'admin
- Si le manager refuse → statut `rejected`, fin du flux
- Voit le calendrier de son équipe
- **Voit les soldes de son équipe** (sur la page `/leave-requests` vue manager — résolution de Q1)

### 4.3 Employé — *Collaborateur remote*
- Crée des demandes de congé
- Consulte son propre solde et l'historique de ses demandes
- Voit les congés `approved` de son équipe dans le calendrier
- Ne voit pas les soldes des autres membres de l'équipe

---

## 5. Leave Request — Cycle de validation

```
[Employé] Crée la demande
       ↓ statut: pending
[Manager] Valide (niveau 1)
       ↓ statut: manager_approved   ← ou rejected si refus manager
[Admin]   Valide (niveau 2)
       ↓ statut: approved           ← ou rejected si refus admin
       → Trigger PostgreSQL met à jour used_days dans leave_balances
       → Apparition dans le calendrier

Cas particulier — absence de manager :
[Admin]   Approuve directement pending → approved (bypass niveau 1)
       → même trigger, même effet sur le solde
```

**Règles métier :**
- Le solde n'est **jamais déduit** avant le statut `approved` (validation finale admin)
- Un refus à n'importe quel niveau clôt la demande (`rejected`) sans impact sur le solde
- L'admin peut approuver **ou** rejeter une demande `pending` directement, sans passer par le manager
- Un employé voit le statut de sa demande à chaque étape
- **Chevauchement :** une nouvelle demande ne peut pas chevaucher une demande `pending`, `manager_approved` ou `approved` du même employé — validation côté serveur (Supabase RPC)
- **Dates :** `start_date` ne peut pas être dans le passé (par rapport à la date du jour au moment de la soumission) ; `end_date >= start_date`
- **`days_count` :** `end_date - start_date + 1` (jours calendaires, weekends inclus) ; minimum 1 jour
- **Solde insuffisant :** la demande est bloquée si `days_count > restant` pour le type sélectionné — message d'erreur explicite

---

## 6. Functional Requirements

### Priorité 1 — Must Have (Sprint 1 & 2)

#### AUTH-01 — Connexion
- Page `/login` avec champs email et mot de passe
- Redirection vers `/profile` si succès
- Message d'erreur explicite si échec (identifiants incorrects ou compte inexistant)
- État de chargement pendant la requête (bouton désactivé + spinner)

#### AUTH-02 — Protection des routes
- Routes privées : `/profile`, `/leave-requests`, `/calendar`, `/leave-types`, `/dashboard`, `/invoices`
- Middleware global Nuxt redirige vers `/login` si non authentifié
- `/leave-types`, `/dashboard`, `/invoices` accessibles uniquement au rôle `admin` — les autres rôles reçoivent une page 403

#### AUTH-03 — Déconnexion
- Bouton *Déconnexion* visible dans la navigation sur toutes les pages privées
- Suppression de la session Supabase (`supabase.auth.signOut()`)
- Retour vers `/login`

#### PROFIL-01 — Fiche profil
- Page `/profile` affiche : prénom, nom, email, rôle (badge), équipe/département, date d'entrée
- Données non modifiables dans le POC

#### PROFIL-02 — Solde de congé
- Affiché sur la page `/profile` pour les rôles `employee` et `manager`
- Champs par type de congé actif : **Acquis / Utilisés / Restants**
- Formule : `restant = allocated_days - used_days` (lus depuis `leave_balances`)
- `used_days` est maintenu par un trigger PostgreSQL (cf. SOLDE-01) — lecture directe, pas de calcul à la volée
- L'admin ne voit pas son propre solde sur `/profile` (pas de solde admin dans le seed)

#### NAV-01 — Menu principal
- Présent sur toutes les pages privées via un layout Nuxt dédié
- Liens selon le rôle :
  - **Employé :** Profil, Demandes de congé, Calendrier, Déconnexion
  - **Manager :** Profil, Demandes de congé, Calendrier, Déconnexion
  - **Admin :** Profil, Demandes de congé, Calendrier, Types de congé, Tableau de bord, Factures, Déconnexion
- Responsive desktop (sidebar fixe 240px) et mobile (drawer hamburger)
- Lien actif mis en évidence (classe Tailwind active)

#### LEAVE-01 — Créer une demande de congé
- Bouton "Nouvelle demande" sur `/leave-requests` (employé uniquement) ouvre un modal
- Champs : type de congé (select, types actifs uniquement), date de début (date picker), date de fin (date picker), commentaire (textarea, optionnel, max 500 car.)
- Validation front : `start_date >= aujourd'hui`, `end_date >= start_date`
- Validation serveur (Supabase RPC `create_leave_request`) :
  - Vérifie l'absence de chevauchement avec les demandes existantes (`pending`, `manager_approved`, `approved`)
  - Vérifie que `days_count <= solde restant`
- Soumission crée un enregistrement avec statut `pending` et `days_count` calculé
- Confirmation visuelle (toast succès) ; modal se ferme
- En cas d'erreur serveur : message d'erreur inline dans le modal

#### LEAVE-02 — Historique employé
- Section sur `/leave-requests` (vue `employee`)
- Liste triée par `created_at DESC`
- Colonnes : type (badge coloré), période, durée (jours), statut (badge coloré), date de création
- Statuts affichés : *En attente*, *Validé manager*, *Approuvé*, *Refusé*
- État vide : message "Aucune demande pour le moment" + CTA "Créer une demande"

#### LEAVE-03 — File de validation manager
- Page `/leave-requests` (vue `manager`) : deux sections
  1. **À valider** : demandes `pending` de son équipe
  2. **Historique équipe** : toutes les demandes de son équipe (tous statuts), triées par `created_at DESC`
- Section "À valider" — colonnes : employé, type, dates, durée, commentaire, actions
- Section "Soldes équipe" : tableau prénom/nom + solde restant par type (congés payés uniquement pour le POC)
- Boutons *Approuver* et *Refuser* sur chaque demande `pending` avec confirmation modale
- Approve → update statut `manager_approved` + set `manager_reviewed_by` + `manager_reviewed_at`
- Reject → update statut `rejected` + set `manager_reviewed_by` + `manager_reviewed_at`

#### LEAVE-04 — Table admin — toutes les demandes
- Page `/leave-requests` (vue `admin`) : toutes les demandes, toutes équipes
- Colonnes : employé, équipe, type, dates, durée, statut (badge filtrable), date de création
- Filtre par statut (select : Tous / En attente / Validé manager / Approuvé / Refusé)
- Bouton *Approuver* visible sur les demandes `manager_approved` **et** `pending` (bypass niveau 1 possible)
- Bouton *Refuser* visible sur les demandes `pending` et `manager_approved`
- Chaque action nécessite une confirmation modale (pas d'action destructive sans confirm)

#### LEAVE-05 — Validation finale admin
- Approve sur `manager_approved` → statut `approved`, set `admin_reviewed_by` + `admin_reviewed_at`
- Approve sur `pending` (bypass manager) → statut `approved` directement ; `manager_reviewed_by` reste NULL
- Reject sur `manager_approved` ou `pending` → statut `rejected`, set `admin_reviewed_by` + `admin_reviewed_at`
- Dans tous les cas de passage à `approved` : le trigger PostgreSQL met à jour `used_days` dans `leave_balances`

#### SOLDE-01 — Calcul automatique via trigger
- Un trigger PostgreSQL `update_leave_balance` se déclenche sur `INSERT` et `UPDATE` de `leave_requests`
- Conditions : si le nouveau statut est `approved`, incrémente `used_days` du montant `days_count`
- Si un statut passe de `approved` à `rejected` (correction admin), décrémente `used_days`
- `restant = allocated_days - used_days` lu directement depuis `leave_balances`
- Les demandes `pending` et `manager_approved` n'impactent **jamais** `used_days`

### Priorité 2 — Must Have (Sprint 3)

#### CAL-01 — Calendrier employé
- Page `/calendar`
- Affiche ses propres congés (tous statuts) + congés `approved` de son équipe
- Vue mensuelle avec navigation mois précédent / mois suivant
- Informations par événement : prénom + nom, type de congé (couleur du type), statut (pour ses propres demandes)

#### CAL-02 — Calendrier manager
- Même page `/calendar`, filtrée sur l'équipe du manager
- Seuls les congés `approved` des membres (+ ses propres tous statuts)
- Encart "Absents aujourd'hui" : liste des membres avec congé `approved` couvrant la date du jour

#### CAL-03 — Calendrier admin
- Vue entreprise complète : tous les congés `approved`, toutes équipes
- Filtre optionnel par équipe (select)

#### TYPES-01 — Gestion des types de congé (admin)
- Page `/leave-types` (admin uniquement)
- Tableau : nom, couleur, statut actif/inactif, actions (Modifier, Désactiver/Activer)
- Bouton "Ajouter un type" → modal avec champs : nom (texte, requis), couleur (color picker ou input hex)
- Désactiver un type : `is_active = false` — le type n'apparaît plus dans le formulaire LEAVE-01 mais les demandes existantes conservent leur type (pas de cascade)
- Suppression : non disponible dans le POC (risque de cohérence référentielle)
- Types pré-seedés : Congé payé (#4CAF50), Congé maladie (#F44336), RTT (#2196F3), Congé sans solde (#9E9E9E)

#### ERROR-01 — États UI globaux
- **Loading :** skeleton loaders ou spinner sur toutes les requêtes asynchrones
- **Erreur :** banner d'erreur avec message (pas de crash silencieux)
- **Vide :** message contextuel + CTA selon la page
- **Succès :** toast notification (3s auto-dismiss) après chaque action de mutation
- Page **404** : page Nuxt `error.vue` avec lien retour accueil

### Priorité 3 — Sprint 4 (nouvelles fonctionnalités)

#### NOTIF-01 — Renseignement des champs `birth_date` / `trial_ends_at`
- Ces champs sont renseignés **via le Supabase Dashboard** par un admin technique — il n'y a pas d'UI dédiée dans l'app
- Les colonnes existent sur la table `profiles` (migration RFC-014) et déclenchent les notifications NOTIF-02 à NOTIF-04 dès qu'elles sont renseignées
- Aucun code Nuxt/Vue à implémenter pour cette entrée de données

#### NOTIF-02 — Notification email : anniversaire de naissance
- Cron quotidien à 08h00 UTC (Supabase pg_cron) déclenche une Edge Function
- Requête : `profiles WHERE EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM birth_date) = EXTRACT(DAY FROM CURRENT_DATE)`
- Email envoyé aux admins et au manager de l'employé concerné
- Sujet : `"Anniversaire de {prénom} aujourd'hui !"`
- Si aucun employé correspondant → aucun email
- Déduplication : vérification dans `notification_logs` avant envoi — UNIQUE `(notification_type, subject_user_id, sent_date)`

#### NOTIF-03 — Notification email : anniversaire d'ancienneté
- Même cron, même Edge Function
- Condition : `EXTRACT(MONTH FROM joined_at) = mois courant AND EXTRACT(DAY FROM joined_at) = jour courant AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM joined_at) >= 1`
- Sujet : `"{prénom} fête ses {N} an(s) chez WakaBods !"`
- Calcul des années bissextiles correct (`age()` PostgreSQL ou calcul par années complètes)
- Même mécanisme de déduplication

#### NOTIF-04 — Notification email : fin de période d'essai
- Même cron, même Edge Function
- Deux alertes :
  - **J-7** : `trial_ends_at = CURRENT_DATE + interval '7 days'` → sujet : `"Période d'essai de {prénom} se termine dans 7 jours"`
  - **J0** : `trial_ends_at = CURRENT_DATE` → sujet : `"Période d'essai de {prénom} terminée aujourd'hui"`
- Destinataires : admins + manager direct de l'employé
- Si `trial_ends_at IS NULL` → aucune alerte
- Même déduplication via `notification_logs`

#### DASH-01 — Tableau de bord admin — métriques d'équipe
- Page `/dashboard` accessible uniquement au rôle `admin` (middleware `admin-only`)
- Bandeau 4 métriques : **Total employés · En congé aujourd'hui · En congé cette semaine · Présents**
- "En congé aujourd'hui" mis en évidence (fond coloré distinct)
- Données chargées à l'ouverture via RPC `get_dashboard_snapshot()`
- Lien "Tableau de bord" dans la navigation, visible admin uniquement

#### DASH-02 — Tableau de bord admin — liste statuts employés
- Liste de tous les employés avec : nom complet · équipe · rôle · badge statut
- Badge **Présent** (vert) ou **En congé** (ambre)
- Si en congé : affiche le type (ex : Congé payé) + "Retour le {date}"
- Ancienneté calculée depuis `joined_at` affichée sur chaque ligne (ex : "2 ans")
- Données incluses dans la réponse de `get_dashboard_snapshot()`

#### DASH-03 — Tableau de bord admin — filtre présents / en congé
- Filtre client-side : "Tous" · "Présents" · "En congé"
- Le filtre ne déclenche pas de nouvel appel API — opère sur les données déjà chargées

#### INVOICE-01 — Création de fiche facture
- Page `/invoices` accessible uniquement au rôle `admin`
- Bouton "Nouvelle facture" → modal avec champs :
  - `reference` (texte, requis, unique), `client` (texte, requis), `amount` (nombre > 0, requis), `currency` (select : EUR / USD / GBP / CAD / AUD / MGA), `invoice_date` (date, requise), `due_date` (date, optionnel), `notes` (textarea, optionnel)
- Validation front : référence requise, client requis, montant > 0, date facture requise
- Erreur RPC affichée inline dans la modale (modale reste ouverte)
- Succès → toast "Facture enregistrée" · la facture apparaît dans la liste

#### INVOICE-02 — Upload et téléchargement PDF
- Zone upload dans la fiche facture : accepte uniquement `application/pdf`
- Spinner pendant upload · toast succès ou erreur
- Bouton "Voir PDF" génère une URL signée valable 60 secondes (Supabase Storage signed URL)
- Chemin storage : `invoices/{invoice_id}/{filename}` dans le bucket privé `invoices`

#### INVOICE-03 — Gestion du statut facture + filtre
- Trois statuts : `en_attente` (gris) · `envoyee` (bleu) · `payee` (vert)
- Changement de statut depuis la liste ou la fiche (via `.update()`)
- Filtre client-side par statut dans la liste
- Employee et manager n'ont aucun accès à `/invoices`

---

## 7. Non-Functional Requirements

| Catégorie | Exigence |
|-----------|----------|
| Sécurité | RLS Supabase sur toutes les tables — aucune donnée cross-team accessible côté client ; JWT validé côté serveur |
| Performance | Pages chargées en < 2s sur connexion standard (LCP) |
| Responsive | Fonctionnel sur desktop (1280px+) et mobile (375px+) ; Safari, Chrome, Firefox dernières versions |
| UX | États gérés partout : loading, erreur, vide, succès (cf. ERROR-01) |
| Qualité UI | Composants cohérents : sidebar, cards, formulaires, tables, badges, calendrier, modals, toasts |
| Données de démo | Seed reproductible et idempotent (relançable sans doublons) |
| Déploiement | Build Nuxt SSR sur Vercel, variables d'environnement gérées via Vercel Env |

---

## 8. Architecture Technique

### Structure des routes Nuxt

```
/login                   → page publique
/profile                 → layout: private, rôles: tous
/leave-requests          → layout: private, rôles: tous (vue adaptée au rôle)
/calendar                → layout: private, rôles: tous (vue adaptée au rôle)
/leave-types             → layout: private, rôles: admin uniquement
/dashboard               → layout: private, rôles: admin uniquement
/invoices                → layout: private, rôles: admin uniquement
```

### Middleware Nuxt

- `middleware/auth.global.ts` : vérifie la session Supabase, redirige vers `/login` si absente
- `middleware/admin-only.ts` : appliqué sur `/leave-types`, `/dashboard`, `/invoices` — retourne 403 si rôle ≠ `admin`

### Notifications — Architecture Supabase

- **pg_cron** : planifie un job SQL `SELECT net.http_post(...)` à `'0 8 * * *'` (08h00 UTC)
- **Edge Function `daily-notifications`** : appelée par pg_cron via `pg_net` HTTP POST ; interroge `profiles`, compare avec la date du jour, envoie les emails via **Resend API**, écrit dans `notification_logs`
- **Resend** : fournisseur email transactionnel (variable d'env `RESEND_API_KEY` côté Edge Function uniquement — jamais côté client)
- Déduplication : avant envoi, vérifier `notification_logs` sur `(notification_type, subject_user_id, sent_date)` — UNIQUE constraint garantit l'idempotence

### Supabase Storage — Bucket `invoices`

- Bucket **privé** (pas d'accès public)
- Chemin : `invoices/{invoice_id}/{filename}`
- Upload via `supabase.storage.from('invoices').upload(path, file)`
- Téléchargement via URL signée 60s : `supabase.storage.from('invoices').createSignedUrl(path, 60)`
- RLS Storage : seul le rôle `admin` peut uploader, télécharger, lister

### Variables d'environnement requises

```env
SUPABASE_URL=
SUPABASE_KEY=          # clé anon publique
SUPABASE_SERVICE_KEY=  # clé service (seed uniquement, jamais côté client)
```

### Supabase RPC (fonctions côté serveur)

- `create_leave_request(user_id, leave_type_id, start_date, end_date, comment)` : valide le chevauchement et le solde disponible, insère la demande — le trigger `update_leave_balance` prend ensuite le relais si `approved`

### Trigger PostgreSQL

- `update_leave_balance` : `AFTER INSERT OR UPDATE OF status ON leave_requests` — maintient `used_days` dans `leave_balances` en temps réel

---

## 9. Database Schema (Supabase / PostgreSQL)

```sql
-- Équipes
teams (
  id uuid PK DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
)

-- Profils utilisateurs (étend auth.users de Supabase)
profiles (
  id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  team_id uuid REFERENCES teams(id),   -- NULL pour l'admin
  joined_at date NOT NULL,
  birth_date date,                      -- optionnel, déclenche NOTIF-02 (ajout Sprint 4)
  trial_ends_at date,                   -- optionnel, déclenche NOTIF-04 (ajout Sprint 4)
  created_at timestamptz DEFAULT now()
)

-- Types de congé (configurables par admin)
leave_types (
  id uuid PK DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,   -- code hex, ex: '#4CAF50'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Demandes de congé
leave_requests (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  leave_type_id uuid NOT NULL REFERENCES leave_types(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count int NOT NULL CHECK (days_count >= 1),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'manager_approved', 'approved', 'rejected')),
  comment text CHECK (char_length(comment) <= 500),
  manager_reviewed_by uuid REFERENCES profiles(id),
  manager_reviewed_at timestamptz,
  admin_reviewed_by uuid REFERENCES profiles(id),
  admin_reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
)

-- Soldes de congé (used_days maintenu par trigger)
leave_balances (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  leave_type_id uuid NOT NULL REFERENCES leave_types(id),
  year int NOT NULL,
  allocated_days int NOT NULL DEFAULT 25,
  used_days int NOT NULL DEFAULT 0,   -- mis à jour par trigger update_leave_balance
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, leave_type_id, year)
)

-- Trigger PostgreSQL sur leave_requests :
-- AFTER INSERT OR UPDATE OF status ON leave_requests
-- Incrémente used_days si nouveau statut = 'approved'
-- Décrémente used_days si ancien statut = 'approved' ET nouveau statut ≠ 'approved'
-- (permet la correction admin : approved → rejected)

-- Factures (Sprint 4)
invoices (
  id uuid PK DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  client text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','USD','GBP','CAD','AUD','MGA')),
  invoice_date date NOT NULL,
  due_date date,
  notes text,
  status text NOT NULL DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'envoyee', 'payee')),
  pdf_path text,                         -- chemin storage : invoices/{id}/{filename}
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
)

-- Log de notifications — déduplication (Sprint 4)
notification_logs (
  id uuid PK DEFAULT gen_random_uuid(),
  notification_type text NOT NULL
    CHECK (notification_type IN ('birthday','work_anniversary','trial_end_j7','trial_end_j0')),
  subject_user_id uuid NOT NULL REFERENCES profiles(id),
  sent_date date NOT NULL DEFAULT CURRENT_DATE,
  recipients text[] NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (notification_type, subject_user_id, sent_date)
)
```

### RLS Policy Strategy

**`profiles`**
- `SELECT` : employé → `id = auth.uid()` ; manager → membres de son équipe + lui-même ; admin → toutes lignes
- Pas d'`INSERT`/`UPDATE`/`DELETE` côté client (seed uniquement)

**`leave_requests`**
- `SELECT` : employé → `user_id = auth.uid()` ; manager → utilisateurs de son équipe ; admin → toutes lignes
- `INSERT` : employé → `user_id = auth.uid()` uniquement (via RPC)
- `UPDATE` : manager → statut `pending → manager_approved/rejected` sur son équipe ; admin → tous statuts sur toutes lignes

**`leave_balances`**
- `SELECT` : employé → `user_id = auth.uid()` ; manager → son équipe ; admin → toutes lignes
- `INSERT`/`UPDATE` : admin uniquement (et service role pour le seed)

**`leave_types`**
- `SELECT` : tous les utilisateurs authentifiés
- `INSERT`/`UPDATE` : admin uniquement

**`teams`**
- `SELECT` : tous les utilisateurs authentifiés
- Pas de mutation côté client

**`profiles` (mise à jour Sprint 4)**
- `UPDATE` sur `birth_date` et `trial_ends_at` : admin uniquement (politique ajoutée en migration Sprint 4)

**`invoices`**
- `SELECT` / `INSERT` / `UPDATE` : admin uniquement
- Employee et manager : aucun accès

**`notification_logs`**
- `INSERT` / `SELECT` : service role uniquement (Edge Function avec service key)
- Pas d'accès côté client

**Supabase Storage — bucket `invoices`**
- `SELECT` (download) : admin uniquement
- `INSERT` (upload) : admin uniquement
- `DELETE` : non autorisé côté client

---

## 10. Demo Data (Seed)

| Rôle | Nom | Email | Équipe |
|------|-----|-------|--------|
| Admin | Alice Admin | admin@waka.com | — |
| Manager | Marc Manager | manager@waka.com | Équipe A |
| Employé | Emma Employée | employee1@waka.com | Équipe A |
| Employé | Eddy Employé | employee2@waka.com | Équipe A |

- Mot de passe commun : `Waka2026!`
- Solde initial : 25 jours de **Congé payé** par utilisateur (année 2026)
- `joined_at` : 2024-01-15 pour tous (données de démo)

**Demandes pré-seedées :**

| Employé | Type | Dates | Statut | Days |
|---------|------|-------|--------|------|
| Emma | Congé payé | 2026-05-12 → 2026-05-16 | `pending` | 5 |
| Eddy | RTT | 2026-05-05 → 2026-05-07 | `manager_approved` | 3 |
| Emma | Congé payé | 2026-04-14 → 2026-04-18 | `approved` | 5 |
| Eddy | Congé maladie | 2026-03-10 → 2026-03-12 | `rejected` | 3 |

- Emma : solde restant = 25 - 5 = **20 jours** (une seule demande `approved`)
- Eddy : solde restant = **25 jours** (aucune demande `approved`)

**Script seed :** idempotent via `ON CONFLICT DO NOTHING` ou `upsert`. Fichier : `supabase/seed.sql`.

---

## 11. User Journeys

### Journey 1 — Employé pose un congé
1. Connexion `/login` → redirection `/profile`
2. Consulte son solde restant (section PROFIL-02)
3. Navigue vers `/leave-requests` → clique "Nouvelle demande"
4. Remplit le formulaire (type, dates, commentaire optionnel)
5. Si solde insuffisant → erreur inline "Solde insuffisant (X jours restants)"
6. Si chevauchement → erreur inline "Vous avez déjà une demande sur cette période"
7. Confirmation : demande créée en statut *En attente* (toast + liste rafraîchie)

### Journey 2 — Manager valide (niveau 1)
1. Connexion manager → `/leave-requests`
2. Section "À valider" : voit la demande d'Emma en *En attente*
3. Clique *Approuver* → modale de confirmation → confirme
4. Statut passe à *Validé manager* — la ligne disparaît de "À valider" et passe dans "Historique équipe"

### Journey 3 — Admin valide (niveau 2)
1. Connexion admin → `/leave-requests`
2. Filtre par statut "Validé manager" → voit la demande d'Emma
3. Clique *Approuver* → modale → confirme
4. Statut `approved` → congé visible dans `/calendar` le lendemain ou après rechargement

### Journey 4 — Manager consulte son équipe
1. Connexion manager → `/calendar`
2. Voit les absences `approved` de la semaine de son équipe
3. Encart "Absents aujourd'hui" identifie les membres absents en temps réel
4. Navigation mois précédent/suivant pour planifier

### Journey 5 — Admin gère les types de congé
1. `/leave-types` (lien dans nav admin uniquement)
2. Clique "Ajouter un type" → modal → saisit "Congé exceptionnel" + couleur #FF9800
3. Sauvegarde → le type apparaît dans le tableau avec statut *Actif*
4. Le type est immédiatement disponible dans le formulaire LEAVE-01

---

## 12. Success Metrics

| Métrique | Cible POC |
|----------|-----------|
| Flux end-to-end fonctionnel | Cycle complet (pending → manager_approved → approved) sans bug bloquant |
| Validation deux niveaux | Manager et admin ne voient et n'agissent que sur leur périmètre |
| Zéro fuite de données cross-role | RLS testé : 0 accès non autorisé (vérifié via Supabase Studio + tests manuels) |
| Validation formulaire | Chevauchement et solde insuffisant correctement bloqués |
| Démo réussie | Présentation complète des 5 journeys sans blocage |
| Base réutilisable | Code structuré, composants découplés, RLS documenté |

---

## 13. Timeline — 3 Sprints (2-3 semaines)

### Sprint 1 — Fondations (jours 1-5)
- [ ] Setup Nuxt 4 + Tailwind + Supabase (`@nuxtjs/supabase`)
- [ ] Variables d'environnement + client Supabase configuré
- [ ] Auth (login, logout, middleware auth global)
- [ ] Middleware admin-only pour `/leave-types`
- [ ] Page Profil (données + solde PROFIL-01 & 02)
- [ ] Navigation principale responsive (NAV-01, liens par rôle)
- [ ] Trigger PostgreSQL `update_leave_balance` sur `leave_requests`
- [ ] Script seed (`supabase/seed.sql`) + données de démo
- [ ] Page 404 (error.vue)

### Sprint 2 — Congés & Validation (jours 6-10)
- [ ] RPC `create_leave_request` (validation chevauchement + solde)
- [ ] Formulaire création demande de congé (LEAVE-01) avec modal
- [ ] Liste des demandes vue employé (LEAVE-02)
- [ ] File de validation manager + soldes équipe (LEAVE-03)
- [ ] Table admin + filtres + validation finale (LEAVE-04, LEAVE-05)
- [ ] Calcul solde à la volée (SOLDE-01)

### Sprint 3 — Calendrier & Polish (jours 11-15)
- [ ] Calendrier vue employé / manager / admin (CAL-01, 02, 03)
- [ ] Gestion des types de congé admin (TYPES-01)
- [ ] États UI complets sur toutes les pages (ERROR-01)
- [ ] QA complète (cf. section 14)
- [ ] Corrections et polish final
- [ ] Déploiement Vercel + smoke test en prod

### Sprint 4 — Notifications, Dashboard & Factures (après déploiement Sprint 3)
- [ ] Migration DB : colonnes `birth_date`/`trial_ends_at` sur `profiles` ; tables `invoices`, `notification_logs` ; RLS nouvelles politiques ; RPC `get_dashboard_snapshot()` ; bucket Storage `invoices` (RFC-014)
- [ ] Tableau de bord admin `/dashboard` — métriques + liste statuts employés + filtre (DASH-01, 02, 03 — RFC-015)
- [ ] Page Factures `/invoices` — CRUD + upload PDF + gestion statuts (INVOICE-01, 02, 03 — RFC-016)
- [ ] Edge Function `daily-notifications` + pg_cron + Resend (NOTIF-02, 03, 04 — RFC-017)

---

## 14. QA Scope

### Auth
- [ ] Login valide → redirection correcte selon rôle
- [ ] Login invalide → message d'erreur clair
- [ ] Accès URL privée sans session → redirect `/login`
- [ ] Accès `/leave-types` par employé ou manager → page 403
- [ ] Logout → session supprimée, retour `/login`

### Permissions
- [ ] Employé ne voit pas les données d'autres équipes (RLS vérifié via Supabase Studio)
- [ ] Manager voit uniquement son équipe, peut valider niveau 1 uniquement
- [ ] Admin accède à tout, valide niveau 2

### Flux de validation
- [ ] `pending` → manager approuve → `manager_approved` + champs reviewer remplis
- [ ] `manager_approved` → admin approuve → `approved` + solde recalculé + calendrier mis à jour
- [ ] Manager refuse → `rejected` + solde inchangé
- [ ] Admin refuse `pending` ou `manager_approved` → `rejected` + solde inchangé

### Validation formulaire
- [ ] Demande avec `start_date` passée → bloquée (erreur front)
- [ ] Demande avec `end_date < start_date` → bloquée (erreur front)
- [ ] Demande chevauchant une demande existante → bloquée (erreur serveur RPC)
- [ ] Demande excédant le solde restant → bloquée (erreur serveur RPC)

### Solde
- [ ] `restant = acquis - approuvé` correct après validation admin
- [ ] Pending et manager_approved sans impact sur le solde affiché
- [ ] Solde cohérent entre `/profile` et `/leave-requests` vue manager

### Calendrier
- [ ] Seuls les congés `approved` des autres membres apparaissent
- [ ] Ses propres demandes (tous statuts) visibles pour l'employé
- [ ] Bons utilisateurs visibles selon le rôle
- [ ] Bons types et couleurs affichés
- [ ] Encart "Absents aujourd'hui" correct pour le manager

### Types de congé
- [ ] Type désactivé absent du formulaire LEAVE-01
- [ ] Demandes existantes avec type désactivé toujours affichées correctement

### Sprint 4 — Dashboard
- [ ] `/dashboard` inaccessible pour employee et manager → 403
- [ ] Métriques correctes (total, absents aujourd'hui, absents cette semaine, présents)
- [ ] Liste employés : badge Présent/En congé correct + type de congé + date de retour
- [ ] Filtre client-side Tous/Présents/En congé sans appel API supplémentaire
- [ ] Ancienneté calculée depuis `joined_at` affichée correctement

### Sprint 4 — Factures
- [ ] `/invoices` inaccessible pour employee et manager → 403
- [ ] Création facture — happy path et erreur référence en doublon (modal reste ouvert)
- [ ] Upload PDF : seul `application/pdf` accepté — fichier non-PDF refusé côté client
- [ ] "Voir PDF" génère une URL signée 60s et ouvre dans un nouvel onglet
- [ ] Changement de statut → sauvegardé + toast
- [ ] Filtre par statut client-side sans appel API
- [ ] 4 états UI sur la liste de factures

### Sprint 4 — Notifications (Edge Function)
- [ ] Appel sans `x-cron-secret` → 401
- [ ] Birthday : email envoyé le jour J, skippé lors du deuxième appel (dedup)
- [ ] `birth_date = NULL` → aucun email anniversaire
- [ ] `trial_ends_at = NULL` → aucune alerte fin d'essai
- [ ] `notification_logs` contient exactement 1 ligne après un envoi
- [ ] Erreur sur un employé n'interrompt pas le traitement des autres

---

## 15. Décisions & Hypothèses

| # | Décision / Hypothèse | Statut |
|---|----------------------|--------|
| A1 | Quota annuel fixe = 25 jours de Congé payé pour le seed | Confirmé |
| A2 | `days_count` = jours calendaires simples (`end - start + 1`, weekends inclus) | Confirmé |
| A3 | Un seul solde par type de congé par utilisateur par année | Confirmé |
| A4 | Les types de congé sont globaux (pas spécifiques à une équipe) | Confirmé |
| A5 | L'admin peut refuser une demande encore au stade `pending` sans passer par le manager | Confirmé |
| A6 | `used_days` maintenu par trigger PostgreSQL `update_leave_balance` | **Confirmé** |
| A7 | Pas de Pinia pour le POC — composables Nuxt suffisants | Décidé |
| A8 | Chevauchement bloqué côté serveur via RPC Supabase | **Confirmé** |
| D1 | Manager voit les soldes de son équipe sur `/leave-requests` | **Confirmé** (résout Q1) |
| D2 | Pas d'historique de solde (log mouvements) dans le POC | **Confirmé** (résout Q2) |
| D3 | En l'absence de manager : l'admin peut approuver **ou** rejeter une demande `pending` directement (bypass niveau 1) | **Confirmé** (résout Q3) |
| D4 | Fournisseur email : **Resend** via Edge Function — `RESEND_API_KEY` côté serveur uniquement | **Confirmé** |
| D5 | Déclencheur cron : **Supabase pg_cron** + **pg_net** HTTP POST vers Edge Function `daily-notifications` | **Confirmé** |
| D6 | Tableau de bord admin : toutes les données chargées en une seule RPC `get_dashboard_snapshot()` | **Confirmé** |
| D7 | Backoffice employees/teams (création, suppression, édition générale) : géré via Supabase Dashboard uniquement — pas d'UI app | **Confirmé** |
| D8 | `birth_date` et `trial_ends_at` sont renseignés via Supabase Dashboard — pas d'UI app dédiée (RFC-016 annulé) | **Confirmé** |
| D9 | Factures Vault : bucket Supabase Storage privé `invoices` — jamais de URL publique, signed URL 60s uniquement | **Confirmé** |

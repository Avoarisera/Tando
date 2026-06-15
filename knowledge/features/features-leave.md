# Features — Demandes de Congé & Validation

> Catégorie : LEAVE | Features F09 – F17

---

### F09 — Formulaire de création de demande (modal)

**PRD ref:** LEAVE-01  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** employee  
**Sprint:** 2  
**Dépendances:** F05, F10, F08

**Description**  
Bouton "Nouvelle demande" sur `/leave-requests` (visible uniquement pour le rôle `employee`) qui ouvre un modal. L'employé sélectionne un type de congé actif, choisit ses dates et ajoute un commentaire optionnel. La soumission délègue la validation à la RPC `create_leave_request`.

**Critères d'acceptation**
- [ ] Bouton "Nouvelle demande" visible uniquement pour `employee`
- [ ] Modal avec champs : type de congé (select — types `is_active=true` uniquement), date de début (date picker), date de fin (date picker), commentaire (textarea, max 500 car., optionnel)
- [ ] Validation front bloquante : `start_date >= aujourd'hui`, `end_date >= start_date`
- [ ] `days_count` calculé et affiché dynamiquement (`end - start + 1`)
- [ ] Soumission désactive le bouton + affiche spinner
- [ ] Succès → toast "Demande créée", modal fermé, liste rafraîchie
- [ ] Erreur serveur (chevauchement ou solde insuffisant) → message d'erreur inline dans le modal (modal reste ouvert)

**Cas limites / Considérations techniques**
- Date picker : utiliser un composant natif `<input type="date">` ou une librairie légère (pas de dépendance lourde pour le POC)
- `start_date` minimum = date du jour (pas de date passée)
- Si aucun type actif disponible → désactiver le bouton "Nouvelle demande" avec message explicatif
- Le modal ne doit pas se fermer si la soumission échoue (UX : permettre la correction sans re-saisie)

---

### F10 — Validation serveur RPC (chevauchement + solde)

**PRD ref:** LEAVE-01, A8  
**Priorité:** Must  
**Complexité:** High  
**Personas:** employee (côté serveur invisible)  
**Sprint:** 2  
**Dépendances:** F05, F17

**Description**  
Fonction PostgreSQL `create_leave_request` appelée via Supabase RPC. Elle valide atomiquement : (1) absence de chevauchement avec les demandes existantes (`pending`, `manager_approved`, `approved`), (2) solde restant suffisant pour le type et l'année. Si validations OK, insère la demande avec `days_count` calculé.

**Critères d'acceptation**
- [ ] Chevauchement détecté → erreur retournée au client ("Vous avez déjà une demande sur cette période")
- [ ] Solde insuffisant → erreur retournée ("Solde insuffisant — X jours restants")
- [ ] Succès → insertion avec `user_id = auth.uid()`, `days_count = end_date - start_date + 1`, `status = 'pending'`
- [ ] La RPC s'exécute dans une transaction : aucune insertion partielle en cas d'erreur
- [ ] La RPC respecte les politiques RLS : un employé ne peut créer que pour lui-même

**Cas limites / Considérations techniques**
- Requête de chevauchement : `start_date <= $end_date AND end_date >= $start_date AND status IN ('pending','manager_approved','approved')`
- `days_count = ($end_date - $start_date) + 1` (PostgreSQL : soustraction de `date` retourne un `integer`)
- La validation du solde lit `leave_balances.used_days` (maintenu par le trigger F17) — atomique car dans la même transaction
- Race condition : deux demandes soumises simultanément → la contrainte CHECK + la transaction RPC protège contre les doublons

---

### F11 — Historique des demandes (vue employé)

**PRD ref:** LEAVE-02  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** employee  
**Sprint:** 2  
**Dépendances:** F05, F09

**Description**  
Section principale de `/leave-requests` pour le rôle `employee`. Affiche la liste de toutes ses propres demandes de congé, triées de la plus récente à la plus ancienne, avec le statut courant en badge coloré.

**Critères d'acceptation**
- [ ] Colonnes : type (badge couleur du type), période (du … au …), durée (N jours), statut (badge coloré), date de création
- [ ] Tri par `created_at DESC`
- [ ] Badges statut : En attente (gris), Validé manager (orange), Approuvé (vert), Refusé (rouge)
- [ ] État vide : "Aucune demande pour le moment" + CTA "Créer une demande" (ouvre le modal F09)
- [ ] Skeleton loader pendant le chargement

**Cas limites / Considérations techniques**
- La couleur du badge de type provient de `leave_types.color` (hex)
- Les demandes avec un type désactivé (`is_active=false`) restent affichées avec leur couleur d'origine (jointure sur `leave_types`)
- Aucune action possible sur cette liste (pas d'annulation dans le POC)

---

### F12 — File de validation manager (niveau 1)

**PRD ref:** LEAVE-03  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** manager  
**Sprint:** 2  
**Dépendances:** F05, F13

**Description**  
Page `/leave-requests` pour le rôle `manager`, composée de deux sections : "À valider" (demandes `pending` de l'équipe) et "Historique équipe" (toutes les demandes de l'équipe, tous statuts). Le manager peut approuver ou refuser chaque demande `pending` via une modale de confirmation.

**Critères d'acceptation**
- [ ] Section "À valider" : colonnes — employé (prénom + nom), type, dates, durée, commentaire, actions (Approuver / Refuser)
- [ ] Section "Historique équipe" : mêmes colonnes sans la colonne actions, toutes demandes, triées par `created_at DESC`
- [ ] Boutons "Approuver" et "Refuser" déclenchent une modale de confirmation avant action
- [ ] Approuver → `status = 'manager_approved'`, `manager_reviewed_by = auth.uid()`, `manager_reviewed_at = now()` → ligne disparaît de "À valider" et passe dans "Historique équipe"
- [ ] Refuser → `status = 'rejected'`, mêmes champs reviewer → idem
- [ ] État vide pour "À valider" : "Aucune demande en attente"
- [ ] Skeleton loader au chargement

**Cas limites / Considérations techniques**
- La RLS garantit que le manager ne voit que son équipe — pas besoin de filtre côté client
- En cas d'erreur lors de l'action → toast d'erreur + statut de la demande non modifié
- Le rafraîchissement de la liste après action peut être optimiste (retrait immédiat de la ligne) ou par rechargement complet

---

### F13 — Soldes équipe (vue manager)

**PRD ref:** LEAVE-03, D1  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** manager  
**Sprint:** 2  
**Dépendances:** F05, F17, F12

**Description**  
Section "Soldes de l'équipe" sur `/leave-requests` vue manager. Tableau affichant, pour chaque membre de son équipe, le solde restant de congés payés pour l'année en cours. Données lues depuis `leave_balances`.

**Critères d'acceptation**
- [ ] Tableau avec colonnes : prénom + nom, jours acquis, jours utilisés, jours restants
- [ ] Filtré sur le type "Congé payé" uniquement pour le POC
- [ ] Soldes à jour (reflet du trigger F17 sur `used_days`)
- [ ] Skeleton loader pendant le chargement

**Cas limites / Considérations techniques**
- Si un membre n'a pas d'entrée dans `leave_balances` pour l'année en cours → afficher "—" (ne pas planter)
- Le manager ne peut pas modifier les soldes (lecture seule)
- Section positionnée après "À valider" et avant "Historique équipe" dans la mise en page

---

### F14 — Table admin — toutes les demandes

**PRD ref:** LEAVE-04  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** admin  
**Sprint:** 2  
**Dépendances:** F05, F15

**Description**  
Page `/leave-requests` pour le rôle `admin`. Tableau listant toutes les demandes de toutes les équipes, avec un filtre par statut. Boutons d'action contextuels selon le statut de chaque demande.

**Critères d'acceptation**
- [ ] Colonnes : employé, équipe, type, dates, durée, statut (badge), date de création
- [ ] Filtre par statut (select : Tous / En attente / Validé manager / Approuvé / Refusé)
- [ ] Bouton "Approuver" visible sur les demandes `manager_approved` **et** `pending`
- [ ] Bouton "Refuser" visible sur les demandes `pending` et `manager_approved`
- [ ] Aucun bouton d'action sur les demandes `approved` ou `rejected`
- [ ] Chaque action ouvre une modale de confirmation avant exécution
- [ ] Skeleton loader au chargement

**Cas limites / Considérations techniques**
- Le filtre par statut est côté client (pas de requête supplémentaire) car le volume de démo est limité
- L'admin approuvant un `pending` directement correspond au cas D3 (bypass niveau 1)
- Tri par défaut : `created_at DESC`

---

### F15 — Validation finale admin (niveau 2)

**PRD ref:** LEAVE-05, D3  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** admin  
**Sprint:** 2  
**Dépendances:** F14, F17, F05

**Description**  
Actions de validation côté admin : approbation de `manager_approved` (flux normal) ou de `pending` (bypass niveau 1), et refus de `pending` ou `manager_approved`. Chaque passage au statut `approved` déclenche le trigger PostgreSQL qui met à jour `used_days`.

**Critères d'acceptation**
- [ ] Approve `manager_approved` → `status = 'approved'`, `admin_reviewed_by`, `admin_reviewed_at` remplis
- [ ] Approve `pending` (bypass) → `status = 'approved'` directement, `manager_reviewed_by` reste NULL
- [ ] Reject `pending` ou `manager_approved` → `status = 'rejected'`, `admin_reviewed_by`, `admin_reviewed_at` remplis
- [ ] Après passage à `approved` → `leave_balances.used_days` incrémenté par le trigger (F17)
- [ ] Après passage à `rejected` → `used_days` inchangé (pas d'impact si l'ancien statut n'était pas `approved`)
- [ ] Toast de succès après chaque action + liste rafraîchie
- [ ] Toast d'erreur si l'opération échoue (pas de modification silencieuse)

**Cas limites / Considérations techniques**
- Si l'admin approuve puis rejette une demande (`approved → rejected`) — cas rare mais possible en théorie — le trigger doit décrémenter `used_days` (cf. F17)
- La RLS autorise l'admin à mettre à jour tout statut sur toutes les lignes
- Pas de workflow de "rappel" ou d'"annulation" dans le POC

---

### F16 — Bypass niveau 1 : admin approuve directement un pending

**PRD ref:** LEAVE-05, D3  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** admin  
**Sprint:** 2  
**Dépendances:** F15

**Description**  
Cas particulier d'utilisation (D3 confirmé) : en l'absence de manager disponible, l'admin peut approuver directement une demande au statut `pending` sans passer par le niveau 1. Le statut passe directement à `approved`, `manager_reviewed_by` reste NULL, et le trigger F17 met à jour le solde normalement.

**Critères d'acceptation**
- [ ] Le bouton "Approuver" est visible sur les lignes `pending` dans la vue admin (F14)
- [ ] Après approbation directe : `status = 'approved'`, `manager_reviewed_by = NULL`, `admin_reviewed_by` rempli
- [ ] Le trigger F17 s'exécute identiquement au flux normal
- [ ] La demande approuvée apparaît dans le calendrier (F19, F20)

**Cas limites / Considérations techniques**
- Aucune modale spéciale "bypass" — même confirmation que pour une approbation normale
- Le champ `manager_reviewed_by` NULL est une valeur légale dans le schéma (pas de contrainte NOT NULL)

---

### F17 — Trigger PostgreSQL `update_leave_balance`

**PRD ref:** SOLDE-01, A6  
**Priorité:** Must  
**Complexité:** High  
**Personas:** tous (invisible, côté serveur)  
**Sprint:** 1  
**Dépendances:** F05 (schéma DB)

**Description**  
Trigger PostgreSQL `AFTER INSERT OR UPDATE OF status ON leave_requests` qui maintient automatiquement `leave_balances.used_days` à jour. Incrémente `used_days` de `days_count` quand une demande passe à `approved`. Décrémente quand une demande passe de `approved` à un autre statut (correction admin).

**Critères d'acceptation**
- [ ] Passage à `approved` (depuis n'importe quel statut) → `used_days += days_count` dans la ligne correspondante de `leave_balances` (même `user_id`, `leave_type_id`, `year = EXTRACT(YEAR FROM start_date)`)
- [ ] Passage de `approved` vers `rejected` → `used_days -= days_count`
- [ ] Passage entre autres statuts (`pending` ↔ `manager_approved`) → aucun impact sur `used_days`
- [ ] Si la ligne `leave_balances` n'existe pas encore (edge case) → `RAISE EXCEPTION` ou insertion automatique (à définir lors de l'implémentation)
- [ ] `used_days` ne descend jamais en dessous de 0 (contrainte CHECK ou guard dans le trigger)

**Cas limites / Considérations techniques**
- Le trigger doit comparer `OLD.status` et `NEW.status` pour déterminer la direction du changement
- Le trigger s'exécute également sur INSERT (cas seed) — vérifier que le seed insère directement avec le bon statut
- Pour le bypass admin (F16) : `pending → approved` déclenche correctement le trigger
- Le trigger utilise `SECURITY DEFINER` pour accéder à `leave_balances` même si la RLS restreint les écritures côté client

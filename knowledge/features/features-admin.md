# Features — Administration & Données de démo

> Catégorie : ADMIN + INFRA-DATA | Features F21 – F23, F31

---

### F21 — Liste des types de congé (admin)

**PRD ref:** TYPES-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** admin  
**Sprint:** 3  
**Dépendances:** F03, F05

**Description**  
Page `/leave-types` (accessible uniquement à l'admin via le middleware F03). Affiche un tableau de tous les types de congé existants avec leur statut actif/inactif et des actions contextuelles.

**Critères d'acceptation**
- [ ] Tableau avec colonnes : couleur (pastille hex), nom, statut (badge Actif/Inactif), actions (Modifier, Désactiver/Activer)
- [ ] Les 4 types pré-seedés sont visibles : Congé payé (#4CAF50), Congé maladie (#F44336), RTT (#2196F3), Congé sans solde (#9E9E9E)
- [ ] Bouton "Ajouter un type" en haut du tableau → ouvre modal F22
- [ ] Skeleton loader pendant le chargement

**Cas limites / Considérations techniques**
- Afficher les types inactifs en grisé (pas de suppression dans le POC)
- Trier par `created_at ASC` (types pré-seedés en premier)

---

### F22 — Ajout et modification de types de congé

**PRD ref:** TYPES-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** admin  
**Sprint:** 3  
**Dépendances:** F21, F05

**Description**  
Modal réutilisable pour créer un nouveau type de congé ou modifier un type existant. Champs : nom (texte, requis) et couleur (input hex ou color picker). La sauvegarde insère ou met à jour dans `leave_types`.

**Critères d'acceptation**
- [ ] Modal "Ajouter" : champs vides, soumission → INSERT dans `leave_types` avec `is_active = true`
- [ ] Modal "Modifier" : champs pré-remplis avec valeurs actuelles, soumission → UPDATE nom et/ou couleur
- [ ] Validation : nom non vide (requis), couleur au format hex valide (#RRGGBB)
- [ ] Succès → toast "Type ajouté / modifié", modal fermé, liste rafraîchie
- [ ] Erreur (ex. nom déjà existant) → message d'erreur inline dans le modal

**Cas limites / Considérations techniques**
- Input couleur : `<input type="color">` suffit pour le POC (retourne un hex valide nativement)
- Pas de contrainte d'unicité stricte sur le nom dans le schéma DB — la validation peut être côté client uniquement pour le POC
- La modification du nom ou de la couleur est immédiatement reflétée dans les demandes existantes (jointure dynamique)

---

### F23 — Désactivation / réactivation de types de congé

**PRD ref:** TYPES-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** admin  
**Sprint:** 3  
**Dépendances:** F21, F05

**Description**  
Bouton "Désactiver" (type actif) ou "Activer" (type inactif) dans le tableau F21. La désactivation passe `is_active = false` — le type disparaît du formulaire de création de demande mais les demandes existantes conservent leur type (pas de cascade).

**Critères d'acceptation**
- [ ] Bouton "Désactiver" sur les types actifs → `is_active = false` + toast confirmation
- [ ] Bouton "Activer" sur les types inactifs → `is_active = true` + toast confirmation
- [ ] Type désactivé : n'apparaît plus dans le select de F09 (formulaire création demande)
- [ ] Type désactivé : les demandes existantes qui l'utilisent continuent d'afficher le type et la couleur correctement
- [ ] Suppression : non disponible dans le POC (bouton absent)

**Cas limites / Considérations techniques**
- Le select de F09 filtre sur `is_active = true` — automatiquement cohérent après désactivation
- Pas de confirmation modale nécessaire pour cette action (réversible immédiatement)
- Avertir l'admin si aucun type actif ne reste (tous désactivés) — message d'alerte non bloquant

---

### F31 — Gestion des soldes de congé (admin)

**PRD ref:** SOLDE-ADMIN (ajout post-PRD v1)  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** admin  
**Sprint:** 3  
**Dépendances:** F21, F22, F05, F17

**Description**  
Onglet "Soldes" sur la page `/leave-types`. Permet à l'admin de consulter tous les soldes (employé × type × année) et de modifier le quota `allocated_days` par ligne ou en masse. Déclenché automatiquement lors de la création d'un nouveau type (F22) pour initialiser des lignes à 0 pour tous les employés.

**Critères d'acceptation**

**Lecture :**
- [ ] Onglet "Soldes" accessible depuis `/leave-types`, côte à côte avec l'onglet "Types de congé"
- [ ] Sélecteur d'année (par défaut : année courante) — changer l'année recharge le tableau
- [ ] Soldes groupés par type de congé (pastille couleur + nom en en-tête de groupe)
- [ ] Colonnes par employé : Prénom Nom, Alloués, Utilisés, Restants (= alloués − utilisés)
- [ ] Restants en rouge si négatif
- [ ] 4 états UI obligatoires : loading (squelettes), erreur (AppErrorBanner + retry), vide, contenu

**Édition individuelle :**
- [ ] Bouton "Modifier" bascule la cellule "Alloués" en champ numérique pré-rempli
- [ ] "Enregistrer" → UPDATE `allocated_days`, toast succès, ligne rafraîchie
- [ ] "Annuler" → annule sans sauvegarder
- [ ] `used_days` et Restants sont toujours en lecture seule

**Quota en masse :**
- [ ] Chaque en-tête de groupe contient un champ numérique + bouton "Appliquer"
- [ ] "Appliquer" → appel RPC `upsert_leave_type_balances` → UPSERT pour tous les employés
- [ ] Toast "Quota appliqué à tous les employés" au succès, tableau rafraîchi

**Auto-initialisation à la création :**
- [ ] La création d'un nouveau type (F22) insère automatiquement des lignes à `allocated_days = 0` pour tous les employés via le RPC
- [ ] Le nouveau type apparaît immédiatement dans l'onglet "Soldes" avec `allocated_days = 0`
- [ ] Si le RPC échoue après l'insertion du type, l'erreur s'affiche inline dans le modal de création (modal reste ouvert)

**Cas limites / Considérations techniques**
- La colonne `used_days` est gérée exclusivement par le trigger PostgreSQL `update_leave_balance` — ne jamais l'écrire côté client
- Le RPC `upsert_leave_type_balances` utilise `ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET allocated_days = EXCLUDED.allocated_days` — `used_days` non touché
- La contrainte `UNIQUE (user_id, leave_type_id, year)` est déjà en place sur `leave_balances`
- Les politiques RLS admin (SELECT, INSERT, UPDATE) sur `leave_balances` sont déjà actives — aucune nouvelle migration RLS nécessaire

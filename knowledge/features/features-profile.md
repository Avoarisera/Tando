# Features — Profil & Navigation

> Catégorie : PROFIL + NAV | Features F06 – F08

---

### F06 — Fiche profil utilisateur

**PRD ref:** PROFIL-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** tous  
**Sprint:** 1  
**Dépendances:** F01, F02, F05

**Description**  
Page `/profile` affichant les informations de l'utilisateur connecté en lecture seule. Les données proviennent de la table `profiles` liée à `auth.users`. Aucun formulaire d'édition dans le POC.

**Critères d'acceptation**
- [ ] Affiche : prénom, nom, email (depuis `auth.users`), rôle (badge coloré), équipe/département, date d'entrée
- [ ] Données non modifiables (pas de champ d'édition, pas de bouton "Modifier")
- [ ] Chargement avec skeleton loader pendant la requête
- [ ] Si erreur de chargement → message d'erreur avec bouton "Réessayer"

**Cas limites / Considérations techniques**
- L'admin n'a pas de `team_id` (NULL) — afficher "—" ou "Toute l'entreprise" pour l'équipe
- L'email est lu depuis `auth.users` (via `useSupabaseUser()`) et non depuis `profiles`
- Badge rôle : couleurs différentes par rôle (ex. admin=rouge, manager=bleu, employee=vert)

---

### F07 — Affichage du solde de congé

**PRD ref:** PROFIL-02  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** employee, manager  
**Sprint:** 1  
**Dépendances:** F06, F05, F17 (trigger)

**Description**  
Section "Solde de congé" affichée sur `/profile` pour les rôles `employee` et `manager`. Pour chaque type de congé actif ayant une entrée dans `leave_balances` pour l'année en cours, affiche les jours acquis, utilisés et restants. Les données sont lues directement depuis `leave_balances` (champ `used_days` maintenu par le trigger PostgreSQL).

**Critères d'acceptation**
- [ ] Section visible uniquement pour `employee` et `manager` (masquée pour `admin`)
- [ ] Affichage par type de congé : **Acquis** / **Utilisés** / **Restants** (`allocated_days - used_days`)
- [ ] Données correctes après chaque changement de statut en `approved`
- [ ] Si aucun solde en base pour l'année → afficher "Aucun solde configuré"
- [ ] Chargement avec skeleton pendant la requête

**Cas limites / Considérations techniques**
- Filtrer sur `year = EXTRACT(YEAR FROM CURRENT_DATE)` pour n'afficher que l'année en cours
- `used_days` est maintenu par le trigger F17 — pas de calcul agrégé à faire côté client
- Formule affichée : `restant = allocated_days - used_days` (jamais négatif dans des conditions normales ; afficher 0 si négatif par sécurité)

---

### F08 — Navigation principale responsive

**PRD ref:** NAV-01  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** tous  
**Sprint:** 1  
**Dépendances:** F01, F03

**Description**  
Layout Nuxt privé (`layouts/private.vue`) encapsulant une sidebar fixe (desktop) et un drawer hamburger (mobile). Les liens de navigation sont filtrés selon le rôle de l'utilisateur connecté. Le lien de la page active est mis en évidence.

**Critères d'acceptation**
- [ ] **Employé / Manager :** Profil, Demandes de congé, Calendrier, Déconnexion
- [ ] **Admin :** Profil, Demandes de congé, Calendrier, Types de congé, Déconnexion
- [ ] Desktop (≥ 1280px) : sidebar fixe 240px à gauche, contenu à droite
- [ ] Mobile (≤ 375px) : hamburger en haut → drawer overlay coulissant
- [ ] Lien actif visuellement distinct (fond + texte, via `useRoute().path`)
- [ ] Bouton "Déconnexion" toujours visible en bas de la nav (desktop) ou en bas du drawer (mobile)

**Cas limites / Considérations techniques**
- Le rôle est résolu une seule fois au montage du layout (composable `useCurrentUser()`)
- Éviter un flash de navigation : charger le rôle côté serveur si possible (SSR) ou afficher un skeleton pendant la résolution
- Le drawer mobile doit se fermer automatiquement après navigation vers un nouveau lien

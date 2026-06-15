# Features — États UI & Expérience utilisateur

> Catégorie : UI/UX | Features F27 – F30

---

### F27 — États UI globaux (loading / erreur / vide / succès)

**PRD ref:** ERROR-01, Section 7 (UX)  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** tous  
**Sprint:** 3  
**Dépendances:** toutes les features avec requêtes asynchrones

**Description**  
Système cohérent de gestion des états asynchrones appliqué sur toutes les pages et composants. Chaque état (chargement, erreur, liste vide, succès de mutation) dispose d'un rendu visuel standardisé réutilisable via des composants Nuxt.

**Critères d'acceptation**
- [ ] **Loading :** skeleton loaders (barres grisées animées) pendant les requêtes initiales ; spinner sur les boutons de soumission (bouton désactivé)
- [ ] **Erreur :** banner d'erreur rouge en haut de la section concernée, avec message lisible et bouton "Réessayer" si applicable — aucun crash silencieux
- [ ] **Vide :** message contextuel par page (ex. "Aucune demande pour le moment") + CTA approprié
- [ ] **Succès :** toast notification verte, auto-dismiss après 3 secondes, affiché après toute mutation réussie
- [ ] Les états sont gérés de manière cohérente sur toutes les pages : `/profile`, `/leave-requests`, `/calendar`, `/leave-types`

**Cas limites / Considérations techniques**
- Créer des composants réutilisables : `<AppSkeleton>`, `<AppErrorBanner>`, `<AppEmptyState>`, `<AppToast>`
- Le système de toasts peut être géré via un composable global `useToast()` + un composant singleton dans le layout
- Les skeletons doivent correspondre approximativement à la forme du contenu chargé (éviter un layout shift brutal)
- Un même composant `<AppToast>` gère succès et erreur avec une prop `type` (success/error)

---

### F28 — Page 404

**PRD ref:** ERROR-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** tous  
**Sprint:** 3  
**Dépendances:** F08

**Description**  
Page d'erreur Nuxt (`app/error.vue`) affichée pour toute URL inexistante (404) ou erreur non gérée. Inclut un message clair et un lien retour vers la page d'accueil.

**Critères d'acceptation**
- [ ] Affiché sur toute URL qui ne correspond à aucune route définie
- [ ] Message : "Page introuvable" + description courte
- [ ] Lien "Retour à l'accueil" → `/profile` si authentifié, `/login` sinon
- [ ] Mise en page cohérente avec le reste de l'application (header ou message centré)

**Cas limites / Considérations techniques**
- `app/error.vue` est le fichier Nuxt natif pour les erreurs globales — pas besoin de route `[...slug].vue`
- La page 403 (accès refusé à `/leave-types`) peut réutiliser le même composant avec un message différent

---

### F29 — Modales de confirmation

**PRD ref:** LEAVE-03, LEAVE-04  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** manager, admin  
**Sprint:** 2  
**Dépendances:** F12, F14

**Description**  
Composant modal de confirmation réutilisable `<AppConfirmModal>` déclenché avant toute action de mutation irréversible (approuver, refuser une demande). Empêche les actions accidentelles.

**Critères d'acceptation**
- [ ] S'ouvre au clic sur "Approuver" ou "Refuser"
- [ ] Affiche : titre de l'action, résumé de la demande concernée (employé, dates, type), boutons "Confirmer" et "Annuler"
- [ ] "Confirmer" → exécute l'action et ferme la modale
- [ ] "Annuler" → ferme la modale sans action
- [ ] Fond assombri (overlay) avec fermeture au clic extérieur ou touche Échap

**Cas limites / Considérations techniques**
- Composant réutilisable avec props : `title`, `description`, `onConfirm` (callback async), `onCancel`
- Pendant l'action asynchrone (après "Confirmer") : bouton "Confirmer" désactivé + spinner — évite le double-clic
- Pas de modale de confirmation pour la désactivation de types de congé (action réversible)

---

### F30 — Toasts de succès et d'erreur

**PRD ref:** ERROR-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** tous  
**Sprint:** 2  
**Dépendances:** F27

**Description**  
Système de notifications toast global affiché en bas à droite (desktop) ou en bas (mobile). Déclenché après chaque mutation réussie ou en cas d'erreur serveur non bloquante.

**Critères d'acceptation**
- [ ] Toast succès (vert) : affiché après création de demande, approbation, refus, ajout/modification de type de congé
- [ ] Toast erreur (rouge) : affiché après échec d'une action serveur (pas de crash silencieux)
- [ ] Auto-dismiss après 3 secondes (succès) ; persistant jusqu'à fermeture manuelle (erreur)
- [ ] Maximum 3 toasts simultanés (les plus anciens sont écartés automatiquement)
- [ ] Bouton de fermeture manuel sur chaque toast

**Cas limites / Considérations techniques**
- Implémenter via `useToast()` composable + `<AppToastContainer>` singleton dans `layouts/private.vue`
- Les toasts d'erreur de formulaire (chevauchement, solde insuffisant) sont gérés inline dans le modal — pas via les toasts globaux
- Z-index supérieur aux modales pour rester visible

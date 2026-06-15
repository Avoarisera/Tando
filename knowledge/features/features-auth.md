# Features — Authentification & Sécurité

> Catégorie : AUTH | Features F01 – F05

---

### F01 — Connexion email / mot de passe

**PRD ref:** AUTH-01  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** tous  
**Sprint:** 1  
**Dépendances:** aucune

**Description**  
Page publique `/login` permettant à tout utilisateur de s'authentifier avec son email et son mot de passe via Supabase Auth. Après succès, l'utilisateur est redirigé vers `/profile`. Aucune inscription en self-service — les comptes sont créés exclusivement via le seed.

**Critères d'acceptation**
- [ ] Formulaire avec champs email (type email) et mot de passe (type password)
- [ ] Bouton de soumission désactivé + spinner pendant la requête Supabase
- [ ] Succès → session créée, redirection vers `/profile`
- [ ] Échec → message d'erreur explicite affiché sous le formulaire (ex. : "Identifiants incorrects")
- [ ] Page inaccessible si déjà authentifié → redirection vers `/profile`

**Cas limites / Considérations techniques**
- Utiliser `supabase.auth.signInWithPassword()` — pas de magic link ni OAuth pour le POC
- Le message d'erreur ne doit pas distinguer "email inconnu" de "mot de passe incorrect" (sécurité)
- Pas de "Mot de passe oublié" dans le POC

---

### F02 — Protection des routes privées

**PRD ref:** AUTH-02  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** tous  
**Sprint:** 1  
**Dépendances:** F01

**Description**  
Middleware Nuxt global `auth.global.ts` qui vérifie la session Supabase à chaque navigation. Si aucune session active n'est trouvée, l'utilisateur est redirigé vers `/login`. Routes privées : `/profile`, `/leave-requests`, `/calendar`, `/leave-types`.

**Critères d'acceptation**
- [ ] Accès direct à une URL privée sans session → redirect `/login`
- [ ] Session expirée en cours de navigation → redirect `/login` au prochain changement de route
- [ ] Page `/login` reste accessible sans session
- [ ] Middleware s'exécute côté serveur (SSR) pour éviter le flash de contenu privé

**Cas limites / Considérations techniques**
- Utiliser `useSupabaseSession()` ou `useSupabaseUser()` du module `@nuxtjs/supabase`
- Le module gère automatiquement le refresh du JWT — pas besoin de logique manuelle
- Ne pas stocker le rôle côté client (cookie ou localStorage) ; toujours lire depuis `profiles` en DB

---

### F03 — Contrôle d'accès par rôle (admin-only)

**PRD ref:** AUTH-02  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** admin, manager, employee  
**Sprint:** 1  
**Dépendances:** F02

**Description**  
Middleware `admin-only.ts` appliqué exclusivement sur `/leave-types`. Si un utilisateur authentifié avec le rôle `manager` ou `employee` tente d'accéder à cette route, il reçoit une page d'erreur 403 (Accès refusé) au lieu du contenu.

**Critères d'acceptation**
- [ ] Accès à `/leave-types` par un `employee` ou `manager` → page 403 avec message clair et lien retour
- [ ] Accès à `/leave-types` par un `admin` → page affichée normalement
- [ ] Le lien "Types de congé" n'apparaît dans la navigation que pour l'admin (cf. F08)

**Cas limites / Considérations techniques**
- Le rôle est lu depuis `profiles` (table Supabase) — pas depuis le JWT custom claim pour le POC
- Même si le lien est masqué en nav, la protection middleware côté serveur reste indispensable (defense in depth)

---

### F04 — Déconnexion

**PRD ref:** AUTH-03  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** tous  
**Sprint:** 1  
**Dépendances:** F01, F08

**Description**  
Bouton "Déconnexion" accessible depuis la navigation principale sur toutes les pages privées. Au clic, la session Supabase est supprimée et l'utilisateur est redirigé vers `/login`.

**Critères d'acceptation**
- [ ] Bouton visible sur toutes les pages privées (sidebar desktop + drawer mobile)
- [ ] `supabase.auth.signOut()` appelé au clic
- [ ] Redirection vers `/login` après déconnexion
- [ ] Accès à une route privée après déconnexion → redirect `/login`

**Cas limites / Considérations techniques**
- Invalider également le cache de données côté client après `signOut` (vider les `useState` qui stockent les données utilisateur)
- Aucune confirmation modale nécessaire pour la déconnexion

---

### F05 — Row Level Security (RLS) Supabase

**PRD ref:** Section 9 — RLS Policy Strategy  
**Priorité:** Must  
**Complexité:** High  
**Personas:** tous (invisible mais critique)  
**Sprint:** 1  
**Dépendances:** F01, F02

**Description**  
Politiques RLS PostgreSQL sur toutes les tables (`profiles`, `leave_requests`, `leave_balances`, `leave_types`, `teams`) garantissant qu'aucune donnée cross-role ou cross-team n'est accessible côté client, quelle que soit la requête Supabase émise.

**Critères d'acceptation**
- [ ] `profiles` : un `employee` ne peut lire que sa propre ligne ; un `manager` lit son équipe ; l'`admin` lit tout
- [ ] `leave_requests` : un `employee` ne voit que ses propres demandes ; un `manager` voit celles de son équipe ; l'`admin` voit tout
- [ ] `leave_requests` INSERT : uniquement autorisé pour `user_id = auth.uid()` via la RPC `create_leave_request`
- [ ] `leave_requests` UPDATE : manager restreint aux statuts `pending → manager_approved/rejected` sur son équipe ; admin sans restriction
- [ ] `leave_balances` : lecture restreinte par rôle ; écriture réservée à l'admin et au service role
- [ ] `leave_types` : lecture pour tous les authentifiés ; écriture admin uniquement
- [ ] `teams` : lecture pour tous les authentifiés ; aucune mutation côté client
- [ ] Test manuel via Supabase Studio : 0 accès non autorisé détecté

**Cas limites / Considérations techniques**
- Les politiques RLS doivent référencer `auth.uid()` et une sous-requête sur `profiles` pour résoudre le rôle et le `team_id` de l'utilisateur courant
- Le trigger `update_leave_balance` s'exécute avec les droits du `SECURITY DEFINER` — nécessite une vérification des droits en amont dans la RPC
- Ne jamais exposer `SUPABASE_SERVICE_KEY` côté client : réservée au script seed uniquement
- Tester les politiques en changeant de session dans Supabase Studio avec chaque compte de démo

# Features — Calendrier

> Catégorie : CALENDAR | Features F18 – F20

---

### F18 — Calendrier vue employé

**PRD ref:** CAL-01  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** employee  
**Sprint:** 3  
**Dépendances:** F05, F11, F15

**Description**  
Page `/calendar` pour le rôle `employee`. Vue mensuelle affichant ses propres demandes de congé (tous statuts) et les congés `approved` des autres membres de son équipe. Navigation entre les mois précédent et suivant.

**Critères d'acceptation**
- [ ] Vue mensuelle avec grille de jours (lundi → dimanche ou dimanche → samedi — à fixer)
- [ ] Ses propres congés affichés quel que soit le statut (pending, manager_approved, approved, rejected), avec le statut visible (opacité ou badge)
- [ ] Congés `approved` des autres membres de l'équipe affichés (prénom + nom, couleur du type)
- [ ] Navigation : boutons "< Mois précédent" et "Mois suivant >" ; mois courant affiché en titre
- [ ] Événements multi-jours visibles en bande continue sur la grille
- [ ] Légende des types de congé (couleurs) affichée sous le calendrier
- [ ] Skeleton loader pendant le chargement initial

**Cas limites / Considérations techniques**
- Pas de librairie calendrier externe imposée — implémenter une grille CSS simple (Tailwind grid) si suffisant, sinon utiliser une librairie légère (ex. `v-calendar` ou `@fullcalendar/vue3`)
- Les congés `rejected` propres à l'employé peuvent être masqués ou affichés avec une opacité réduite — décision à prendre lors de l'implémentation
- Gérer les mois avec 28, 29, 30 et 31 jours + les jours de la semaine de début/fin de mois

---

### F19 — Calendrier vue manager

**PRD ref:** CAL-02  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** manager  
**Sprint:** 3  
**Dépendances:** F18, F05

**Description**  
Même page `/calendar` pour le rôle `manager`, filtrée sur son équipe. Affiche uniquement les congés `approved` des membres (+ ses propres demandes tous statuts). Un encart "Absents aujourd'hui" liste les membres dont le congé `approved` couvre la date du jour.

**Critères d'acceptation**
- [ ] Grille mensuelle identique à F18 avec données filtrées sur l'équipe du manager
- [ ] Seuls les congés `approved` des membres sont affichés (le manager voit ses propres demandes tous statuts)
- [ ] Encart "Absents aujourd'hui" : liste des noms des membres avec un congé `approved` couvrant `CURRENT_DATE`
- [ ] Si personne absent aujourd'hui → encart affiche "Aucune absence aujourd'hui"
- [ ] Navigation mois précédent / suivant identique à F18

**Cas limites / Considérations techniques**
- L'encart "Absents aujourd'hui" est calculé côté client à partir des données déjà chargées (pas de requête supplémentaire) : filtrer les congés `approved` dont `start_date <= today <= end_date`
- Le manager est aussi membre de son équipe — ses congés `approved` apparaissent dans l'encart "Absents" s'ils couvrent aujourd'hui
- La vue du calendrier et l'encart partagent le même chargement de données (une seule requête)

---

### F20 — Calendrier vue admin (global)

**PRD ref:** CAL-03  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** admin  
**Sprint:** 3  
**Dépendances:** F18, F05

**Description**  
Même page `/calendar` pour le rôle `admin`. Vue entreprise complète : tous les congés `approved` de toutes les équipes. Filtre optionnel par équipe via un select.

**Critères d'acceptation**
- [ ] Tous les congés `approved` de toutes les équipes affichés sur la grille mensuelle
- [ ] Select "Filtrer par équipe" (options : Toutes les équipes + une option par équipe) — optionnel mais recommandé
- [ ] Filtre appliqué côté client sur les données déjà chargées
- [ ] Navigation mois précédent / suivant identique à F18
- [ ] Informations par événement : prénom + nom, équipe, type de congé (couleur)

**Cas limites / Considérations techniques**
- Avec 4 utilisateurs de démo, le volume est faible — pas de problème de performance à anticiper pour le POC
- Si de nombreux congés se chevauchent sur le même jour, prévoir un affichage empilé ou tronqué (ex. "+2 autres") — simplifiable pour le POC
- L'admin n'a pas de congés propres dans le seed — sa propre ligne n'apparaît pas dans le calendrier

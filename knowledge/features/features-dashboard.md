# Features — Admin Leave Dashboard

**Sprint:** 4  
**PRD refs:** DASH-01, DASH-02, DASH-03

---

### F36 — Tableau de bord admin — bandeau métriques

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin  
**Depends on:** RFC-015 (dashboard page + RPC)

**Description**  
En haut de `/dashboard`, un bandeau visuel présente 4 métriques d'un coup d'œil pour piloter la capacité de l'équipe.

**Acceptance Criteria**
- [ ] Page `/dashboard` accessible uniquement pour `isAdmin` (middleware `admin-only`)
- [ ] Redirect automatique pour les rôles `employee` et `manager` (403 ou redirect `/profile`)
- [ ] Bandeau affiche exactement 4 métriques : **Total employés** · **En congé aujourd'hui** · **En congé cette semaine** · **Présents**
- [ ] Métrique "En congé aujourd'hui" mise en évidence avec fond coloré (ambre ou rouge)
- [ ] Données chargées via RPC `get_dashboard_snapshot()` à l'ouverture de la page
- [ ] 4 états UI : loading (skeletons métriques), erreur (AppErrorBanner + retry), vide (impossible — a minima 0), contenu
- [ ] Lien "Tableau de bord" visible dans la navigation uniquement pour le rôle `admin`

**Edge Cases**
- Aucun employé en congé aujourd'hui → "En congé aujourd'hui" = 0, badge neutre
- Semaine traversant un changement de mois → calcul correct via `date_trunc('week', CURRENT_DATE)`

**Technical Notes**
- RPC `get_dashboard_snapshot()` retourne `{ total_employees, on_leave_today, on_leave_week, present, employees: [...] }`
- "En congé cette semaine" = employés avec au moins un jour de congé `approved` chevauchant la semaine ISO courante
- "Présents" = `total_employees - on_leave_today`

---

### F37 — Tableau de bord admin — liste statuts employés

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin  
**Depends on:** F36, RFC-015

**Description**  
Sous le bandeau, une liste de tous les employés avec leur statut de présence, type de congé en cours, date de retour et ancienneté.

**Acceptance Criteria**
- [ ] Chaque ligne affiche : nom complet · équipe · rôle · badge statut
- [ ] Badge **Présent** (vert, `bg-green-100 text-green-700`) ou **En congé** (ambre, `bg-amber-100 text-amber-700`)
- [ ] Si en congé : affiche le nom du type de congé (ex : "Congé payé") + "Retour le {date}" (format DD/MM/YYYY)
- [ ] Ancienneté calculée depuis `joined_at` : "X an(s)" ou "X mois" pour < 1 an
- [ ] Données incluses dans la réponse de `get_dashboard_snapshot()` — pas de requête supplémentaire
- [ ] Triée par nom (alphabétique)

**Edge Cases**
- Employé avec plusieurs congés `approved` chevauchants (cas anormal) → afficher le premier par `start_date`
- Employé sans équipe (`team_id = NULL`) → afficher "—" dans la colonne équipe

**Technical Notes**
- RPC doit jointure : `profiles LEFT JOIN leave_requests ON ... LEFT JOIN leave_types ON ...`
- Condition "en congé aujourd'hui" : `status = 'approved' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE`
- La date de retour = `end_date + interval '1 day'` (lendemain de la fin du congé)

---

### F38 — Tableau de bord admin — filtre présents / en congé

**Priority:** Must  
**Complexity:** Low  
**Personas:** admin  
**Depends on:** F37

**Description**  
Filtrage client-side de la liste des employés par statut de présence.

**Acceptance Criteria**
- [ ] Trois boutons ou select : "Tous" · "Présents" · "En congé"
- [ ] Le filtre opère sur les données déjà en mémoire — aucun appel API supplémentaire
- [ ] "Tous" sélectionné par défaut à l'ouverture
- [ ] Le compteur de résultats s'adapte au filtre actif (ex : "3 employés")
- [ ] Transition fluide entre états sans flash de chargement

**Edge Cases**
- Si filtre "En congé" et aucun employé absent → état vide inline avec message "Aucun employé en congé aujourd'hui"

**Technical Notes**
- État local `ref<'all' | 'present' | 'on_leave'>` — `computed` pour filtrer le tableau

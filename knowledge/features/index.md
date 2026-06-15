# WakaBods POC — Features Index

**Version:** 1.1  
**Date:** 2026-05-18  
**Basé sur:** PRD v1.3  
**Total features:** 41 (40 implémentées + 1 Won't Have)  

---

## Vue d'ensemble du produit

WakaBods est une plateforme RH légère pour équipes remote. Le POC couvre le cycle complet de gestion des congés : un employé pose une demande, le manager valide en premier (niveau 1), l'admin confirme en second (niveau 2). Chaque rôle dispose d'une vue et d'actions distinctes. Le stack est Nuxt 4.4.2 + Tailwind CSS + Supabase (Auth, PostgreSQL, RLS).

---

## Résumé par priorité

| Priorité | Count | Description |
|----------|-------|-------------|
| **Must** | 41 | Toutes les features sont Must — scope contraint, pas de Should dans ce projet |
| **Should** | 0 | Rien de Should : tout ce qui n'est pas Must est explicitement hors scope |
| **Could** | 0 | |
| **Won't** | — | Voir section "Hors scope" ci-dessous |

> Le POC étant un périmètre très contraint, toutes les features retenues sont Must. La distinction de valeur se fait via la **complexité** et le **sprint d'implémentation**.

---

## Résumé par catégorie

| Catégorie | Features | Fichier | Sprint(s) |
|-----------|----------|---------|-----------|
| Authentification & Sécurité | F01 – F05 | [features-auth.md](features-auth.md) | 1 |
| Profil & Navigation | F06 – F08 | [features-profile.md](features-profile.md) | 1 |
| Demandes de Congé & Validation | F09 – F17 | [features-leave.md](features-leave.md) | 1–2 |
| Calendrier | F18 – F20 | [features-calendar.md](features-calendar.md) | 3 |
| Administration (Types de congé + Soldes) | F21 – F23, F31 | [features-admin.md](features-admin.md) | 3 |
| Infrastructure & Données de démo | F24 – F26 | [features-infrastructure.md](features-infrastructure.md) | 1, 3 |
| États UI & UX | F27 – F30 | [features-ui.md](features-ui.md) | 2–3 |
| Notifications email | F32 – F35 | [features-notifications.md](features-notifications.md) | 4 |
| Tableau de bord admin | F36 – F38 | [features-dashboard.md](features-dashboard.md) | 4 |
| Factures Vault PDF | F39 – F41 | [features-invoices.md](features-invoices.md) | 4 |

---

## Résumé par complexité

| Complexité | Features |
|------------|----------|
| **High** | F05 (RLS), F10 (RPC validation), F17 (trigger PostgreSQL), F25 (seed), F33, F34, F35 (Edge Function + cron) |
| **Medium** | F07, F08, F09, F12, F13, F14, F15, F18, F19, F20, F22, F27, F31, F36, F37, F39, F40 |
| **Low** | F01, F02, F03, F04, F06, F11, F16, F21, F23, F24, F26, F28, F29, F30, F38, F41 |
| **Won't Have** | F32 (birth_date/trial_ends_at UI — via Supabase Dashboard, D8) |

---

## Catalogue complet des features

### Authentification & Sécurité

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F01 | Connexion email / mot de passe | Low | 1 | AUTH-01 |
| F02 | Protection des routes privées | Low | 1 | AUTH-02 |
| F03 | Contrôle d'accès admin-only (/leave-types) | Low | 1 | AUTH-02 |
| F04 | Déconnexion | Low | 1 | AUTH-03 |
| F05 | Row Level Security (RLS) sur toutes les tables | High | 1 | §9 RLS |

### Profil & Navigation

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F06 | Fiche profil utilisateur (read-only) | Low | 1 | PROFIL-01 |
| F07 | Affichage du solde de congé par type | Medium | 1 | PROFIL-02 |
| F08 | Navigation principale responsive (rôle-aware) | Medium | 1 | NAV-01 |

### Demandes de Congé & Validation

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F09 | Formulaire de création de demande (modal) | Medium | 2 | LEAVE-01 |
| F10 | RPC `create_leave_request` (chevauchement + solde) | High | 2 | LEAVE-01, A8 |
| F11 | Historique des demandes (vue employé) | Low | 2 | LEAVE-02 |
| F12 | File de validation manager — niveau 1 | Medium | 2 | LEAVE-03 |
| F13 | Soldes équipe (vue manager) | Medium | 2 | LEAVE-03, D1 |
| F14 | Table admin — toutes les demandes + filtre | Medium | 2 | LEAVE-04 |
| F15 | Validation finale admin — niveau 2 | Medium | 2 | LEAVE-05 |
| F16 | Bypass niveau 1 : admin approuve un pending directement | Low | 2 | LEAVE-05, D3 |
| F17 | Trigger PostgreSQL `update_leave_balance` | High | 1 | SOLDE-01, A6 |

### Calendrier

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F18 | Calendrier vue employé | Medium | 3 | CAL-01 |
| F19 | Calendrier vue manager + encart "Absents aujourd'hui" | Medium | 3 | CAL-02 |
| F20 | Calendrier vue admin (global, filtre par équipe) | Medium | 3 | CAL-03 |

### Administration — Types de congé & Soldes

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F21 | Liste des types de congé | Low | 3 | TYPES-01 |
| F22 | Ajout et modification de types de congé | Low | 3 | TYPES-01 |
| F23 | Désactivation / réactivation de types de congé | Low | 3 | TYPES-01 |
| F31 | Gestion des soldes par l'admin (onglet Soldes) | Medium | 3 | SOLDE-ADMIN |

### Infrastructure & Données de démo

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F24 | Setup projet (Nuxt + Tailwind + Supabase) | Low | 1 | §1, §8 |
| F25 | Script seed idempotent (`supabase/seed.sql`) | Medium | 1 | §10 |
| F26 | Déploiement Vercel + smoke test | Low | 3 | §7 |

### États UI & UX

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F27 | États UI globaux (loading / erreur / vide / succès) | Medium | 3 | ERROR-01 |
| F28 | Page 404 | Low | 3 | ERROR-01 |
| F29 | Modales de confirmation (approuver / refuser) | Low | 2 | LEAVE-03, 04 |
| F30 | Toasts de succès et d'erreur | Low | 2 | ERROR-01 |

### Notifications email

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F32 | Saisie admin `birth_date` / `trial_ends_at` sur `/profile` | Low | 4 | NOTIF-01 |
| F33 | Notification email : anniversaire de naissance | High | 4 | NOTIF-02 |
| F34 | Notification email : anniversaire d'ancienneté | High | 4 | NOTIF-03 |
| F35 | Notification email : fin de période d'essai (J-7 + J0) | High | 4 | NOTIF-04 |

### Tableau de bord admin

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F36 | Tableau de bord admin — bandeau 4 métriques | Medium | 4 | DASH-01 |
| F37 | Tableau de bord admin — liste statuts employés | Medium | 4 | DASH-02 |
| F38 | Tableau de bord admin — filtre présents / en congé | Low | 4 | DASH-03 |

### Factures Vault PDF

| ID | Feature | Complexité | Sprint | PRD ref |
|----|---------|------------|--------|---------|
| F39 | Création de fiche facture | Medium | 4 | INVOICE-01 |
| F40 | Upload et téléchargement PDF | Medium | 4 | INVOICE-02 |
| F41 | Gestion du statut facture + filtre | Low | 4 | INVOICE-03 |

---

## Graphe de dépendances critiques (chemin critique)

```
F24 (setup)
  └─ F05 (RLS + schéma DB)
       └─ F17 (trigger)
            └─ F25 (seed)
                 └─ F01 (auth)
                      └─ F02 (middleware)
                           ├─ F03 (admin-only)
                           ├─ F06 → F07 (profil + solde)
                           ├─ F08 (navigation)
                           └─ F10 (RPC) → F09 (formulaire)
                                              └─ F11 (historique)
                                              └─ F12 → F13 (manager)
                                              └─ F14 → F15 → F16 (admin)
                                                   └─ F18 → F19 → F20 (calendrier)
```

---

## Hors scope (Won't Have — POC)

| Feature | Raison |
|---------|--------|
| Inscription self-service | Comptes créés via seed uniquement |
| Notifications push (mobile/Slack) | Email uniquement via Edge Functions |
| Export PDF / CSV | Fonctionnalité MVP |
| Intégrations tierces (Slack, GCal, HRIS) | Hors périmètre |
| Gestion des jours fériés | Jours calendaires simples uniquement |
| Acquisition mensuelle de congés | Quota annuel fixe |
| Multi-langue | Français uniquement |
| Gestion des équipes par l'admin | Équipes pré-seedées |
| Pagination des listes | Volume de démo limité |
| Historique de mouvements de solde | Hors scope (D2 confirmé) |
| Suppression de types de congé | Risque cohérence référentielle |
| Délégation de validation manager | Hors scope (D3 confirmé) |

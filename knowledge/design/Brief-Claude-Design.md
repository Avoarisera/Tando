# WakaBods — Brief de refonte intégrale

> Copie du vault Obsidian (`Projets/Personnels/Tando/Docs/Brief-Claude-Design.md`), version 1.0 du 05/11/2026.

> **À l'attention de Claude Design.** Ce document se suffit à lui-même : il décrit **le besoin**, **les utilisateurs**, **les écrans à concevoir** et **les règles du design system**.
> Il s'appuie sur une visite complète de l'app actuelle (comptes admin, manager et employé, sur ordinateur et en mobile 390 px), sur une étude des outils concurrents et sur les décisions produit du 05/11/2026.
> **La refonte est intégrale** : on ne retouche pas l'existant, on repense chaque page. On garde les fonctions, les rôles et les quelques repères listés en §9.

---

## 1. Le produit

**WakaBods** est une plateforme RH légère pour des **équipes en télétravail, en Europe**. Elle réunit trois sujets dans une seule app :

1. **Congés et absences.** On pose une demande, elle passe par **deux validations** (le manager, puis l'admin), les soldes se mettent à jour automatiquement, et un calendrier montre l'équipe. Les types de congé sont réglables.
2. **Vélocité Dev.** Des statistiques de livraison des équipes tech, calculées à partir de **Linear** (l'outil de tickets) : tickets livrés, points, temps de cycle, rework, par équipe, par développeur et par ticket.
3. **Factures.** Le suivi des factures (statut, échéance, PDF) et, demain, leur création en PDF.

**Ce qui fait la différence :** WakaBods est le seul à avoir **les absences et la vélocité dans la même app**. Une baisse de livraison s'explique souvent par des congés, et la capacité réelle d'une équipe tech dépend de qui est présent. La refonte doit **montrer ce lien** (§6, écrans V-02, V-03 et V-04).

**Pourquoi une refonte :**
- L'app actuelle est un POC fonctionnel au style générique : logo en texte bleu, aucune icône, police système, gabarit Tailwind par défaut.
- Elle **montre** l'information, mais **n'accompagne pas l'action** : pas de page d'accueil, pas de notifications, aucun suivi visuel d'une demande, des tableaux coupés sur mobile.
- Il faut un produit **fluide, rassurant et rapide**, qu'on ouvre 30 secondes pour poser un congé ou valider une demande.

## 2. Cible et contexte

- **Entreprises européennes** : startups, PME et équipes tech de **5 à 200 personnes** environ, en télétravail ou hybride, parfois réparties dans plusieurs pays.
- **Plusieurs pays, plusieurs langues :** chaque personne a un pays (qui fixe ses jours fériés et ses jours travaillés), une langue (FR et EN au lancement, puis d'autres) et un fuseau horaire.
- **Utilisation :**
  - l'**employé** vient quelques fois par mois, souvent **sur mobile** ;
  - le **manager** vient chaque semaine, sur ordinateur et mobile ;
  - l'**admin** (RH ou dirigeant) vient chaque jour, **sur ordinateur**.
- **Ton :** professionnel et chaleureux, jamais infantilisant. Ce sont des collègues qui s'organisent, pas un outil de contrôle. Les statistiques de vélocité ne doivent **jamais** ressembler à un classement ou à de la surveillance.

## 3. Utilisateurs et besoins

### 3.1 Employé
| | |
|---|---|
| **Ce qu'il vient faire** | Savoir combien de jours il lui reste, poser un congé, savoir si c'est validé, voir qui est absent dans son équipe |
| **Ce qui le frustre aujourd'hui** | Il arrive sur une fiche profil statique. Il découvre que son solde est insuffisant **après** avoir envoyé. Il ne peut ni annuler ni modifier une demande. « Validé manager » ne lui dit pas qu'une deuxième validation suit. Il ne sait jamais pourquoi c'est refusé |
| **Objectif de la refonte** | **Poser un congé en moins de 30 secondes, depuis n'importe quelle page**, en voyant son solde et les absences de l'équipe au moment de choisir les dates. Savoir **à tout moment** où en est sa demande |

### 3.2 Manager (chef d'équipe)
| | |
|---|---|
| **Ce qu'il vient faire** | Valider vite les demandes de son équipe sans la mettre en difficulté, voir qui est absent, poser ses propres congés |
| **Ce qui le frustre aujourd'hui** | Chaque validation ouvre une modale. Rien ne lui dit si un collègue est déjà absent aux mêmes dates. Il n'est pas prévenu des nouvelles demandes. **Il ne peut pas poser ses propres congés** |
| **Objectif de la refonte** | **Valider en un geste** (avec possibilité d'annuler), en voyant **l'impact sur l'équipe** : qui d'autre est absent, combien restent présents. Ses propres demandes **partent directement à l'admin** |

### 3.3 Admin (RH, dirigeant)
| | |
|---|---|
| **Ce qu'il vient faire** | Valider en dernier, voir qui est là, gérer les personnes, les types de congé, les soldes, les jours fériés et les règles par pays, exporter pour la paie, gérer les factures, suivre la vélocité tech |
| **Ce qui le frustre aujourd'hui** | Un tableau de bord avec 4 chiffres, sans aucune action. Les personnes se gèrent hors de l'app. Pas d'export. Les tableaux débordent. Les factures ne sont qu'une liste |
| **Objectif de la refonte** | Un **cockpit** : ce qui est à valider, qui est absent aujourd'hui et dans les 14 prochains jours, les alertes. Tout ce qui est administratif se fait **sans quitter l'app** |

## 4. Principes de design

1. **Une page d'accueil par rôle**, qui répond à « qu'est-ce que je dois faire maintenant ? ».
2. **Agir là où on voit** : valider depuis le tableau de bord, poser un congé depuis le calendrier ou l'accueil. Une action fréquente prend un clic, avec possibilité d'annuler juste après ; une action destructive demande une confirmation, en rouge.
3. **Toujours savoir où on en est** : un suivi en étapes pour chaque demande, des badges de statut cohérents partout, des notifications.
4. **Prévenir plutôt que signaler une erreur** : montrer le solde, les conflits et les jours fériés **avant** l'envoi, plutôt qu'un message d'erreur après.
5. **Le mobile d'abord pour l'employé, l'ordinateur d'abord pour l'admin** : aucun tableau coupé. Un tableau devient une liste de cartes sur petit écran.
6. **Calme et lisible** : beaucoup d'espace, une seule action principale par écran, de la couleur seulement quand elle porte du sens (statut, type de congé, alerte).
7. **Prêt pour plusieurs langues et pays dès le départ** : aucun texte figé dans une image, des libellés qui supportent 30 % de longueur en plus, des formats selon la langue (§8).

## 5. Architecture de l'information

### 5.1 Menu par rôle (barre latérale sur ordinateur)

| Section | Employé | Manager | Admin |
|---|---|---|---|
| **Moi** | Accueil · Mes congés | Accueil · Mes congés | — |
| **Équipe** | Calendrier | Calendrier · **À valider** (avec compteur) | Calendrier · **À valider** (avec compteur) |
| **Pilotage** | — | Vélocité *(si l'admin l'a activée)* | **Tableau de bord** · Vélocité |
| **Administration** | — | — | Personnes et équipes · Congés et règles · Factures · Paramètres |

- Chaque entrée a une **icône** et un libellé. La barre peut se replier pour ne garder que les icônes.
- Le logo est **en haut**. Le **profil** et la déconnexion passent dans l'en-tête.

### 5.2 En-tête global (toutes les pages)
- À gauche, le fil d'Ariane ou le titre de la page.
- À droite :
  - une **recherche** (personnes, factures, tickets ; admin d'abord) ;
  - le bouton **« Poser un congé »**, toujours visible pour l'employé et le manager ;
  - une **cloche de notifications** avec un compteur ;
  - l'**avatar**, avec un menu : Mon profil, Préférences (langue, fuseau, notifications), Mot de passe, Déconnexion.

### 5.3 Mobile (moins de 768 px)
- **Employé et manager :** une **barre d'onglets en bas** (Accueil · Congés · Calendrier · Profil), avec un **bouton rond « + »** pour poser un congé. Pour le manager, l'onglet Congés porte le compteur « À valider ».
- **Admin :** un menu tiroir (☰) avec les mêmes sections que sur ordinateur.
- Les panneaux latéraux deviennent des **feuilles qui montent du bas**.

---

## 6. Écrans à concevoir

> Pour chaque écran : **qui**, **pourquoi**, **contenu**, **actions** et **états** (chargement, vide, erreur).
> **P1** = un écran qui existe aujourd'hui et qu'on refait. **P2** = un nouvel écran déjà décidé, à concevoir dès maintenant pour que le design system le couvre.
> Les libellés entre guillemets sont des exemples en français ; tout doit exister aussi en anglais.

### Accès

**A-01 Connexion** (P1, tous)
- Le logo, « Connectez-vous à votre espace », les champs E-mail et Mot de passe (avec un œil pour afficher le mot de passe), le bouton **Se connecter**, le lien **Mot de passe oublié ?**, et le choix de la langue en bas.
- Le bouton reste **désactivé tant que la page n'est pas prête**, pour éviter les envois perdus.
- Erreur : « E-mail ou mot de passe incorrect ».
- Il n'y a pas d'inscription libre : on rejoint l'app **sur invitation**.

**A-02 Mot de passe oublié et réinitialisation** (P2, tous)
- Saisie de l'e-mail, puis « Un lien vous a été envoyé ».
- Page « Nouveau mot de passe », avec ses règles et un indicateur de force.

**A-03 Accepter une invitation** (P2, nouvel arrivant)
- « Marc vous invite à rejoindre Acme sur WakaBods » : on choisit son mot de passe, sa langue et son fuseau (prérempli), puis on arrive sur l'accueil.

### Employé et manager

**E-01 Accueil « Mon espace »** (P2, employé et manager). C'est la **page d'arrivée**.
1. « Bonjour Emma 👋 », la date du jour, et un gros bouton **Poser un congé**.
2. **Mes soldes** : une carte principale (« Congés payés : **20** / 25 jours », sous forme d'anneau ou de barre), et les autres types en petit (RTT, Maladie…). Les types qui ne décomptent rien (par exemple Télétravail) ne s'affichent pas ici.
3. **Mon prochain congé** : « Dans 12 jours · du 12 au 16 mai · 5 jours ouvrés », ou « Aucun congé prévu — pensez à souffler 🌿 » si l'employé n'a rien posé depuis plusieurs mois.
4. **Mes demandes en cours** : 1 à 3 cartes avec le suivi en étapes (voir E-02).
5. **Mon équipe cette semaine** : des avatars par jour, avec les absents en couleur du type et la mention « Eddy · RTT · lun → mer ».
6. **Manager seulement :** un bloc **« À valider (2) »** en haut, avec Approuver et Refuser directement dans le bloc.
- **Vide :** pour un nouvel arrivant sans solde, « Vos soldes n'ont pas encore été configurés par votre administrateur ».

**E-02 Mes congés** (P1, refait)
- Des **onglets** : À venir · En cours de validation · Passés · Refusés et annulés.
- Chaque demande est une **carte** (y compris sur ordinateur) avec :
  - une pastille de la couleur du type, le type, la période (« du lun. 12 au ven. 16 mai 2026 ») et la durée en **jours ouvrés** ;
  - un badge de statut ;
  - un **suivi en 3 étapes** : Envoyée → Manager → Admin, avec pour chaque étape ✓ la date et le nom de la personne, ou une horloge si elle est en attente. Pour un manager, il n'y a que 2 étapes (Envoyée → Admin) ;
  - si c'est refusé, le **motif** dans un encadré ;
  - un menu « ⋯ » : **Modifier** (si En attente), **Annuler** (si En attente ou Validé manager), **Demander l'annulation** (si Approuvé et pas encore commencé).
- Un clic ouvre le **panneau de détail** : tout ce qui précède, plus le commentaire, le justificatif joint et l'historique complet des actions.
- **Vide :** une illustration, « Aucune demande pour le moment », et le bouton « Poser un congé ».

**E-03 Poser un congé** (P1, refait en entier). C'est un panneau latéral sur ordinateur, une feuille en plein écran sur mobile.
1. **Type de congé** : des cartes ou une liste avec la pastille de couleur, le nom et le solde restant (« Congés payés · 20 j restants »).
2. **Période** : un **calendrier de sélection de plage**, sur 2 mois côte à côte sur ordinateur, un seul sur mobile :
   - week-ends et **jours fériés du pays de la personne** grisés, avec leur nom au survol (« 1er mai · Fête du travail ») ;
   - **périodes bloquées** hachurées (« Clôture annuelle ») ;
   - **un point coloré** les jours où un collègue est déjà absent, avec « Eddy (RTT) » au survol ;
   - pour le premier et le dernier jour, le choix **Journée / Matin / Après-midi** (à prévoir dans le design, pour plus tard).
3. **Résumé, mis à jour en direct** :
   - « 5 jours ouvrés · du lun. 12 au ven. 16 mai » ;
   - « Solde après cette demande : **15 jours** », qui passe en rouge avec un message si le solde est insuffisant ;
   - « ⚠️ Eddy est aussi absent les 12 et 13 mai », à titre d'information seulement : ça ne bloque pas.
4. **Commentaire** facultatif, avec un compteur sur 500 caractères.
5. **Justificatif** (si le type l'exige, par exemple Maladie) : une zone de dépôt PDF ou photo, avec la mention « Visible uniquement par les RH ».
6. Le bouton **Envoyer la demande** (désactivé tant que la demande n'est pas valide), et un récapitulatif de qui va valider : « Sera validée par Marc (manager), puis Alice (RH) ».
- Après l'envoi : un message « Demande envoyée », et la carte apparaît dans Mes congés.

**E-04 Calendrier** (P1, refait, tous les rôles). Trois vues au choix :
- **Mois** : la grille classique. Un congé est une barre continue sur plusieurs jours, de la couleur du type, avec avatar et prénom. Une demande en attente est **hachurée**, une demande refusée ou annulée n'apparaît pas. Les fériés sont marqués. Aujourd'hui est mis en évidence. Cliquer sur un jour vide propose de poser un congé.
- **Planning** (nouveau) : **une ligne par personne, une colonne par jour**, sur 2 à 4 semaines. En bas, une ligne « présents / effectif » par jour, en rouge si elle passe sous le seuil de l'équipe. C'est la vue de référence du manager et de l'admin.
- **Liste** : la vue par défaut sur mobile. Les congés sont regroupés par semaine, chaque carte a un liseré de couleur, l'avatar, le nom, le type et les dates.
- **Filtres** : équipe (manager et admin), type de congé, « moi uniquement » ; plus « afficher le télétravail ».
- Un encadré **Absents aujourd'hui** avec des avatars, pour le manager et l'admin.
- Le bouton **S'abonner** donne un lien d'agenda à ajouter dans Google, Outlook ou Apple.
- La légende des types ne montre que les types visibles.

**E-05 Profil et préférences** (P1, refait, tous)
- **Identité** : photo ou avatar à initiales, nom, rôle, équipe, pays, date d'entrée. En lecture seule pour l'employé ; l'admin les modifie dans P-02.
- **Mes soldes** : le détail par type, avec Acquis, Utilisés, Restants, À venir (posés mais pas encore pris) et **Report de l'an dernier** (avec sa date limite).
- **Préférences** : langue, fuseau horaire, format de date (automatique selon la langue), notifications (e-mail et dans l'app, par événement).
- **Sécurité** : changer le mot de passe.
- **Agenda** : mon lien iCal personnel, avec Copier et Régénérer.
- **Mes données** (RGPD) : exporter mes données, demander leur suppression.

**E-06 À valider** (P1, refait, manager et admin)
- Pour chaque demande, une carte ou une ligne dépliable :
  - l'avatar, le nom, l'équipe, le type, la période et la durée en jours ouvrés, le commentaire ;
  - un bloc **Impact** : « ✓ Aucun chevauchement », ou « ⚠️ Eddy aussi absent les 12–13 mai » ; « Présents le 13 mai : **1 / 3** » en rouge sous le seuil ; « Solde après : 15 j » ;
  - un **mini-planning** de l'équipe autour des dates demandées ;
  - les actions **Approuver** (en un clic, avec un message « Demande approuvée · Annuler » pendant 5 s) et **Refuser** (qui ouvre une fenêtre avec un **motif obligatoire** et un bouton **rouge**).
- **Admin :** des filtres (statut, équipe, type, période, recherche), des cases à cocher et **Approuver la sélection**. Chaque ligne indique « niveau 2 » (déjà validé par le manager) ou « niveau 1 » (avec l'avertissement « Vous allez approuver sans l'avis du manager »).
- Un onglet **Demandes d'annulation** (des congés approuvés que l'employé veut annuler).
- **Vide :** « Rien à valider 🎉 ».

### Admin

**P-01 Tableau de bord** (P1, refait en entier)
1. **Bandeau d'indicateurs** avec tendance : Effectif (managers compris) · Présents aujourd'hui · Absents aujourd'hui · Absents cette semaine (« ↑ +2 vs semaine dernière »).
2. **À valider** : les 5 premières demandes, avec action directe, et « Voir tout (8) ».
3. **Aujourd'hui** : les absents (avatar, type, date de retour), et les présents en télétravail ou au bureau si l'info existe.
4. **14 prochains jours** : un histogramme du nombre d'absents par jour, et en dessous la liste des départs à venir.
5. **Alertes** :
   - soldes non consommés à l'approche de la fin de période ;
   - personnes sans aucun congé depuis plus de 4 mois ;
   - fins de période d'essai à venir ;
   - **factures en retard** ;
   - synchronisation Linear en échec.
6. **Vélocité en un coup d'œil** : capacité tech de la semaine (« 8 devs présents sur 11 ») et un lien vers la Vélocité.
- Une rangée d'actions rapides : Inviter une personne · Exporter les absences du mois · Nouvelle facture.

**P-02 Personnes et équipes** (P2)
- **Liste :**
  - recherche, et filtres par équipe, rôle, pays et statut (actif, invité, désactivé) ;
  - colonnes : avatar et nom · rôle · équipe · pays · date d'entrée · statut du jour (présent, absent, télétravail) · solde principal.
- **Fiche personne** (panneau ou page) :
  - **Identité et contrat** : rôle, équipe, manager, pays, date d'entrée, date de naissance, fin de période d'essai, langue, fuseau ;
  - **Soldes** modifiables, avec historique des mouvements ;
  - **Congés** : ses demandes ;
  - **Accès** : rôle, et « accès Vélocité » pour un manager ;
  - actions : **Désactiver le compte** (pour un départ), **Renvoyer l'invitation**.
- **Inviter** : e-mail, prénom, nom, rôle, équipe, pays, date d'entrée et politique de congé, puis Envoyer l'invitation. Prévoir aussi un import CSV de plusieurs personnes.
- **Équipes** : la liste des équipes, avec leur manager et leurs membres ; créer, renommer, changer le manager ; **seuil de présence minimum** par équipe (par exemple 50 %) ; lien vers une équipe Linear (pour la Vélocité).

**P-03 Congés et règles** (P1, refait et étendu). Cinq onglets :
1. **Types de congé** :
   - nom (dans chaque langue), couleur (parmi des couleurs déjà vérifiées pour le contraste, ou une couleur personnalisée), icône ;
   - réglages : décompte ou non un solde (par exemple Télétravail ne décompte rien), justificatif obligatoire, circuit de validation (manager puis admin, manager seul, admin seul) ;
   - actif ou inactif.
2. **Politiques** :
   - par pays ou par groupe : quota annuel **ou** acquisition mensuelle, report (nombre de jours et date limite), début de la période, jours en plus à l'ancienneté ;
   - des **modèles par pays** (« France — 25 jours ouvrés »…) qu'on duplique puis qu'on modifie, et l'attribution aux personnes.
3. **Soldes** :
   - année ; un tableau par type avec Alloués · Utilisés · À venir · Restants · Report ;
   - modification en ligne, « Appliquer à tous », et **Exporter (CSV)**.
4. **Jours fériés** : par pays, une liste par année préremplie, avec ajout et suppression (fériés régionaux).
5. **Périodes bloquées** : un nom, des dates, les équipes concernées, et un mode (« bloquer » ou « avertir »).
- **Export paie** : un bouton qui génère le CSV des absences approuvées d'un mois.

**P-04 Factures** (P1, refait et étendu)
- **Liste :**
  - un bandeau de totaux : En attente · Envoyées · Payées · **En retard** (montant et nombre, avec la devise) ;
  - recherche, filtres de statut en pastilles, filtre client et période, tri par colonne ;
  - colonnes : n° · client · montant · date · échéance · statut (badge cliquable pour changer) · PDF ;
  - le badge rouge **En retard** est calculé quand l'échéance est passée et que la facture n'est pas payée ;
  - un clic ouvre un **panneau d'aperçu PDF** à droite, avec Télécharger, Remplacer, Modifier, Dupliquer et Supprimer.
- **Créer ou modifier une facture** (P2), en deux colonnes avec l'aperçu en direct à droite :
  - client (un carnet de clients, avec nom, adresse, n° de TVA et e-mail), et langue du document (FR ou EN) ;
  - n° (attribué automatiquement), date, échéance (avec des raccourcis : 30 jours, fin de mois) ;
  - **lignes** : libellé, quantité, prix unitaire, taux de TVA, total ; on peut ajouter, réordonner et supprimer des lignes ;
  - devise (EUR, USD, GBP, CHF…), remise, mention d'autoliquidation intracommunautaire ;
  - notes, conditions de paiement, IBAN ;
  - boutons **Enregistrer le brouillon** et **Générer le PDF**, ou bien **Joindre un PDF existant**.
- **Note réglementaire** (une bannière discrète, selon le pays) : « Dans certains pays, la facture électronique B2B devient obligatoire : un PDF classique peut ne pas suffire ».

**P-05 Paramètres de l'entreprise** (P2)
- **Entreprise** : raison sociale, logo, adresse, n° de TVA, IBAN (utilisés par les factures), pays par défaut, langues disponibles.
- **Notifications** : envoi du récapitulatif quotidien (heure, destinataires), modèles d'e-mails.
- **Intégrations** : Linear (les workspaces, voir V-01), agenda iCal (activé ou non), et Slack *(plus tard : prévoir la place, marqué « Bientôt »)*.

### Vélocité Dev (admin, et manager si l'admin l'a activé)

> La Vélocité actuelle est **riche et appréciée** : il faut **l'habiller**, la rendre lisible et adaptée au mobile, **sans retirer** d'indicateur.
> Ton : un outil pour comprendre l'équipe et en discuter, **pas un classement**.

**V-01 Workspaces Linear** (P1)
- Une carte par workspace :
  - le nom et le logo Linear ;
  - « Dernière sync **il y a 12 min** » et l'état (✓ OK, en cours avec barre et étape, ou ✗ erreur avec le message et Réessayer) ;
  - le nombre de tickets ;
  - les équipes suivies en badges ;
  - les actions Synchroniser, Resync complet, Gérer les équipes, et Supprimer (avec une confirmation rouge qui précise que toutes les données seront effacées).
- **Connecter un workspace**, en 2 étapes :
  1. nom et clé API. Les champs ne doivent **jamais être préremplis par le navigateur**. Une aide explique où trouver la clé dans Linear ;
  2. choix des équipes, avec des cases à cocher et Tout sélectionner.

**V-02 Équipe** (P1)
- En-tête : retour, le nom de l'équipe, et l'année et la période (3 / 6 / 12 mois) en contrôle segmenté.
- **Indicateurs** : Tickets livrés · Points · Cycle médian (In Progress → In Review) · Rework %, chacun avec une explication ⓘ et une tendance.
- **Alertes d'équipe** : Tickets bloqués (plus de 5 jours en Review ou QA) et Tickets à analyser (dépassement de l'estimation). Les seuils sont **réglables par équipe**, avec un état vide positif (« Aucun ticket bloqué — bravo l'équipe »).
- **Heatmap** : les tickets livrés par dev et par mois, en dégradé de la couleur principale. **Les mois avec des congés sont marqués** (hachure ou icône 🌴 avec le nombre de jours). Cliquer sur une case ouvre la fiche du dev sur ce mois. Le défilement est horizontal à l'intérieur de la carte sur mobile.
- **Throughput** : une courbe des tickets livrés par mois, avec en fond la **capacité** (jours de présence cumulés de l'équipe).
- **Distribution de l'équipe** :
  - chaque dev par rapport à la médiane de l'équipe : Total, Moy./mois, **Tickets par jour de présence**, Cycle, Rework ;
  - code couleur au-dessus, proche ou en dessous de la médiane, avec des flèches de tendance ;
  - une phrase rappelle que ce n'est pas une compétition ;
  - sur mobile, une carte par dev.
- **Composition** : la répartition de l'effort (feature, bug, maintenance) selon les labels Linear.

**V-03 Capacité du cycle** (P2, la nouveauté qui nous distingue)
- Pour le cycle Linear en cours ou le prochain, une ligne par dev :
  - les jours disponibles (moins les congés, approuvés ou en attente) ;
  - les points engagés ;
  - une jauge OK / Chargé / **Surchargé**.
- Un total pour l'équipe, et la liste des absences qui tombent pendant le cycle.

**V-04 Fiche dev** (P1)
- En-tête : retour, avatar et nom, période.
- **Indicateurs** : Tickets · Points · Bugs (sans estimation) · Cycle P50 et P90 · Rework · WIP moyen, chacun avec ⓘ et l'évolution par rapport au mois précédent.
- **Bandeau des absences** sur la période : « 🌴 10 jours de congé en août ».
- **Tickets livrés** : des pastilles de mois, le filtre Rework uniquement, et un tableau (sur ordinateur) ou des cartes (sur mobile) avec identifiant, titre, points, statut, cycle et étiquette rework. Cliquer sur la ligne ouvre le ticket ; une icône dédiée ouvre Linear. Pagination.
- **Graphiques** : Cycle dev / Review / QA (empilé, avec une légende **à 3 couleurs**), Tickets par mois et Points par mois (avec la ligne de moyenne), Composition. Les jours d'absence sont marqués en fond.

**V-05 Ticket** (P1)
- L'identifiant (lien vers Linear), le statut, le titre ; les indicateurs Estimation, Cycle dev, Démarré le, En QA le.
- **La frise des transitions** : une ligne verticale avec un badge d'état coloré à chaque étape (Todo en gris, In Progress et In Review en bleu, Pending MEP en ambre, Done en vert), la date et l'heure, et la durée passée dans l'état.
- Des alertes « Aller-retour dev ↔ QA détecté » et « Bloqué plus de 48 h en QA ».

### Transverse

**T-01 Panneau de notifications** (P2) : il s'ouvre depuis la cloche. Les notifications sont groupées par jour, avec une icône par type :
- demande approuvée, refusée ou à valider ;
- demande d'annulation ;
- anniversaire d'arrivée ou de naissance ;
- fin de période d'essai ;
- facture en retard ;
- synchronisation en échec.

Chacune a une action directe (Voir, Approuver). On peut tout marquer comme lu, et un lien mène aux préférences.

**T-02 Messages et confirmations** : un message temporaire pour un succès, une erreur, ou une action à annuler (« Annuler » pendant 5 s). La confirmation d'une action destructive a toujours un bouton **rouge** et un titre explicite.

**T-03 États système** : chargement (des blocs gris qui reprennent la forme du contenu), vide (une illustration, un texte et une action), erreur (un bandeau avec Réessayer), et les pages **403, 404, 500 et maintenance**. Hors ligne sur mobile : « Vous êtes hors ligne ».

**T-04 Modèle PDF de facture** (P2) : un A4 en FR ou EN, avec logo et coordonnées de l'entreprise, client, n°, dates, tableau des lignes, totaux HT, TVA et TTC, mentions, IBAN et conditions. Sobre, lisible en noir et blanc.

**T-05 E-mails** (P2) : un gabarit commun (logo, titre, texte, un bouton d'action, pied de page avec le lien vers les préférences), décliné pour les notifications de T-01 et le **récapitulatif quotidien** (« Absents aujourd'hui · 2 demandes à valider »).

---

## 7. Design system à livrer

### 7.1 Fondations
- **Couleurs :**
  - une couleur principale (actions, liens, sélection). Aujourd'hui c'est le bleu `#2563EB` ; on peut la faire évoluer, en gardant un bleu ou une teinte proche pour la continuité ;
  - les couleurs **sémantiques** : succès, avertissement, danger, information, neutre, chacune avec ses déclinaisons fond, bordure, texte et plein ;
  - les **couleurs de statut**, à garder fixes :

| Statut | Couleur |
|---|---|
| En attente | gris |
| Validé manager | ambre |
| Approuvé | vert |
| Refusé | rouge |
| Annulation demandée | violet ou indigo (nouveau) |
| Annulé | gris barré (nouveau) |

  - **Couleurs des types de congé** : c'est l'admin qui les choisit, elles sont **dynamiques**. Il faut une **palette d'environ 12 couleurs** déjà vérifiées (lisibles en fond pâle avec texte foncé, en barre pleine, et en mode sombre). Si l'admin choisit une couleur personnalisée, l'app calcule automatiquement un texte contrasté ;
  - le **dégradé** de la heatmap et des graphiques, et une palette pour les séries de graphiques (lisible pour les daltoniens).
- **Typographie :** une police sans-serif moderne et très lisible en petite taille, avec des chiffres à largeur fixe pour les tableaux et les indicateurs (Inter ou équivalent), plus une police mono pour les identifiants de tickets. Une échelle : affichage, h1 à h3, corps, petit texte, légende.
- **Espacements** sur une base de 4 px, des **arrondis** (petit, moyen, grand, pastille), des **ombres** (3 niveaux maximum).
- **Icônes :** un seul jeu cohérent (Lucide ou équivalent).
- **Mode sombre :** optionnel, mais les variables de couleur doivent le permettre.
- **Illustrations** simples pour les états vides (5 ou 6 au maximum), cohérentes avec le ton chaleureux.

### 7.2 Composants (avec leurs états : normal, survol, focus, désactivé, chargement, erreur)
- **Boutons** : principal, secondaire, discret, danger, icône seule ; 3 tailles.
- **Champs** : texte, nombre, montant avec devise, liste déroulante, recherche, zone de texte avec compteur, case à cocher, interrupteur, bouton radio en carte, dépôt de fichier, **sélecteur de date et de plage** (avec fériés, périodes bloquées et points de conflit), sélecteur de couleur restreint à la palette.
- **Badge** (statut, rôle, type avec pastille), **Pastille de filtre**, **Contrôle segmenté** (par exemple 3 / 6 / 12 mois).
- **Avatar** (photo ou initiales, avec un indicateur de statut absent ou télétravail) et **Groupe d'avatars**.
- **Carte d'indicateur** : libellé, valeur, unité, tendance (↑↓ en couleur), explication ⓘ, mini-courbe facultative.
- **Suivi en étapes** (demande : Envoyée → Manager → Admin).
- **Tableau de données** : tri, sélection multiple, ligne dépliable, actions de ligne « ⋯ », pagination, défilement horizontal **à l'intérieur** de la carte ; il **se transforme en cartes** sous 768 px.
- **Barre de filtres** : recherche, pastilles, listes déroulantes, « Réinitialiser ».
- **Fenêtre modale** (confirmation et formulaire court), **Panneau latéral** (détail, aperçu PDF, poser un congé), **Feuille du bas** (mobile).
- **Message temporaire** (succès, erreur, avec action Annuler), **Bannière** (info, avertissement, erreur).
- **Onglets** (soulignés), **Fil d'Ariane**, **Menu déroulant**.
- **Calendrier** : cellule de jour, barre de congé (pleine, hachurée), planning en lignes par personne.
- **Heatmap**, et un **cadre de graphique** (titre, explication, légende, zone de graphique, encadré de moyenne).
- **Frise** verticale (transitions d'un ticket, historique d'une demande).
- **Jauge de capacité** (OK, Chargé, Surchargé).
- **Navigation** : barre latérale (dépliée ou repliée), en-tête, cloche et panneau de notifications, barre d'onglets mobile avec bouton « + ».
- **État vide**, **Blocs de chargement**, **Bandeau d'erreur**.

## 8. Contraintes

- **Langues :** l'interface est en FR et EN au lancement, puis en ES, DE, IT…
  - aucun texte figé ; prévoir **30 % de longueur en plus** (en allemand) ;
  - les libellés de boutons peuvent passer à la ligne ; pas de largeur fixe sur les textes.
- **Formats selon la langue :**
  - dates : `05/11/2026` (FR), `05.11.2026` (DE), `5 Nov 2026` (EN) ;
  - nombres et devises : `1 500,00 €` (FR) ou `€1,500.00` (EN) ;
  - premier jour de la semaine (lundi en Europe) ;
  - les jours de la semaine dans le calendrier suivent la langue.
- **Fuseaux horaires :** afficher l'heure locale de la personne ; dans le planning, il n'y a pas d'heures, seulement des jours.
- **Accessibilité WCAG 2.2 AA :**
  - contraste du texte d'au moins 4,5:1, y compris pour les textes secondaires (ceux d'aujourd'hui sont souvent trop pâles) ;
  - focus toujours visible ;
  - cibles tactiles d'au moins 44 px ;
  - **la couleur n'est jamais le seul signal** : un statut a toujours un texte, et une heatmap affiche toujours ses chiffres.
- **Tailles d'écran à couvrir :**

| Écran | Largeur |
|---|---|
| Mobile | 390 px |
| Tablette | 768 px |
| Ordinateur | 1280 px |
| Grand écran | 1440 px et plus |

  Aucune page ne doit défiler horizontalement : seuls les tableaux et la heatmap défilent, **dans leur carte**.
- **Technique (pour que le design soit réalisable tel quel) :**
  - Vue 3 / Nuxt 4, Tailwind CSS 4 : les fondations doivent s'exprimer en **variables** (couleurs, espacements, arrondis, ombres) ;
  - graphiques en Chart.js : courbes, barres, barres empilées, zones (les plus exotiques sont à éviter) ;
  - le PDF de facture est généré côté serveur, en HTML vers PDF.
- **Données sensibles :** les justificatifs médicaux et les statistiques individuelles ne s'affichent qu'aux personnes autorisées. L'interface doit le dire (« Visible uniquement par les RH », « Accès Vélocité activé par l'admin »).

## 9. Ce qu'on garde et ce qui doit disparaître

**On garde :**
- les 3 rôles, et le **circuit de validation en 2 niveaux** (manager puis admin ; l'admin peut aussi valider directement, et une demande de manager va directement à l'admin) ;
- les couleurs de statut (§7.1) et le principe d'une **couleur par type de congé, choisie par l'admin** ;
- tous les indicateurs Vélocité existants (heatmap, distribution par rapport à la médiane, cycle dev / review / QA, composition, frise du ticket) et leurs textes d'explication ;
- les libellés métier : « En attente », « Validé manager », « Approuvé », « Refusé », « Solde », « Acquis / Utilisés / Restants ».

**Doit disparaître (les problèmes constatés aujourd'hui) :**
- les tableaux coupés ou cachés : le bouton « Refuser » hors écran, et sur mobile Factures, Tableau de bord, Types de congé, Équipe et Fiche dev ;
- les pages entières plus larges que l'écran sur mobile ;
- une confirmation **bleue** pour une action destructive ;
- les en-têtes de tableau tantôt en MAJUSCULES, tantôt en casse normale ;
- les largeurs de page qui varient d'une page à l'autre, et les titres qui bougent entre les onglets ;
- un nom de menu différent du titre de la page (« Types de congé » contre « Administration des congés ») ;
- les noms écrits dans deux ordres (« Employé Eddy » contre « Eddy Employé ») : toujours **Prénom Nom** ;
- les sélecteurs de date du navigateur au format `mm/dd/yyyy` ;
- les textes gris trop pâles et peu lisibles ;
- l'absence d'en-tête, de notifications et de page d'accueil.

## 10. Données d'exemple pour les maquettes (fictives)

- **Entreprise :** Acme Studio, 14 personnes, présente en France, Belgique et Espagne, devise EUR.
- **Personnes :**

| Personne | Rôle | Équipe | Pays | Langue |
|---|---|---|---|---|
| Alice Martin | Admin (RH) | — | FR | FR |
| Marc Dubois | Manager | Produit | FR | FR |
| Sofia García | Manager | Tech | ES | EN |
| Emma Lefèvre | Employée | Produit | BE | FR |
| Eddy Laurent | Employé | Produit | FR | FR |
| Lukas Peeters | Dev | Tech | BE | EN |
| Inès Moreau | Dev | Tech | FR | FR |

- **Types de congé :** Congés payés (vert, 25 j), RTT (bleu, 10 j), Maladie (rouge, justificatif obligatoire), Sans solde (gris), Télétravail (violet, ne décompte rien).
- **Demandes :** Emma, CP du 12 au 16 mai (5 j), En attente · Eddy, RTT du 5 au 7 mai (3 j), Validé manager · Eddy, Maladie du 10 au 12 mars, Refusé (motif : « Justificatif manquant ») · Emma, CP du 14 au 18 avril, Approuvé.
- **Soldes :** Emma, CP 25 / 5 utilisés / 20 restants · Eddy, CP 25 / 0 / 25.
- **Factures :** FAC-2026-001 Nova SA 1 500,00 € Payée · FAC-2026-002 Blue Ocean SL 2 800,00 € Envoyée · FAC-2026-003 Pixel GmbH 750,00 € **En retard**.
- **Vélocité :** workspace « Acme », équipes API et Web, environ 3 900 tickets, 11 devs. Exemple : Inès, 30 tickets en octobre (+20 %), cycle P50 22 h, rework 37,5 %, 10 jours de congé en août.

## 11. Livrables attendus (dans cet ordre)

1. **Fondations du design system** (§7.1) et **composants clés** : boutons, champs, badges, carte d'indicateur, tableau qui devient cartes, suivi en étapes, sélecteur de plage, barre latérale, en-tête, barre d'onglets mobile.
2. **Parcours employé :** E-01 Accueil → E-03 Poser un congé → E-02 Mes congés → E-04 Calendrier, **sur mobile et sur ordinateur**.
3. **Parcours manager :** E-06 À valider (avec l'impact sur l'équipe) et E-04 Planning.
4. **Admin :** P-01 Tableau de bord, P-03 Congés et règles, P-02 Personnes, P-04 Factures (liste, éditeur, aperçu), P-05 Paramètres.
5. **Vélocité :** V-02 Équipe, V-04 Fiche dev, V-05 Ticket, V-01 Workspaces, V-03 Capacité.
6. **Accès et transverse :** A-01 à A-03, T-01 à T-05, pages système.
7. Pour chaque écran : **ordinateur 1440 px et mobile 390 px**, les états **vide, chargement et erreur**, et au moins un écran **en anglais** pour vérifier la longueur des textes.

## 12. Hors périmètre de cette refonte

- La conformité à la facture électronique (Factur-X, plateformes agréées) : l'app génère un PDF classique.
- Les connecteurs vers des logiciels de paie précis : on fait un export CSV générique.
- L'application Slack ou Teams : prévoir seulement la place dans les Paramètres, marquée « Bientôt ».
- Le pointage et les heures supplémentaires.
- Les indicateurs DORA basés sur Git (déploiements, incidents) : la Vélocité repose sur Linear seulement.

# Features — Factures Vault PDF

**Sprint:** 4  
**PRD refs:** INVOICE-01, INVOICE-02, INVOICE-03

---

### F39 — Création de fiche facture

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin  
**Depends on:** RFC-014 (migration invoices table), RFC-017

**Description**  
L'admin crée une fiche facture depuis `/invoices` via un modal, avec tous les champs commerciaux nécessaires.

**Acceptance Criteria**
- [ ] Page `/invoices` accessible uniquement pour `isAdmin`
- [ ] Bouton "Nouvelle facture" ouvre un modal
- [ ] Champs du modal : `reference` (texte, requis), `client` (texte, requis), `amount` (nombre, requis), `currency` (select : EUR/USD/GBP/CAD/AUD/MGA, défaut EUR), `invoice_date` (date, requis), `due_date` (date, optionnel), `notes` (textarea, optionnel)
- [ ] Validation front : référence non vide, client non vide, montant > 0, date facture renseignée
- [ ] Erreur serveur (ex : référence dupliquée) affichée inline dans le modal (modal reste ouvert)
- [ ] Succès → toast "Facture enregistrée" + facture apparaît en tête de liste + modal se ferme
- [ ] 4 états UI sur la liste : loading, erreur, vide ("Aucune facture"), contenu

**Edge Cases**
- Référence déjà existante → erreur inline "Cette référence existe déjà"
- `due_date` avant `invoice_date` → validation front bloque avec message

**Technical Notes**
- Insert : `supabase.from('invoices').insert({ ..., created_by: auth.uid() })`
- Composable : `useInvoices.ts` avec `useState('invoices', () => [])`

---

### F40 — Upload et téléchargement PDF

**Priority:** Must  
**Complexity:** Medium  
**Personas:** admin  
**Depends on:** F39, RFC-017 (Supabase Storage bucket `invoices`)

**Description**  
L'admin peut attacher un PDF à une fiche facture et le retrouver via URL signée.

**Acceptance Criteria**
- [ ] Sur chaque ligne de la liste (ou dans un panneau de détail) : zone upload fichier acceptant uniquement `application/pdf`
- [ ] Spinner affiché pendant l'upload
- [ ] Toast succès "PDF enregistré" après upload réussi
- [ ] Toast erreur persistant si l'upload échoue (mauvais type ou erreur réseau)
- [ ] Bouton "Voir PDF" visible uniquement si `pdf_path` est renseigné
- [ ] Clic sur "Voir PDF" → génère une URL signée valable 60 secondes et l'ouvre dans un nouvel onglet
- [ ] Chemin storage : `invoices/{invoice_id}/{filename}` dans le bucket privé `invoices`
- [ ] Après upload, `invoices.pdf_path` est mis à jour en DB

**Edge Cases**
- Fichier > 10 Mo → Supabase Storage retourne une erreur → toast erreur
- Upload d'un deuxième PDF → écrase l'ancien `pdf_path` (pas de versioning)
- URL signée expirée → l'utilisateur doit cliquer à nouveau pour une nouvelle URL

**Technical Notes**
- Upload : `supabase.storage.from('invoices').upload(\`${invoiceId}/${file.name}\`, file, { contentType: 'application/pdf', upsert: true })`
- Signed URL : `supabase.storage.from('invoices').createSignedUrl(path, 60)`
- Update DB : `.from('invoices').update({ pdf_path: path }).eq('id', invoiceId)`

---

### F41 — Gestion du statut facture + filtre

**Priority:** Must  
**Complexity:** Low  
**Personas:** admin  
**Depends on:** F39

**Description**  
L'admin change le statut d'une facture et peut filtrer la liste par statut.

**Acceptance Criteria**
- [ ] Trois statuts : `en_attente` (badge gris) · `envoyee` (badge bleu) · `payee` (badge vert)
- [ ] Changement de statut depuis la liste : select ou boutons d'action inline
- [ ] Changement de statut sauvegardé via `.update({ status }).eq('id', id)` + toast succès
- [ ] Filtre client-side par statut : "Tous" · "En attente" · "Envoyée" · "Payée"
- [ ] Le filtre ne déclenche pas de nouvel appel API
- [ ] Employee et manager n'ont aucun accès à `/invoices` (403)

**Edge Cases**
- Changement de statut échoue (erreur réseau) → toast erreur, valeur précédente restaurée dans l'UI

**Technical Notes**
- Badges : `en_attente` → `bg-gray-100 text-gray-700` ; `envoyee` → `bg-blue-100 text-blue-700` ; `payee` → `bg-green-100 text-green-700`
- État filtre : `ref<'all' | 'en_attente' | 'envoyee' | 'payee'>` — `computed` filtrant le tableau

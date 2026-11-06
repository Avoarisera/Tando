-- TND-32 — e-mails of the review notifications, libraries of templates
-- (reviews: one more default; recruitment: job opening templates).

-- ── E-mails of in-app notifications (sent once, by the server) ──────────────
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_to_email_idx ON public.notifications (created_at) WHERE emailed_at IS NULL;

-- trigger functions are never meant to be called through the API
REVOKE EXECUTE ON FUNCTION public.log_scorecard_submitted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_review_packet() FROM PUBLIC, anon, authenticated;

-- ── Reviews: one more ready-made template ───────────────────────────────────
INSERT INTO public.review_templates (name, kind, content)
SELECT 'Point d’étape de mi-année', 'custom', '{
  "objectives": true,
  "competencies": [
    {"id": "quality", "label": "Qualité du travail", "levels": ["Le travail rendu demande souvent d’être repris.", "Travail correct, avec des reprises régulières sur les détails.", "Travail fiable et soigné, rarement repris.", "Référence de qualité : anticipe les problèmes et élève le niveau de l’équipe."]},
    {"id": "reliability", "label": "Fiabilité et respect des engagements", "levels": ["Les délais annoncés sont souvent dépassés sans prévenir.", "Tient la plupart des engagements, prévient parfois tard.", "Tient ses engagements et alerte tôt quand un risque apparaît.", "Toujours prévisible ; aide les autres à tenir les leurs."]},
    {"id": "collaboration", "label": "Collaboration", "levels": ["Travaille surtout seul, partage peu.", "Collabore quand on le sollicite.", "Partage spontanément, aide ses collègues, accepte les retours.", "Fait progresser le collectif ; résout les tensions avec tact."]}
  ],
  "questions": [
    {"id": "going", "label": "Qu’est-ce qui avance bien depuis le début de l’année ? (un exemple)", "roles": ["self", "manager"]},
    {"id": "blockers", "label": "Qu’est-ce qui freine, et de quoi avez-vous besoin pour la suite ?", "roles": ["self"]},
    {"id": "adjust", "label": "Quels ajustements pour le second semestre ?", "roles": ["manager"]}
  ],
  "peer": {"competencies": ["collaboration"], "questions": [{"id": "keep", "label": "Qu’est-ce que cette personne fait très bien et doit continuer ? (un exemple)"}]}
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.review_templates WHERE name = 'Point d’étape de mi-année');

-- ── Recruitment: job opening templates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  -- same fields as an opening (title, location, contract_type, remote, salary_*, summary,
  -- missions, profile, benefits, process_steps, questions, cover_letter, criteria, anonymous_screening)
  content    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  archived   boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_templates_creator_idx ON public.job_templates (created_by);
ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_templates_recruiter ON public.job_templates FOR ALL TO authenticated
  USING ((SELECT public.is_recruiter())) WITH CHECK ((SELECT public.is_recruiter()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_templates TO authenticated;
DROP TRIGGER IF EXISTS job_templates_touch ON public.job_templates;
CREATE TRIGGER job_templates_touch BEFORE UPDATE ON public.job_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.job_templates (name, content)
SELECT v.name, v.content::jsonb FROM (VALUES
('Développeur·se full-stack', '{
  "title": "Développeur·se full-stack", "contract_type": "cdi", "remote": "hybrid", "salary_period": "year",
  "summary": "Rejoignez l’équipe produit pour concevoir et faire évoluer nos applications web, du besoin jusqu’à la mise en production.",
  "missions": "- Concevoir et développer de nouvelles fonctionnalités, côté interface et côté serveur\n- Écrire du code testé, lisible et maintenable\n- Participer aux revues de code et aux choix techniques\n- Travailler avec le produit et le design pour livrer en petites itérations\n- Surveiller la qualité en production et corriger les incidents",
  "profile": "- 3 ans d’expérience ou plus en développement web\n- Bonne maîtrise de TypeScript, d’un framework front (Vue, React) et d’une base SQL\n- Goût pour les tests et la qualité\n- Communication claire, à l’écrit comme à l’oral",
  "benefits": "- Télétravail partiel\n- Matériel au choix\n- Budget formation annuel\n- Mutuelle prise en charge",
  "process_steps": ["Échange RH", "Entretien technique", "Rencontre équipe"],
  "questions": [{"id": "q1", "label": "Parlez-nous d’un projet technique dont vous êtes fier·e (lien bienvenu).", "required": false}],
  "cover_letter": "optional",
  "criteria": [{"id": "c1", "label": "Compétences techniques"}, {"id": "c2", "label": "Qualité et tests"}, {"id": "c3", "label": "Communication"}, {"id": "c4", "label": "Motivation pour le poste"}],
  "anonymous_screening": false}'),
('Commercial·e B2B', '{
  "title": "Commercial·e B2B", "contract_type": "cdi", "remote": "hybrid", "salary_period": "year",
  "summary": "Développez notre portefeuille de clients professionnels, de la prospection à la signature.",
  "missions": "- Identifier et prospecter de nouveaux clients\n- Mener les rendez-vous de découverte et les démonstrations\n- Construire les propositions commerciales et négocier\n- Suivre votre pipeline dans le CRM\n- Faire remonter les besoins clients aux équipes produit",
  "profile": "- 2 ans d’expérience ou plus en vente B2B\n- Aisance relationnelle et sens de l’écoute\n- Rigueur dans le suivi\n- Autonomie et goût des objectifs",
  "benefits": "- Variable sur objectifs\n- Télétravail partiel\n- Mutuelle prise en charge",
  "process_steps": ["Échange RH", "Mise en situation commerciale", "Rencontre équipe"],
  "questions": [{"id": "q1", "label": "Quelle a été votre plus belle signature, et comment l’avez-vous obtenue ?", "required": true}],
  "cover_letter": "optional",
  "criteria": [{"id": "c1", "label": "Prospection et négociation"}, {"id": "c2", "label": "Écoute du client"}, {"id": "c3", "label": "Rigueur du suivi"}, {"id": "c4", "label": "Motivation pour le poste"}],
  "anonymous_screening": false}'),
('Chef·fe de projet', '{
  "title": "Chef·fe de projet", "contract_type": "cdi", "remote": "hybrid", "salary_period": "year",
  "summary": "Pilotez nos projets clients de bout en bout : cadrage, planning, budget et satisfaction.",
  "missions": "- Cadrer les besoins avec les clients et rédiger les spécifications\n- Construire et suivre le planning et le budget\n- Coordonner les équipes internes et les partenaires\n- Animer les comités de suivi et anticiper les risques\n- Garantir la qualité des livrables",
  "profile": "- 3 ans d’expérience ou plus en gestion de projet\n- Organisation et sens des priorités\n- Excellente communication écrite et orale\n- Connaissance des méthodes agiles appréciée",
  "benefits": "- Télétravail partiel\n- Budget formation annuel\n- Mutuelle prise en charge",
  "process_steps": ["Échange RH", "Étude de cas", "Rencontre équipe"],
  "questions": [],
  "cover_letter": "optional",
  "criteria": [{"id": "c1", "label": "Organisation et pilotage"}, {"id": "c2", "label": "Communication"}, {"id": "c3", "label": "Gestion des risques"}, {"id": "c4", "label": "Motivation pour le poste"}],
  "anonymous_screening": false}'),
('Stage / alternance', '{
  "title": "Stage / alternance", "contract_type": "internship", "remote": "on_site", "salary_period": "month",
  "summary": "Apprenez à nos côtés sur des missions concrètes, accompagné·e d’un tuteur ou d’une tutrice.",
  "missions": "- Participer aux projets de l’équipe\n- Prendre en charge des missions à votre mesure, de plus en plus autonomes\n- Présenter votre travail lors des points d’équipe",
  "profile": "- Étudiant·e en formation dans le domaine du poste\n- Curiosité et envie d’apprendre\n- Rigueur et sens de l’organisation",
  "benefits": "- Tutorat dédié\n- Gratification selon la réglementation\n- Tickets restaurant",
  "process_steps": ["Échange RH", "Rencontre avec le tuteur"],
  "questions": [{"id": "q1", "label": "Dates de début et de fin souhaitées, et rythme si alternance", "required": true}],
  "cover_letter": "required",
  "criteria": [{"id": "c1", "label": "Motivation"}, {"id": "c2", "label": "Capacité à apprendre"}, {"id": "c3", "label": "Communication"}],
  "anonymous_screening": false}')
) AS v(name, content)
WHERE NOT EXISTS (SELECT 1 FROM public.job_templates);

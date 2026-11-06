-- TND-29 (lot 1) — Performance reviews: templates, campaigns, one packet per
-- person (self review, manager review, HR conclusion), release to the employee,
-- acknowledgement with comment. HR = admin or HR access (is_recruiter()).
--
-- Confidentiality by construction:
--   * packets are read through my_review_packets() — the HR conclusion only once shared;
--   * the manager sees the self review only after submitting their own;
--   * the employee sees nothing of the manager / HR until the packet is shared.

CREATE OR REPLACE FUNCTION public.is_hr()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_recruiter() $$;
REVOKE EXECUTE ON FUNCTION public.is_hr() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_hr() TO authenticated;

-- ── Templates ───────────────────────────────────────────────────────────────
-- content: {"competencies": [{"id","label","levels":[4 behaviours]}],
--           "questions": [{"id","label","roles":["self","manager"]}], "objectives": true}
CREATE TABLE IF NOT EXISTS public.review_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  kind       text NOT NULL DEFAULT 'annual' CHECK (kind IN ('annual', 'probation', 'custom')),
  content    jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  archived   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_templates ENABLE ROW LEVEL SECURITY;

-- ── Campaigns ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_cycles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  template_id  uuid NOT NULL REFERENCES public.review_templates(id),
  -- the template is copied at launch: later edits never change a running campaign
  content      jsonb,
  self_due     date,
  manager_due  date,
  hr_due       date,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  launched_at  timestamptz,
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS review_cycles_template_idx ON public.review_cycles (template_id);
CREATE INDEX IF NOT EXISTS review_cycles_creator_idx ON public.review_cycles (created_by);
ALTER TABLE public.review_cycles ENABLE ROW LEVEL SECURITY;

-- ── Packets (one per person and campaign) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_packets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- manager at launch (null: no manager, HR concludes directly)
  manager_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hr_rating       smallint CHECK (hr_rating BETWEEN 1 AND 4),
  hr_strengths    text NOT NULL DEFAULT '' CHECK (char_length(hr_strengths) <= 4000),
  hr_improvements text NOT NULL DEFAULT '' CHECK (char_length(hr_improvements) <= 4000),
  hr_objectives   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hr_objectives) = 'array'),
  hr_author_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hr_done_at      timestamptz,
  shared_at       timestamptz,
  acknowledged_at timestamptz,
  employee_comment text CHECK (employee_comment IS NULL OR char_length(employee_comment) <= 4000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
CREATE INDEX IF NOT EXISTS review_packets_employee_idx ON public.review_packets (employee_id);
CREATE INDEX IF NOT EXISTS review_packets_manager_idx ON public.review_packets (manager_id);
CREATE INDEX IF NOT EXISTS review_packets_hr_idx ON public.review_packets (hr_author_id);
ALTER TABLE public.review_packets ENABLE ROW LEVEL SECURITY;

-- ── Responses (self, manager; peers in lot 2) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id   uuid NOT NULL REFERENCES public.review_packets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('self', 'manager')),
  -- {"c1": 3, "c2": 0}  (0 = « je ne peux pas me prononcer »)
  ratings     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ratings) = 'object'),
  comments    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(comments) = 'object'),
  answers     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  -- [{"text": "...", "status": "met"|"partial"|"missed", "comment": "..."}]
  objectives  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objectives) = 'array'),
  submitted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (packet_id, role)
);
CREATE INDEX IF NOT EXISTS review_responses_author_idx ON public.review_responses (author_id);
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS review_responses_touch ON public.review_responses;
CREATE TRIGGER review_responses_touch BEFORE UPDATE ON public.review_responses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Helpers (security definer: policies must not query RLS tables recursively) ──
CREATE OR REPLACE FUNCTION public.review_packet_role(p_packet uuid)
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN p.employee_id = auth.uid() THEN 'self' WHEN p.manager_id = auth.uid() THEN 'manager' END
  FROM review_packets p JOIN review_cycles c ON c.id = p.cycle_id
  -- writing is only possible while the campaign runs and before the packet is shared
  WHERE p.id = p_packet AND c.status = 'active' AND p.shared_at IS NULL
$$;
CREATE OR REPLACE FUNCTION public.review_can_read_response(p_packet uuid, p_role text, p_author uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_author = auth.uid()
      OR public.is_hr()
      OR EXISTS (
        SELECT 1 FROM review_packets p WHERE p.id = p_packet AND (
          -- shared: the employee and the manager read everything
          (p.shared_at IS NOT NULL AND (p.employee_id = auth.uid() OR p.manager_id = auth.uid()))
          -- the manager reads the self review once their own review is submitted
          OR (p_role = 'self' AND p.manager_id = auth.uid() AND EXISTS (
                SELECT 1 FROM review_responses m WHERE m.packet_id = p.id AND m.role = 'manager' AND m.submitted_at IS NOT NULL))))
$$;
REVOKE EXECUTE ON FUNCTION public.review_packet_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_can_read_response(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_packet_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_can_read_response(uuid, text, uuid) TO authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────
CREATE POLICY review_templates_read ON public.review_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY review_templates_write ON public.review_templates FOR ALL TO authenticated
  USING ((SELECT public.is_hr())) WITH CHECK ((SELECT public.is_hr()));

CREATE POLICY review_cycles_hr ON public.review_cycles FOR ALL TO authenticated
  USING ((SELECT public.is_hr())) WITH CHECK ((SELECT public.is_hr()));
CREATE POLICY review_cycles_participant ON public.review_cycles FOR SELECT TO authenticated
  USING (status <> 'draft' AND EXISTS (SELECT 1 FROM review_packets p WHERE p.cycle_id = review_cycles.id AND (p.employee_id = (SELECT auth.uid()) OR p.manager_id = (SELECT auth.uid()))));

-- packets: HR only in direct; everyone else goes through my_review_packets()
CREATE POLICY review_packets_hr ON public.review_packets FOR SELECT TO authenticated USING ((SELECT public.is_hr()));

CREATE POLICY review_responses_read ON public.review_responses FOR SELECT TO authenticated
  USING (public.review_can_read_response(packet_id, role, author_id));
CREATE POLICY review_responses_insert ON public.review_responses FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND role = public.review_packet_role(packet_id));
CREATE POLICY review_responses_update ON public.review_responses FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) AND submitted_at IS NULL)
  WITH CHECK (author_id = (SELECT auth.uid()) AND role = public.review_packet_role(packet_id));

GRANT SELECT, INSERT, UPDATE ON public.review_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_cycles TO authenticated;
GRANT SELECT ON public.review_packets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.review_responses TO authenticated;

-- ── What a participant sees of their packets ────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_review_packets()
  RETURNS TABLE (id uuid, cycle_id uuid, cycle_name text, period_start date, period_end date, cycle_status text,
                 self_due date, manager_due date, content jsonb, employee_id uuid, employee_name text,
                 manager_id uuid, manager_name text, my_role text, self_submitted boolean, manager_submitted boolean,
                 shared_at timestamptz, acknowledged_at timestamptz, employee_comment text,
                 hr_rating smallint, hr_strengths text, hr_improvements text, hr_objectives jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, c.id, c.name, c.period_start, c.period_end, c.status, c.self_due, c.manager_due, c.content,
         p.employee_id, e.first_name || ' ' || e.last_name, p.manager_id, m.first_name || ' ' || m.last_name,
         CASE WHEN p.employee_id = auth.uid() THEN 'self' ELSE 'manager' END,
         EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'self' AND r.submitted_at IS NOT NULL),
         EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'manager' AND r.submitted_at IS NOT NULL),
         p.shared_at, p.acknowledged_at, p.employee_comment,
         -- the HR conclusion only once the packet is shared
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_rating END,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_strengths ELSE '' END,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_improvements ELSE '' END,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_objectives ELSE '[]'::jsonb END
  FROM review_packets p
  JOIN review_cycles c ON c.id = p.cycle_id AND c.status <> 'draft'
  JOIN profiles e ON e.id = p.employee_id
  LEFT JOIN profiles m ON m.id = p.manager_id
  WHERE p.employee_id = auth.uid() OR p.manager_id = auth.uid()
  ORDER BY c.period_end DESC, e.last_name
$$;
REVOKE EXECUTE ON FUNCTION public.my_review_packets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_review_packets() TO authenticated;

-- ── Lifecycle RPCs ──────────────────────────────────────────────────────────
-- Launch: copies the template, creates one packet per person with their team manager
CREATE OR REPLACE FUNCTION public.launch_review_cycle(p_cycle uuid, p_people uuid[])
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_cycle review_cycles; v_n integer := 0; v_person uuid; v_mgr uuid;
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_cycle FROM review_cycles WHERE id = p_cycle FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campagne introuvable'; END IF;
  IF v_cycle.status <> 'draft' THEN RAISE EXCEPTION 'Campagne déjà lancée'; END IF;
  IF coalesce(cardinality(p_people), 0) = 0 THEN RAISE EXCEPTION 'Choisissez au moins une personne'; END IF;
  FOREACH v_person IN ARRAY p_people LOOP
    SELECT m.id INTO v_mgr FROM profiles e JOIN profiles m ON m.team_id = e.team_id AND m.role = 'manager' AND m.id <> e.id
      WHERE e.id = v_person ORDER BY m.joined_at LIMIT 1;
    INSERT INTO review_packets (cycle_id, employee_id, manager_id) VALUES (p_cycle, v_person, v_mgr) ON CONFLICT DO NOTHING;
    IF FOUND THEN v_n := v_n + 1; END IF;
    v_mgr := NULL;
  END LOOP;
  UPDATE review_cycles SET status = 'active', launched_at = now(),
    content = (SELECT content FROM review_templates WHERE id = v_cycle.template_id) WHERE id = p_cycle;
  RETURN v_n;
END;
$$;

-- HR conclusion (draft-able until shared)
CREATE OR REPLACE FUNCTION public.hr_conclude_review(p_packet uuid, p_rating smallint, p_strengths text, p_improvements text, p_objectives jsonb)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF p_rating IS NOT NULL AND p_rating NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Appréciation invalide'; END IF;
  UPDATE review_packets SET hr_rating = p_rating, hr_strengths = left(coalesce(p_strengths, ''), 4000),
    hr_improvements = left(coalesce(p_improvements, ''), 4000), hr_objectives = coalesce(p_objectives, '[]'::jsonb),
    hr_author_id = auth.uid(), hr_done_at = now()
  WHERE id = p_packet AND shared_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dossier introuvable ou déjà partagé'; END IF;
END;
$$;

-- Release to the employee (needs the HR conclusion)
CREATE OR REPLACE FUNCTION public.share_review(p_packet uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  UPDATE review_packets SET shared_at = now() WHERE id = p_packet AND shared_at IS NULL AND hr_done_at IS NOT NULL AND hr_rating IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rédigez la conclusion RH avant de partager'; END IF;
END;
$$;

-- The employee acknowledges (« pris connaissance », not « d'accord ») with an optional comment
CREATE OR REPLACE FUNCTION public.acknowledge_review(p_packet uuid, p_comment text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE review_packets SET acknowledged_at = now(), employee_comment = nullif(left(trim(coalesce(p_comment, '')), 4000), '')
  WHERE id = p_packet AND employee_id = auth.uid() AND shared_at IS NOT NULL AND acknowledged_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dossier introuvable ou déjà signé'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.launch_review_cycle(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_conclude_review(uuid, smallint, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.share_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.acknowledge_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.launch_review_cycle(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_conclude_review(uuid, smallint, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_review(uuid, text) TO authenticated;

-- ── Notifications ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'request_submitted', 'manager_approved', 'approved', 'rejected',
  'cancel_requested', 'cancel_approved', 'cancel_refused', 'application_received', 'interview_scheduled',
  'review_requested', 'review_shared'));

CREATE OR REPLACE FUNCTION public.notify_review_packet()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_cycle text; v_emp text;
BEGIN
  SELECT name INTO v_cycle FROM review_cycles WHERE id = NEW.cycle_id;
  SELECT first_name || ' ' || last_name INTO v_emp FROM profiles WHERE id = NEW.employee_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (user_id, kind, data) VALUES (NEW.employee_id, 'review_requested', jsonb_build_object('cycle', v_cycle, 'packet_id', NEW.id, 'role', 'self'));
    IF NEW.manager_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, kind, data) VALUES (NEW.manager_id, 'review_requested', jsonb_build_object('cycle', v_cycle, 'packet_id', NEW.id, 'role', 'manager', 'who', v_emp));
    END IF;
  ELSIF NEW.shared_at IS NOT NULL AND OLD.shared_at IS NULL THEN
    INSERT INTO notifications (user_id, kind, data) VALUES (NEW.employee_id, 'review_shared', jsonb_build_object('cycle', v_cycle, 'packet_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS review_packets_notify ON public.review_packets;
CREATE TRIGGER review_packets_notify AFTER INSERT OR UPDATE OF shared_at ON public.review_packets
  FOR EACH ROW EXECUTE FUNCTION public.notify_review_packet();

-- ── Default template « Revue annuelle » (behaviourally anchored, 4 levels) ───
INSERT INTO public.review_templates (name, kind, content) VALUES ('Revue annuelle', 'annual', '{
  "objectives": true,
  "competencies": [
    {"id": "quality", "label": "Qualité du travail", "levels": ["Le travail rendu demande souvent d’être repris.", "Travail correct, avec des reprises régulières sur les détails.", "Travail fiable et soigné, rarement repris.", "Référence de qualité : anticipe les problèmes et élève le niveau de l’équipe."]},
    {"id": "reliability", "label": "Fiabilité et respect des engagements", "levels": ["Les délais annoncés sont souvent dépassés sans prévenir.", "Tient la plupart des engagements, prévient parfois tard.", "Tient ses engagements et alerte tôt quand un risque apparaît.", "Toujours prévisible ; aide les autres à tenir les leurs."]},
    {"id": "collaboration", "label": "Collaboration", "levels": ["Travaille surtout seul, partage peu.", "Collabore quand on le sollicite.", "Partage spontanément, aide ses collègues, accepte les retours.", "Fait progresser le collectif ; résout les tensions avec tact."]},
    {"id": "communication", "label": "Communication", "levels": ["Messages souvent flous ou incomplets.", "Clair à l’oral ou à l’écrit, mais pas toujours les deux.", "Clair, concis, adapté à son interlocuteur.", "Explique simplement des sujets complexes ; écoute active remarquable."]},
    {"id": "autonomy", "label": "Autonomie et initiative", "levels": ["A besoin d’être guidé sur les tâches courantes.", "Autonome sur son périmètre habituel.", "Prend des initiatives utiles et sait quand demander de l’aide.", "Identifie et lance des améliorations au-delà de son périmètre."]},
    {"id": "learning", "label": "Apprentissage et progression", "levels": ["Peu de progression sur la période.", "Progresse sur ce qui est demandé.", "Cherche à apprendre, applique rapidement les retours.", "Apprend vite et transmet ce qu’il apprend."]}
  ],
  "questions": [
    {"id": "proud", "label": "De quelle réalisation de la période êtes-vous le plus fier ? Donnez un exemple concret.", "roles": ["self"]},
    {"id": "strengths", "label": "Quels sont les points forts observés sur la période ? (exemples)", "roles": ["manager"]},
    {"id": "improve", "label": "Sur quoi progresser en priorité ?", "roles": ["self", "manager"]},
    {"id": "support", "label": "De quoi avez-vous besoin (formation, outils, accompagnement) ?", "roles": ["self"]}
  ]
}'::jsonb), ('Revue de fin de période d’essai', 'probation', '{
  "objectives": false,
  "competencies": [
    {"id": "quality", "label": "Qualité du travail", "levels": ["En dessous des attentes du poste.", "Proche des attentes, à consolider.", "Conforme aux attentes du poste.", "Au-delà des attentes du poste."]},
    {"id": "integration", "label": "Intégration dans l’équipe", "levels": ["Intégration difficile.", "Intégration en cours.", "Bien intégré, collabore naturellement.", "Moteur dans l’équipe dès ses débuts."]},
    {"id": "autonomy", "label": "Autonomie", "levels": ["Très dépendant de l’accompagnement.", "Autonome sur les tâches simples.", "Autonome sur l’essentiel du poste.", "Pleinement autonome, propose des améliorations."]}
  ],
  "questions": [
    {"id": "feeling", "label": "Comment vivez-vous ces premiers mois ?", "roles": ["self"]},
    {"id": "decision", "label": "Recommandation pour la suite (confirmation, prolongation…) et pourquoi", "roles": ["manager"]}
  ]
}'::jsonb);

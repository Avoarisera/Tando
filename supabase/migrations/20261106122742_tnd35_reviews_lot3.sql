-- TND-35 — Reviews lot 3: calibration (adjusted ratings with a logged reason),
-- team reports, « entretien professionnel » (no rating, 2- and 6-year schedule),
-- and what the automatic reminders need.

-- ── Calibration log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_calibrations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id   uuid NOT NULL REFERENCES public.review_packets(id) ON DELETE CASCADE,
  from_rating smallint CHECK (from_rating BETWEEN 1 AND 4),
  to_rating   smallint NOT NULL CHECK (to_rating BETWEEN 1 AND 4),
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  author_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_calibrations_packet_idx ON public.review_calibrations (packet_id, created_at);
CREATE INDEX IF NOT EXISTS review_calibrations_author_idx ON public.review_calibrations (author_id);
ALTER TABLE public.review_calibrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_calibrations_hr ON public.review_calibrations FOR SELECT TO authenticated USING ((SELECT public.is_hr()));
GRANT SELECT ON public.review_calibrations TO authenticated;

-- adjust the HR rating before release; the reason is mandatory and kept
CREATE OR REPLACE FUNCTION public.calibrate_review(p_packet uuid, p_rating smallint, p_reason text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_p review_packets;
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Appréciation invalide'; END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'Justifiez l’ajustement (10 caractères au moins)'; END IF;
  SELECT * INTO v_p FROM review_packets WHERE id = p_packet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  IF v_p.shared_at IS NOT NULL THEN RAISE EXCEPTION 'Dossier déjà partagé : l’appréciation ne change plus'; END IF;
  IF v_p.hr_rating IS NOT DISTINCT FROM p_rating THEN RAISE EXCEPTION 'L’appréciation est déjà celle-ci'; END IF;
  INSERT INTO review_calibrations (packet_id, from_rating, to_rating, reason, author_id)
  VALUES (p_packet, v_p.hr_rating, p_rating, left(trim(p_reason), 1000), auth.uid());
  UPDATE review_packets SET hr_rating = p_rating, hr_author_id = auth.uid(), hr_done_at = coalesce(hr_done_at, now()) WHERE id = p_packet;
END;
$$;

-- per packet: averages of self, manager and (from 3 answers) peers, HR rating, adjustments
CREATE OR REPLACE FUNCTION public.cycle_calibration(p_cycle uuid)
  RETURNS TABLE (packet_id uuid, employee_name text, team_name text, manager_name text,
                 self_avg numeric, manager_avg numeric, peer_avg numeric, peer_count integer,
                 hr_rating smallint, shared boolean, adjustments integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH r AS (
    SELECT rr.packet_id, rr.role, (kv.value)::numeric AS v
    FROM review_responses rr JOIN review_packets p ON p.id = rr.packet_id AND p.cycle_id = p_cycle,
         jsonb_each_text(rr.ratings) kv
    WHERE rr.submitted_at IS NOT NULL AND kv.value ~ '^[1-4]$'
  ), pc AS (
    SELECT rr.packet_id, count(*)::int AS n FROM review_responses rr JOIN review_packets p ON p.id = rr.packet_id AND p.cycle_id = p_cycle
    WHERE rr.role = 'peer' AND rr.submitted_at IS NOT NULL GROUP BY rr.packet_id
  )
  SELECT p.id, e.first_name || ' ' || e.last_name, t.name, m.first_name || ' ' || m.last_name,
         (SELECT round(avg(v), 1) FROM r WHERE r.packet_id = p.id AND r.role = 'self'),
         (SELECT round(avg(v), 1) FROM r WHERE r.packet_id = p.id AND r.role = 'manager'),
         CASE WHEN coalesce(pc.n, 0) >= 3 THEN (SELECT round(avg(v), 1) FROM r WHERE r.packet_id = p.id AND r.role = 'peer') END,
         coalesce(pc.n, 0), p.hr_rating, p.shared_at IS NOT NULL,
         (SELECT count(*)::int FROM review_calibrations c WHERE c.packet_id = p.id)
  FROM review_packets p
  JOIN profiles e ON e.id = p.employee_id
  LEFT JOIN teams t ON t.id = e.team_id
  LEFT JOIN profiles m ON m.id = p.manager_id
  LEFT JOIN pc ON pc.packet_id = p.id
  WHERE p.cycle_id = p_cycle AND public.is_hr()
  ORDER BY t.name NULLS LAST, e.last_name
$$;

-- per team: participation and (from 3 people) average manager rating per competency + HR rating
CREATE OR REPLACE FUNCTION public.cycle_team_report(p_cycle uuid)
  RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (
    SELECT pk.*, e.team_id FROM review_packets pk JOIN profiles e ON e.id = pk.employee_id
    WHERE pk.cycle_id = p_cycle AND public.is_hr()
  ), g AS (
    SELECT coalesce(t.name, '—') AS team, p.team_id, count(*)::int AS n,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'self' AND r.submitted_at IS NOT NULL))::int AS self_done,
      count(*) FILTER (WHERE p.manager_id IS NOT NULL)::int AS with_manager,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'manager' AND r.submitted_at IS NOT NULL))::int AS manager_done,
      (SELECT count(*)::int FROM review_nominations n JOIN p p2 ON p2.id = n.packet_id WHERE p2.team_id IS NOT DISTINCT FROM p.team_id AND n.status = 'approved') AS peers_chosen,
      (SELECT count(*)::int FROM review_responses r JOIN p p2 ON p2.id = r.packet_id WHERE p2.team_id IS NOT DISTINCT FROM p.team_id AND r.role = 'peer' AND r.submitted_at IS NOT NULL) AS peers_answered,
      count(*) FILTER (WHERE p.hr_done_at IS NOT NULL)::int AS hr_done,
      count(*) FILTER (WHERE p.shared_at IS NOT NULL)::int AS shared,
      count(*) FILTER (WHERE p.acknowledged_at IS NOT NULL)::int AS acknowledged
    FROM p LEFT JOIN teams t ON t.id = p.team_id
    GROUP BY t.name, p.team_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'team', g.team, 'n', g.n, 'self_done', g.self_done, 'with_manager', g.with_manager, 'manager_done', g.manager_done,
    'peers_chosen', g.peers_chosen, 'peers_answered', g.peers_answered, 'hr_done', g.hr_done, 'shared', g.shared, 'acknowledged', g.acknowledged,
    'small', g.n < 3,
    'competencies', CASE WHEN g.n >= 3 THEN (
      SELECT coalesce(jsonb_object_agg(k, a), '{}'::jsonb) FROM (
        SELECT kv.key AS k, round(avg(kv.value::numeric), 1) AS a
        FROM review_responses r JOIN p p2 ON p2.id = r.packet_id, jsonb_each_text(r.ratings) kv
        WHERE p2.team_id IS NOT DISTINCT FROM g.team_id AND r.role = 'manager' AND r.submitted_at IS NOT NULL AND kv.value ~ '^[1-4]$'
        GROUP BY kv.key) s) END,
    'hr_avg', CASE WHEN g.n >= 3 THEN (SELECT round(avg(p2.hr_rating), 1) FROM p p2 WHERE p2.team_id IS NOT DISTINCT FROM g.team_id AND p2.hr_rating IS NOT NULL) END,
    'hr_dist', CASE WHEN g.n >= 3 THEN (SELECT jsonb_build_array(
        count(*) FILTER (WHERE p2.hr_rating = 1), count(*) FILTER (WHERE p2.hr_rating = 2),
        count(*) FILTER (WHERE p2.hr_rating = 3), count(*) FILTER (WHERE p2.hr_rating = 4)) FROM p p2 WHERE p2.team_id IS NOT DISTINCT FROM g.team_id) END
  ) ORDER BY g.team), '[]'::jsonb)
  FROM g
$$;

-- ── Entretien professionnel (no rating) ─────────────────────────────────────
ALTER TABLE public.review_templates DROP CONSTRAINT IF EXISTS review_templates_kind_check;
ALTER TABLE public.review_templates ADD CONSTRAINT review_templates_kind_check CHECK (kind IN ('annual', 'probation', 'custom', 'professional'));

-- release without a rating when the template has none (content.no_rating)
CREATE OR REPLACE FUNCTION public.share_review(p_packet uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  UPDATE review_packets p SET shared_at = now()
  FROM review_cycles c
  WHERE p.id = p_packet AND c.id = p.cycle_id AND p.shared_at IS NULL AND p.hr_done_at IS NOT NULL
    AND (p.hr_rating IS NOT NULL OR coalesce(c.content->>'no_rating', 'false') = 'true');
  IF NOT FOUND THEN RAISE EXCEPTION 'Rédigez la conclusion RH avant de partager'; END IF;
END;
$$;

-- last professional interview / 6-year review per person (HR): dates are computed in the app
CREATE OR REPLACE FUNCTION public.professional_review_status()
  RETURNS TABLE (id uuid, name text, team_name text, joined_at date, last_ep date, last_bilan date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pr.id, pr.first_name || ' ' || pr.last_name, t.name, pr.joined_at,
    (SELECT max(p.shared_at)::date FROM review_packets p JOIN review_cycles c ON c.id = p.cycle_id
       WHERE p.employee_id = pr.id AND p.shared_at IS NOT NULL AND coalesce(c.content->>'professional', 'false') = 'true'),
    (SELECT max(p.shared_at)::date FROM review_packets p JOIN review_cycles c ON c.id = p.cycle_id
       WHERE p.employee_id = pr.id AND p.shared_at IS NOT NULL AND coalesce(c.content->>'bilan', 'false') = 'true')
  FROM profiles pr LEFT JOIN teams t ON t.id = pr.team_id
  WHERE pr.role <> 'admin' AND public.is_hr()
  ORDER BY pr.last_name, pr.first_name
$$;

REVOKE EXECUTE ON FUNCTION public.calibrate_review(uuid, smallint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cycle_calibration(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cycle_team_report(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.professional_review_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calibrate_review(uuid, smallint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cycle_calibration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cycle_team_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.professional_review_status() TO authenticated;

-- HR reminder of the professional interviews to plan
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'request_submitted', 'manager_approved', 'approved', 'rejected',
  'cancel_requested', 'cancel_approved', 'cancel_refused', 'application_received', 'interview_scheduled',
  'review_requested', 'review_shared', 'review_peers_proposed', 'review_peer_requested', 'review_reminder', 'review_ep_due'));

INSERT INTO public.review_templates (name, kind, content)
SELECT v.name, 'professional', v.content::jsonb FROM (VALUES
('Entretien professionnel', '{
  "objectives": false, "no_rating": true, "professional": true, "competencies": [],
  "questions": [
    {"id": "path", "label": "Votre parcours depuis le dernier entretien : missions, responsabilités, changements de poste", "roles": ["self", "manager"]},
    {"id": "skills", "label": "Compétences acquises ou développées sur la période", "roles": ["self", "manager"]},
    {"id": "trainings", "label": "Formations suivies (et ce qu’elles vous ont apporté)", "roles": ["self"]},
    {"id": "project", "label": "Votre projet professionnel à 2 ou 3 ans (évolution, mobilité, nouvelles responsabilités)", "roles": ["self"]},
    {"id": "needs", "label": "Besoins de formation ou d’accompagnement pour y parvenir (CPF, VAE, bilan de compétences…)", "roles": ["self", "manager"]},
    {"id": "support", "label": "Ce que l’entreprise peut proposer (formations, missions, mobilité)", "roles": ["manager"]}
  ]}'),
('Bilan à 6 ans (entretien professionnel)', '{
  "objectives": false, "no_rating": true, "professional": true, "bilan": true, "competencies": [],
  "questions": [
    {"id": "interviews", "label": "Entretiens professionnels réalisés sur les 6 dernières années", "roles": ["manager"]},
    {"id": "trainings", "label": "Formations suivies sur les 6 dernières années, dont au moins une non obligatoire", "roles": ["self", "manager"]},
    {"id": "certification", "label": "Éléments de certification obtenus (diplôme, titre, certificat, VAE)", "roles": ["self", "manager"]},
    {"id": "progress", "label": "Progression salariale ou professionnelle sur la période", "roles": ["self", "manager"]},
    {"id": "project", "label": "Votre projet professionnel pour les années à venir", "roles": ["self"]},
    {"id": "needs", "label": "Besoins de formation ou d’accompagnement identifiés", "roles": ["self", "manager"]}
  ]}')
) AS v(name, content)
WHERE NOT EXISTS (SELECT 1 FROM public.review_templates WHERE kind = 'professional');

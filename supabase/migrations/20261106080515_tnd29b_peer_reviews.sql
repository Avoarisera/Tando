-- TND-29 (lot 2) — Peer feedback (360°): the employee proposes 3–6 colleagues,
-- the manager (or HR) validates the list, the peers fill in a short form.
--
-- Anonymity by construction: nobody but the author reads a peer response row;
-- HR, then the employee and the manager once shared, only get an aggregate
-- (averages, shuffled comments) and only from 3 responses up (peer_feedback()).
-- HR sees who answered (to remind them), never who wrote what.

ALTER TABLE public.review_cycles
  ADD COLUMN IF NOT EXISTS peers_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peers_min smallint NOT NULL DEFAULT 3 CHECK (peers_min BETWEEN 3 AND 10),
  ADD COLUMN IF NOT EXISTS peers_max smallint NOT NULL DEFAULT 6 CHECK (peers_max BETWEEN 3 AND 12),
  ADD COLUMN IF NOT EXISTS peer_due date;

-- peer responses: one per peer and packet
ALTER TABLE public.review_responses DROP CONSTRAINT IF EXISTS review_responses_role_check;
ALTER TABLE public.review_responses ADD CONSTRAINT review_responses_role_check CHECK (role IN ('self', 'manager', 'peer'));
ALTER TABLE public.review_responses DROP CONSTRAINT IF EXISTS review_responses_packet_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS review_responses_one_self_manager ON public.review_responses (packet_id, role) WHERE role IN ('self', 'manager');
CREATE UNIQUE INDEX IF NOT EXISTS review_responses_one_per_peer ON public.review_responses (packet_id, author_id) WHERE role = 'peer';

-- ── Nominations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_nominations (
  packet_id   uuid NOT NULL REFERENCES public.review_packets(id) ON DELETE CASCADE,
  peer_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved')),
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  PRIMARY KEY (packet_id, peer_id)
);
CREATE INDEX IF NOT EXISTS review_nominations_peer_idx ON public.review_nominations (peer_id);
ALTER TABLE public.review_nominations ENABLE ROW LEVEL SECURITY;
-- the employee, their manager and HR see the list; the peer sees their own request
CREATE POLICY review_nominations_read ON public.review_nominations FOR SELECT TO authenticated USING (
  peer_id = (SELECT auth.uid()) OR (SELECT public.is_hr())
  OR EXISTS (SELECT 1 FROM review_packets p WHERE p.id = packet_id AND (p.employee_id = (SELECT auth.uid()) OR p.manager_id = (SELECT auth.uid()))));
GRANT SELECT ON public.review_nominations TO authenticated;

CREATE OR REPLACE FUNCTION public.is_approved_peer(p_packet uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM review_nominations n JOIN review_packets p ON p.id = n.packet_id JOIN review_cycles c ON c.id = p.cycle_id
                 WHERE n.packet_id = p_packet AND n.peer_id = auth.uid() AND n.status = 'approved'
                   AND c.status = 'active' AND c.peers_enabled AND p.shared_at IS NULL)
$$;
REVOKE EXECUTE ON FUNCTION public.is_approved_peer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_peer(uuid) TO authenticated;

-- peer rows: only their author reads them (everyone else gets the aggregate)
CREATE OR REPLACE FUNCTION public.review_can_read_response(p_packet uuid, p_role text, p_author uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_author = auth.uid()
      OR (p_role <> 'peer' AND (
        public.is_hr()
        OR EXISTS (
          SELECT 1 FROM review_packets p WHERE p.id = p_packet AND (
            (p.shared_at IS NOT NULL AND (p.employee_id = auth.uid() OR p.manager_id = auth.uid()))
            OR (p_role = 'self' AND p.manager_id = auth.uid() AND EXISTS (
                  SELECT 1 FROM review_responses m WHERE m.packet_id = p.id AND m.role = 'manager' AND m.submitted_at IS NOT NULL))))))
$$;

DROP POLICY IF EXISTS review_responses_insert ON public.review_responses;
CREATE POLICY review_responses_insert ON public.review_responses FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND (role = public.review_packet_role(packet_id) OR (role = 'peer' AND public.is_approved_peer(packet_id))));
DROP POLICY IF EXISTS review_responses_update ON public.review_responses;
CREATE POLICY review_responses_update ON public.review_responses FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) AND submitted_at IS NULL)
  WITH CHECK (author_id = (SELECT auth.uid()) AND (role = public.review_packet_role(packet_id) OR (role = 'peer' AND public.is_approved_peer(packet_id))));

-- ── Nomination RPCs ─────────────────────────────────────────────────────────
-- The employee proposes colleagues (replaces their current proposal)
CREATE OR REPLACE FUNCTION public.propose_peers(p_packet uuid, p_peers uuid[])
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_p review_packets; v_c review_cycles; v_peer uuid;
BEGIN
  SELECT * INTO v_p FROM review_packets WHERE id = p_packet;
  SELECT * INTO v_c FROM review_cycles WHERE id = v_p.cycle_id;
  IF v_p.employee_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT v_c.peers_enabled OR v_c.status <> 'active' OR v_p.shared_at IS NOT NULL THEN RAISE EXCEPTION 'Les retours de collègues ne sont pas ouverts'; END IF;
  IF EXISTS (SELECT 1 FROM review_nominations WHERE packet_id = p_packet AND status = 'approved') THEN RAISE EXCEPTION 'La liste est déjà validée par votre manager'; END IF;
  IF coalesce(cardinality(p_peers), 0) < v_c.peers_min OR cardinality(p_peers) > v_c.peers_max THEN
    RAISE EXCEPTION 'Proposez entre % et % collègues', v_c.peers_min, v_c.peers_max;
  END IF;
  IF auth.uid() = ANY (p_peers) OR v_p.manager_id = ANY (p_peers) THEN RAISE EXCEPTION 'Proposez des collègues (ni vous-même ni votre manager)'; END IF;
  DELETE FROM review_nominations WHERE packet_id = p_packet;
  FOREACH v_peer IN ARRAY p_peers LOOP
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_peer AND role <> 'admin') THEN RAISE EXCEPTION 'Collègue introuvable'; END IF;
    INSERT INTO review_nominations (packet_id, peer_id, proposed_by) VALUES (p_packet, v_peer, auth.uid()) ON CONFLICT DO NOTHING;
  END LOOP;
  IF v_p.manager_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, kind, actor_id, data)
    VALUES (v_p.manager_id, 'review_peers_proposed', auth.uid(), jsonb_build_object('cycle', v_c.name, 'packet_id', p_packet,
      'who', (SELECT first_name || ' ' || last_name FROM profiles WHERE id = v_p.employee_id)));
  END IF;
END;
$$;

-- The manager (or HR) validates the final list: peers get their request
CREATE OR REPLACE FUNCTION public.approve_peers(p_packet uuid, p_peers uuid[])
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_p review_packets; v_c review_cycles; v_peer uuid; v_emp text;
BEGIN
  SELECT * INTO v_p FROM review_packets WHERE id = p_packet;
  SELECT * INTO v_c FROM review_cycles WHERE id = v_p.cycle_id;
  IF NOT (v_p.manager_id = auth.uid() OR public.is_hr()) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT v_c.peers_enabled OR v_c.status <> 'active' OR v_p.shared_at IS NOT NULL THEN RAISE EXCEPTION 'Les retours de collègues ne sont pas ouverts'; END IF;
  IF coalesce(cardinality(p_peers), 0) < 3 OR cardinality(p_peers) > v_c.peers_max THEN RAISE EXCEPTION 'Validez entre 3 et % collègues (anonymat)', v_c.peers_max; END IF;
  IF v_p.employee_id = ANY (p_peers) OR v_p.manager_id = ANY (p_peers) THEN RAISE EXCEPTION 'Ni la personne évaluée ni son manager'; END IF;
  SELECT first_name || ' ' || last_name INTO v_emp FROM profiles WHERE id = v_p.employee_id;
  -- peers already approved who answered stay; the others follow the new list
  DELETE FROM review_nominations n WHERE n.packet_id = p_packet AND NOT (n.peer_id = ANY (p_peers))
    AND NOT EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p_packet AND r.author_id = n.peer_id AND r.role = 'peer');
  FOREACH v_peer IN ARRAY p_peers LOOP
    INSERT INTO review_nominations (packet_id, peer_id, status, proposed_by, decided_by, decided_at)
    VALUES (p_packet, v_peer, 'approved', auth.uid(), auth.uid(), now())
    ON CONFLICT (packet_id, peer_id) DO UPDATE SET status = 'approved', decided_by = auth.uid(), decided_at = now()
    WHERE review_nominations.status <> 'approved';
    IF FOUND THEN
      INSERT INTO notifications (user_id, kind, actor_id, data)
      VALUES (v_peer, 'review_peer_requested', auth.uid(), jsonb_build_object('cycle', v_c.name, 'packet_id', p_packet, 'who', v_emp));
    END IF;
  END LOOP;
END;
$$;

-- What a peer has to fill in (never the other answers)
CREATE OR REPLACE FUNCTION public.my_peer_requests()
  RETURNS TABLE (packet_id uuid, cycle_name text, peer_due date, employee_name text, content jsonb, submitted boolean, open boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, c.name, c.peer_due, e.first_name || ' ' || e.last_name, c.content,
         EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.author_id = auth.uid() AND r.role = 'peer' AND r.submitted_at IS NOT NULL),
         c.status = 'active' AND p.shared_at IS NULL
  FROM review_nominations n
  JOIN review_packets p ON p.id = n.packet_id
  JOIN review_cycles c ON c.id = p.cycle_id AND c.peers_enabled AND c.status <> 'draft'
  JOIN profiles e ON e.id = p.employee_id
  WHERE n.peer_id = auth.uid() AND n.status = 'approved'
  ORDER BY c.peer_due NULLS LAST, e.last_name
$$;

-- Who answered (HR, to remind): names, never the content
CREATE OR REPLACE FUNCTION public.peer_status(p_packet uuid)
  RETURNS TABLE (peer_id uuid, peer_name text, status text, answered boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT n.peer_id, pr.first_name || ' ' || pr.last_name, n.status,
         EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = n.packet_id AND r.author_id = n.peer_id AND r.role = 'peer' AND r.submitted_at IS NOT NULL)
  FROM review_nominations n JOIN profiles pr ON pr.id = n.peer_id
  WHERE n.packet_id = p_packet AND public.is_hr()
  ORDER BY pr.last_name
$$;

-- The anonymous aggregate: HR at any time; employee and manager once shared; from 3 responses
CREATE OR REPLACE FUNCTION public.peer_feedback(p_packet uuid)
  RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_p review_packets; v_n integer; v_min integer := 3; v_avg jsonb; v_comments jsonb; v_answers jsonb;
BEGIN
  SELECT * INTO v_p FROM review_packets WHERE id = p_packet;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT (public.is_hr() OR (v_p.shared_at IS NOT NULL AND (v_p.employee_id = auth.uid() OR v_p.manager_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_n FROM review_responses WHERE packet_id = p_packet AND role = 'peer' AND submitted_at IS NOT NULL;
  IF v_n < v_min THEN RETURN jsonb_build_object('count', v_n, 'min', v_min, 'shown', false); END IF;
  -- averages per competency (0 = « can't say » ignored)
  SELECT coalesce(jsonb_object_agg(k, a), '{}'::jsonb) INTO v_avg FROM (
    SELECT key AS k, round(avg(value::numeric), 1) AS a
    FROM review_responses r, jsonb_each_text(r.ratings)
    WHERE r.packet_id = p_packet AND r.role = 'peer' AND r.submitted_at IS NOT NULL AND value::numeric BETWEEN 1 AND 4
    GROUP BY key) s;
  -- comments and answers, shuffled, without any author
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_comments FROM (
    SELECT key AS k, jsonb_agg(value ORDER BY random()) AS v
    FROM review_responses r, jsonb_each_text(r.comments)
    WHERE r.packet_id = p_packet AND r.role = 'peer' AND r.submitted_at IS NOT NULL AND length(trim(value)) > 0
    GROUP BY key) s;
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_answers FROM (
    SELECT key AS k, jsonb_agg(value ORDER BY random()) AS v
    FROM review_responses r, jsonb_each_text(r.answers)
    WHERE r.packet_id = p_packet AND r.role = 'peer' AND r.submitted_at IS NOT NULL AND length(trim(value)) > 0
    GROUP BY key) s;
  RETURN jsonb_build_object('count', v_n, 'min', v_min, 'shown', true, 'averages', v_avg, 'comments', v_comments, 'answers', v_answers);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.propose_peers(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_peers(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_peer_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.peer_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.peer_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_peers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_peers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_peer_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.peer_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peer_feedback(uuid) TO authenticated;

-- ── Notifications of lot 2 ──────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'request_submitted', 'manager_approved', 'approved', 'rejected',
  'cancel_requested', 'cancel_approved', 'cancel_refused', 'application_received', 'interview_scheduled',
  'review_requested', 'review_shared', 'review_peers_proposed', 'review_peer_requested', 'review_reminder'));

-- ── Short peer form in the default templates ────────────────────────────────
-- content.peer = { "competencies": [ids asked to peers], "questions": [{id, label}] }
UPDATE public.review_templates SET content = content || '{"peer": {
  "competencies": ["reliability", "collaboration", "communication"],
  "questions": [
    {"id": "keep", "label": "Qu’est-ce que cette personne fait très bien et doit continuer ? (un exemple)"},
    {"id": "start", "label": "Qu’est-ce qui l’aiderait à être encore plus efficace avec vous ?"}
  ]}}'::jsonb
WHERE kind = 'annual' AND NOT (content ? 'peer');
UPDATE public.review_templates SET content = content || '{"peer": {
  "competencies": ["integration"],
  "questions": [{"id": "keep", "label": "Comment se passe la collaboration avec cette personne ? (un exemple)"}]}}'::jsonb
WHERE kind = 'probation' AND NOT (content ? 'peer');

-- ── Packets: expose the peer settings of the campaign ───────────────────────
DROP FUNCTION IF EXISTS public.my_review_packets();
CREATE FUNCTION public.my_review_packets()
  RETURNS TABLE (id uuid, cycle_id uuid, cycle_name text, period_start date, period_end date, cycle_status text,
                 self_due date, manager_due date, content jsonb, employee_id uuid, employee_name text,
                 manager_id uuid, manager_name text, my_role text, self_submitted boolean, manager_submitted boolean,
                 shared_at timestamptz, acknowledged_at timestamptz, employee_comment text,
                 hr_rating smallint, hr_strengths text, hr_improvements text, hr_objectives jsonb,
                 peers_enabled boolean, peers_min integer, peers_max integer, peer_due date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, c.id, c.name, c.period_start, c.period_end, c.status, c.self_due, c.manager_due, c.content,
         p.employee_id, e.first_name || ' ' || e.last_name, p.manager_id, m.first_name || ' ' || m.last_name,
         CASE WHEN p.employee_id = auth.uid() THEN 'self' ELSE 'manager' END,
         EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'self' AND r.submitted_at IS NOT NULL),
         EXISTS (SELECT 1 FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'manager' AND r.submitted_at IS NOT NULL),
         p.shared_at, p.acknowledged_at, p.employee_comment,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_rating END,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_strengths ELSE '' END,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_improvements ELSE '' END,
         CASE WHEN p.shared_at IS NOT NULL THEN p.hr_objectives ELSE '[]'::jsonb END,
         c.peers_enabled, c.peers_min, c.peers_max, c.peer_due
  FROM review_packets p
  JOIN review_cycles c ON c.id = p.cycle_id AND c.status <> 'draft'
  JOIN profiles e ON e.id = p.employee_id
  LEFT JOIN profiles m ON m.id = p.manager_id
  WHERE p.employee_id = auth.uid() OR p.manager_id = auth.uid()
  ORDER BY c.period_end DESC, e.last_name
$$;
REVOKE EXECUTE ON FUNCTION public.my_review_packets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_review_packets() TO authenticated;

-- ── People to choose from / the current list (names across teams) ───────────
-- The employee, their manager or HR only; never says who answered.
CREATE OR REPLACE FUNCTION public.review_peer_candidates(p_packet uuid)
  RETURNS TABLE (id uuid, name text, team_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pr.id, pr.first_name || ' ' || pr.last_name, t.name
  FROM review_packets p
  JOIN profiles pr ON pr.id <> p.employee_id AND pr.id IS DISTINCT FROM p.manager_id AND pr.role <> 'admin'
  LEFT JOIN teams t ON t.id = pr.team_id
  WHERE p.id = p_packet AND (p.employee_id = auth.uid() OR p.manager_id = auth.uid() OR public.is_hr())
  ORDER BY (pr.team_id IS NOT DISTINCT FROM (SELECT team_id FROM profiles WHERE id = p.employee_id)) DESC, pr.last_name, pr.first_name
$$;
CREATE OR REPLACE FUNCTION public.review_nomination_list(p_packet uuid)
  RETURNS TABLE (peer_id uuid, name text, team_name text, status text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT n.peer_id, pr.first_name || ' ' || pr.last_name, t.name, n.status
  FROM review_nominations n
  JOIN review_packets p ON p.id = n.packet_id
  JOIN profiles pr ON pr.id = n.peer_id
  LEFT JOIN teams t ON t.id = pr.team_id
  WHERE n.packet_id = p_packet AND (p.employee_id = auth.uid() OR p.manager_id = auth.uid() OR public.is_hr())
  ORDER BY pr.last_name
$$;
REVOKE EXECUTE ON FUNCTION public.review_peer_candidates(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_nomination_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_peer_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_nomination_list(uuid) TO authenticated;

-- TND-33 — HR chooses the colleagues who give feedback (decision of Prince,
-- 06/11): the employee no longer proposes, the manager no longer validates.
-- The list is only visible to HR (and each peer sees their own request), which
-- also keeps the evaluators unknown to the person reviewed.

-- the employee's proposal is retired
REVOKE EXECUTE ON FUNCTION public.propose_peers(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- only HR sets the list (at least 3, for anonymity)
CREATE OR REPLACE FUNCTION public.approve_peers(p_packet uuid, p_peers uuid[])
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_p review_packets; v_c review_cycles; v_peer uuid; v_emp text;
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_p FROM review_packets WHERE id = p_packet;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  SELECT * INTO v_c FROM review_cycles WHERE id = v_p.cycle_id;
  IF NOT v_c.peers_enabled OR v_c.status <> 'active' OR v_p.shared_at IS NOT NULL THEN RAISE EXCEPTION 'Les retours de collègues ne sont pas ouverts'; END IF;
  IF coalesce(cardinality(p_peers), 0) < 3 OR cardinality(p_peers) > v_c.peers_max THEN RAISE EXCEPTION 'Choisissez entre 3 et % collègues (anonymat)', v_c.peers_max; END IF;
  IF v_p.employee_id = ANY (p_peers) OR v_p.manager_id = ANY (p_peers) THEN RAISE EXCEPTION 'Ni la personne évaluée ni son manager'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_peers) x WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = x AND role <> 'admin')) THEN RAISE EXCEPTION 'Collègue introuvable'; END IF;
  SELECT first_name || ' ' || last_name INTO v_emp FROM profiles WHERE id = v_p.employee_id;
  -- colleagues who already answered stay; the others follow the new list
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

-- who is asked: HR only (the peer sees their own request through my_peer_requests())
DROP POLICY IF EXISTS review_nominations_read ON public.review_nominations;
CREATE POLICY review_nominations_read ON public.review_nominations FOR SELECT TO authenticated
  USING (peer_id = (SELECT auth.uid()) OR (SELECT public.is_hr()));

CREATE OR REPLACE FUNCTION public.review_peer_candidates(p_packet uuid)
  RETURNS TABLE (id uuid, name text, team_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pr.id, pr.first_name || ' ' || pr.last_name, t.name
  FROM review_packets p
  JOIN profiles pr ON pr.id <> p.employee_id AND pr.id IS DISTINCT FROM p.manager_id AND pr.role <> 'admin'
  LEFT JOIN teams t ON t.id = pr.team_id
  WHERE p.id = p_packet AND public.is_hr()
  ORDER BY (pr.team_id IS NOT DISTINCT FROM (SELECT team_id FROM profiles WHERE id = p.employee_id)) DESC, pr.last_name, pr.first_name
$$;
CREATE OR REPLACE FUNCTION public.review_nomination_list(p_packet uuid)
  RETURNS TABLE (peer_id uuid, name text, team_name text, status text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT n.peer_id, pr.first_name || ' ' || pr.last_name, t.name, n.status
  FROM review_nominations n
  JOIN profiles pr ON pr.id = n.peer_id
  LEFT JOIN teams t ON t.id = pr.team_id
  WHERE n.packet_id = p_packet AND public.is_hr()
  ORDER BY pr.last_name
$$;

-- campaign follow-up: per packet, colleagues chosen and how many answered (never who wrote what)
CREATE OR REPLACE FUNCTION public.cycle_peer_summary(p_cycle uuid)
  RETURNS TABLE (packet_id uuid, chosen integer, answered integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id,
         (SELECT count(*)::int FROM review_nominations n WHERE n.packet_id = p.id AND n.status = 'approved'),
         (SELECT count(*)::int FROM review_responses r WHERE r.packet_id = p.id AND r.role = 'peer' AND r.submitted_at IS NOT NULL)
  FROM review_packets p
  WHERE p.cycle_id = p_cycle AND public.is_hr()
$$;
REVOKE EXECUTE ON FUNCTION public.cycle_peer_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cycle_peer_summary(uuid) TO authenticated;

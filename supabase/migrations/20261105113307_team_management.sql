-- =============================================================================
-- Team management (05/11/2026): create / edit a team with its manager and
-- members in one call, and delete a team. Admin only, SECURITY DEFINER.
--
-- Rules
--  - admins are never team members (they validate every team);
--  - one manager per team: the chosen person becomes 'manager', any other
--    manager of the team goes back to 'employee';
--  - a person removed from the team loses it (team_id NULL); a manager
--    removed from his team goes back to 'employee';
--  - deleting a team frees its members the same way.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_save_team(
  p_id uuid,
  p_name text,
  p_manager_id uuid,
  p_member_ids uuid[]
)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_members uuid[] := coalesce(p_member_ids, '{}');
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_name, '')) = '' OR char_length(btrim(p_name)) > 60 THEN
    RAISE EXCEPTION 'Le nom de l''équipe est obligatoire (60 caractères maximum)';
  END IF;
  IF EXISTS (SELECT 1 FROM teams WHERE lower(name) = lower(btrim(p_name)) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Une équipe porte déjà ce nom';
  END IF;

  -- The manager is always a member
  IF p_manager_id IS NOT NULL AND NOT (p_manager_id = ANY (v_members)) THEN
    v_members := v_members || p_manager_id;
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY (v_members) AND role = 'admin') THEN
    RAISE EXCEPTION 'Un administrateur ne peut pas être membre d''une équipe';
  END IF;
  IF (SELECT count(*) FROM profiles WHERE id = ANY (v_members)) <> cardinality(ARRAY(SELECT DISTINCT unnest(v_members))) THEN
    RAISE EXCEPTION 'Personne introuvable';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO teams (name) VALUES (btrim(p_name)) RETURNING id INTO v_id;
  ELSE
    UPDATE teams SET name = btrim(p_name) WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Équipe introuvable'; END IF;
  END IF;

  -- People leaving the team
  UPDATE profiles
     SET team_id = NULL,
         role = CASE WHEN role = 'manager' THEN 'employee' ELSE role END
   WHERE team_id = v_id AND NOT (id = ANY (v_members));

  -- People joining (they may come from another team: a manager there becomes an employee here)
  UPDATE profiles
     SET team_id = v_id,
         role = CASE WHEN id = p_manager_id THEN 'manager' WHEN role = 'manager' THEN 'employee' ELSE role END
   WHERE id = ANY (v_members);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_team(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles
     SET team_id = NULL,
         role = CASE WHEN role = 'manager' THEN 'employee' ELSE role END
   WHERE team_id = p_id;
  DELETE FROM teams WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Équipe introuvable'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_team(uuid, text, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_team(uuid, text, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(uuid) TO authenticated;

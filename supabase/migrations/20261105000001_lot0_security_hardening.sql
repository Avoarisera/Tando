-- =============================================================================
-- Lot 0 — security hardening (TND-05, TND-11, TND-12, TND-13, TND-14, TND-15,
-- TND-17, TND-19, TND-20).
--
-- Audit 2026-11-05 found that:
--   * anon / authenticated held ALL privileges on every public table: the
--     "minimal grants" migration only ADDED grants, it never revoked the
--     Supabase defaults (TND-13);
--   * admin-only SECURITY DEFINER functions let anonymous callers through,
--     because `NULL <> 'admin'` is NULL, not true (TND-11);
--   * employees could INSERT leave requests directly, with any status and any
--     days_count (TND-12);
--   * managers could UPDATE any column while approving, and approve their own
--     request (TND-14);
--   * teammates could read birth_date / trial_ends_at (TND-15).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table privileges: start from nothing, grant only what the app uses (TND-13)
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- profiles: column-level SELECT — birth_date / trial_ends_at stay private (TND-15)
GRANT SELECT (id, first_name, last_name, role, team_id, joined_at, created_at)
  ON public.profiles TO authenticated;

-- leave_requests: read only. Creation → create_leave_request, review → review_leave_request
GRANT SELECT ON public.leave_requests TO authenticated;

-- leave_balances: read + admin inline edit of the quota (RLS keeps it admin-only)
GRANT SELECT ON public.leave_balances TO authenticated;
GRANT UPDATE (allocated_days) ON public.leave_balances TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.leave_types TO authenticated;
GRANT SELECT                 ON public.teams       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoices    TO authenticated;

-- Vélocité: the browser never sees linear_api_key (TND-20); writes go through
-- server routes using the service role.
GRANT SELECT (id, user_id, name, last_synced_at, created_at, selected_teams,
              sync_status, sync_teams_total, sync_teams_done, sync_issues_done,
              sync_error, sync_started_at, sync_finished_at)
  ON public.workspaces TO authenticated;
GRANT DELETE ON public.workspaces TO authenticated;
GRANT SELECT ON public.linear_issues, public.linear_teams, public.linear_users,
                public.monthly_snapshots, public.issue_history
  TO authenticated;

-- Future tables / functions must not silently become public again
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Leave requests: no direct writes from the API (TND-12, TND-14)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "leave_requests_insert_employee" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_manager"  ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_admin"    ON public.leave_requests;

-- Once a request has left 'pending', its substance can no longer change, so the
-- balance can never drift from what was approved (TND-14, TND-20).
CREATE OR REPLACE FUNCTION public.guard_leave_request_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NEW.user_id       IS DISTINCT FROM OLD.user_id
  OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
  OR NEW.start_date    IS DISTINCT FROM OLD.start_date
  OR NEW.end_date      IS DISTINCT FROM OLD.end_date
  OR NEW.days_count    IS DISTINCT FROM OLD.days_count
  THEN
    RAISE EXCEPTION 'Une demande ne peut pas être modifiée après sa création'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_leave_request_update ON public.leave_requests;
CREATE TRIGGER trigger_guard_leave_request_update
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_leave_request_update();

-- -----------------------------------------------------------------------------
-- 3. create_leave_request — real available balance and server-side checks (TND-19)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_leave_request(
  p_leave_type_id uuid,
  p_start_date    date,
  p_end_date      date,
  p_comment       text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_days_count     int  := (p_end_date - p_start_date) + 1;
  v_year           int  := EXTRACT(YEAR FROM p_start_date)::int;
  v_balance        leave_balances;
  v_pending_days   int;
  v_remaining      int;
  v_conflict_start date;
  v_conflict_end   date;
  v_new_id         uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Les dates de début et de fin sont obligatoires';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début';
  END IF;

  IF p_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La date de début ne peut pas être dans le passé';
  END IF;

  IF EXTRACT(YEAR FROM p_end_date)::int <> v_year THEN
    RAISE EXCEPTION 'Une demande ne peut pas chevaucher deux années : posez une demande par année';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE id = p_leave_type_id AND is_active) THEN
    RAISE EXCEPTION 'Ce type de congé n''est pas disponible';
  END IF;

  SELECT start_date, end_date INTO v_conflict_start, v_conflict_end
  FROM leave_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'manager_approved', 'approved')
    AND start_date <= p_end_date
    AND end_date   >= p_start_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Vous avez déjà une demande du % au % sur cette période',
      TO_CHAR(v_conflict_start, 'DD/MM/YYYY'),
      TO_CHAR(v_conflict_end,   'DD/MM/YYYY');
  END IF;

  SELECT * INTO v_balance
  FROM leave_balances
  WHERE user_id       = v_user_id
    AND leave_type_id = p_leave_type_id
    AND year          = v_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun solde configuré pour ce type de congé';
  END IF;

  -- Days already requested but not yet approved are reserved too.
  SELECT COALESCE(SUM(days_count), 0) INTO v_pending_days
  FROM leave_requests
  WHERE user_id       = v_user_id
    AND leave_type_id = p_leave_type_id
    AND EXTRACT(YEAR FROM start_date)::int = v_year
    AND status IN ('pending', 'manager_approved');

  v_remaining := v_balance.allocated_days - v_balance.used_days - v_pending_days;

  IF v_remaining < v_days_count THEN
    RAISE EXCEPTION 'Solde insuffisant — vous demandez % jour(s) mais il ne vous en reste que % (demandes en attente comprises)',
      v_days_count, GREATEST(v_remaining, 0);
  END IF;

  INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, days_count, comment)
  VALUES (v_user_id, p_leave_type_id, p_start_date, p_end_date, v_days_count, p_comment)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. review_leave_request — the only way to approve / reject (TND-14)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_leave_request(
  p_request_id uuid,
  p_decision   text   -- 'approve' | 'reject'
)
  RETURNS text      -- the new status
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_role       text := public.auth_role();
  v_request    leave_requests;
  v_req_team   uuid;
  v_new_status text;
BEGIN
  IF v_caller IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Décision invalide : %', p_decision;
  END IF;

  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  IF v_role = 'manager' THEN
    SELECT team_id INTO v_req_team FROM profiles WHERE id = v_request.user_id;

    IF v_request.user_id = v_caller THEN
      RAISE EXCEPTION 'Vous ne pouvez pas valider votre propre demande' USING ERRCODE = '42501';
    END IF;
    IF v_req_team IS NULL OR v_req_team IS DISTINCT FROM public.auth_team_id() THEN
      RAISE EXCEPTION 'Cette demande n''appartient pas à votre équipe' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'pending' THEN
      RAISE EXCEPTION 'Cette demande a déjà été traitée';
    END IF;

    v_new_status := CASE p_decision WHEN 'approve' THEN 'manager_approved' ELSE 'rejected' END;
    UPDATE leave_requests
    SET status = v_new_status,
        manager_reviewed_by = v_caller,
        manager_reviewed_at = now()
    WHERE id = p_request_id;

  ELSIF v_role = 'admin' THEN
    IF v_request.status NOT IN ('pending', 'manager_approved') THEN
      RAISE EXCEPTION 'Cette demande a déjà été traitée';
    END IF;

    v_new_status := CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
    -- balance check + debit happen in trigger_update_leave_balance
    UPDATE leave_requests
    SET status = v_new_status,
        admin_reviewed_by = v_caller,
        admin_reviewed_at = now()
    WHERE id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  RETURN v_new_status;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Admin functions: NULL-safe role checks (TND-11) + managers counted (TND-05)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_today      date := CURRENT_DATE;
  v_week_start date := date_trunc('week', CURRENT_DATE)::date;
  v_week_end   date := (date_trunc('week', CURRENT_DATE) + interval '6 days')::date;
  v_total          int;
  v_on_leave_today int;
  v_on_leave_week  int;
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM profiles WHERE role IN ('employee', 'manager');

  SELECT COUNT(DISTINCT lr.user_id) INTO v_on_leave_today
  FROM leave_requests lr
  JOIN profiles p ON p.id = lr.user_id AND p.role IN ('employee', 'manager')
  WHERE lr.status = 'approved'
    AND lr.start_date <= v_today
    AND lr.end_date   >= v_today;

  SELECT COUNT(DISTINCT lr.user_id) INTO v_on_leave_week
  FROM leave_requests lr
  JOIN profiles p ON p.id = lr.user_id AND p.role IN ('employee', 'manager')
  WHERE lr.status = 'approved'
    AND lr.start_date <= v_week_end
    AND lr.end_date   >= v_week_start;

  RETURN (
    SELECT json_build_object(
      'total_employees', v_total,
      'on_leave_today',  v_on_leave_today,
      'on_leave_week',   v_on_leave_week,
      'present',         v_total - v_on_leave_today,
      'employees', (
        SELECT json_agg(
          json_build_object(
            'id',              p.id,
            'first_name',      p.first_name,
            'last_name',       p.last_name,
            'role',            p.role,
            'team_name',       t.name,
            'joined_at',       p.joined_at,
            'on_leave',        (lr_today.id IS NOT NULL),
            'leave_type_name', lt.name,
            'leave_end_date',  lr_today.end_date
          )
          ORDER BY p.last_name, p.first_name
        )
        FROM profiles p
        LEFT JOIN teams t ON t.id = p.team_id
        LEFT JOIN LATERAL (
          SELECT lr.id, lr.end_date, lr.leave_type_id
          FROM leave_requests lr
          WHERE lr.user_id    = p.id
            AND lr.status     = 'approved'
            AND lr.start_date <= v_today
            AND lr.end_date   >= v_today
          ORDER BY lr.start_date
          LIMIT 1
        ) lr_today ON true
        LEFT JOIN leave_types lt ON lt.id = lr_today.leave_type_id
        WHERE p.role IN ('employee', 'manager')
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_leave_type_balances(
  p_leave_type_id  uuid,
  p_year           integer,
  p_allocated_days integer DEFAULT 0
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  IF p_allocated_days IS NULL OR p_allocated_days < 0 THEN
    RAISE EXCEPTION 'Le nombre de jours ne peut pas être négatif';
  END IF;

  INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
  SELECT id, p_leave_type_id, p_year, p_allocated_days, 0
  FROM profiles
  WHERE role <> 'admin'
  ON CONFLICT (user_id, leave_type_id, year)
  DO UPDATE SET allocated_days = EXCLUDED.allocated_days;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Fixed search_path on the remaining SECURITY DEFINER functions (TND-20)
ALTER FUNCTION public.update_leave_balance() SET search_path = public;
ALTER FUNCTION public.auth_role()           SET search_path = public;
ALTER FUNCTION public.auth_team_id()        SET search_path = public;

-- -----------------------------------------------------------------------------
-- 6. Function privileges: nothing for anon, explicit list for authenticated
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.auth_role()                                   TO authenticated;  -- used by RLS policies
GRANT EXECUTE ON FUNCTION public.auth_team_id()                                TO authenticated;  -- used by RLS policies
GRANT EXECUTE ON FUNCTION public.create_leave_request(uuid, date, date, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_leave_request(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_leave_type_balances(uuid, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Vélocité: workspaces are shared by all admins, not owned by one (TND-17)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspaces_all_own"        ON public.workspaces;
DROP POLICY IF EXISTS "linear_teams_all_own"      ON public.linear_teams;
DROP POLICY IF EXISTS "linear_users_all_own"      ON public.linear_users;
DROP POLICY IF EXISTS "linear_issues_all_own"     ON public.linear_issues;
DROP POLICY IF EXISTS "issue_history_all_own"     ON public.issue_history;
DROP POLICY IF EXISTS "monthly_snapshots_all_own" ON public.monthly_snapshots;

CREATE POLICY "workspaces_select_admin" ON public.workspaces
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
CREATE POLICY "workspaces_delete_admin" ON public.workspaces
  FOR DELETE TO authenticated USING (public.auth_role() = 'admin');

CREATE POLICY "linear_teams_select_admin" ON public.linear_teams
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
CREATE POLICY "linear_users_select_admin" ON public.linear_users
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
CREATE POLICY "linear_issues_select_admin" ON public.linear_issues
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
CREATE POLICY "issue_history_select_admin" ON public.issue_history
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
CREATE POLICY "monthly_snapshots_select_admin" ON public.monthly_snapshots
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');

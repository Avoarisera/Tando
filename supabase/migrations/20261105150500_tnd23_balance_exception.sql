-- =============================================================================
-- TND-23 (05/11/2026) — insufficient balance and exceptional approval
--
-- A. Leave types "without balance" (sick leave, unpaid leave): no balance check,
--    no balance row needed.
-- B. Going over the balance no longer blocks the request: the employee is warned
--    in the app, the manager validates as usual, and only the admin can approve
--    it "à titre exceptionnel" with a mandatory reason. The balance may then
--    become negative (an advance), visible in the app.
-- =============================================================================

-- A. Types without balance ----------------------------------------------------
ALTER TABLE public.leave_types ADD COLUMN IF NOT EXISTS tracks_balance boolean NOT NULL DEFAULT true;
UPDATE public.leave_types SET tracks_balance = false WHERE name IN ('Congé maladie', 'Congé sans solde');

-- B. Exception flag on the request -------------------------------------------
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS is_exception boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exception_reason text CHECK (exception_reason IS NULL OR char_length(exception_reason) <= 500);

-- Request validation: same checks, but the balance is only checked for types
-- that track one, and going over it is allowed (the admin decides later).
CREATE OR REPLACE FUNCTION public._validate_leave(
  p_user_id uuid, p_leave_type_id uuid, p_start date, p_end date,
  p_start_half boolean, p_end_half boolean, p_exclude_id uuid
)
  RETURNS numeric
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_days     numeric;
  v_year     int := EXTRACT(YEAR FROM p_start)::int;
  v_tracks   boolean;
  v_c_start  date;
  v_c_end    date;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Les dates de début et de fin sont obligatoires';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début';
  END IF;
  IF p_start < CURRENT_DATE THEN
    RAISE EXCEPTION 'La date de début ne peut pas être dans le passé';
  END IF;
  IF EXTRACT(YEAR FROM p_end)::int <> v_year THEN
    RAISE EXCEPTION 'Une demande ne peut pas chevaucher deux années : posez une demande par année';
  END IF;
  SELECT tracks_balance INTO v_tracks FROM leave_types WHERE id = p_leave_type_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce type de congé n''est pas disponible';
  END IF;

  v_days := public.count_leave_days(p_user_id, p_start, p_end, p_start_half, p_end_half);
  IF v_days <= 0 THEN
    RAISE EXCEPTION 'Cette période ne contient aucun jour ouvré';
  END IF;

  SELECT start_date, end_date INTO v_c_start, v_c_end
  FROM leave_requests
  WHERE user_id = p_user_id
    AND id IS DISTINCT FROM p_exclude_id
    AND status IN ('pending', 'manager_approved', 'approved', 'cancel_requested')
    AND start_date <= p_end AND end_date >= p_start
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Vous avez déjà une demande du % au % sur cette période',
      TO_CHAR(v_c_start, 'DD/MM/YYYY'), TO_CHAR(v_c_end, 'DD/MM/YYYY');
  END IF;

  -- A tracked type still needs a balance row for the year (set by the admin)
  IF v_tracks AND NOT EXISTS (
    SELECT 1 FROM leave_balances WHERE user_id = p_user_id AND leave_type_id = p_leave_type_id AND year = v_year
  ) THEN
    RAISE EXCEPTION 'Aucun solde configuré pour ce type de congé';
  END IF;

  RETURN v_days;
END;
$$;

-- Balance trigger: untracked types skip everything; tracked types refuse to go
-- negative unless the exceptional-approval RPC set the session flag.
CREATE OR REPLACE FUNCTION public.update_leave_balance()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_year      int := EXTRACT(YEAR FROM COALESCE(NEW.start_date, OLD.start_date))::int;
  v_balance   leave_balances%ROWTYPE;
  v_tracks    boolean;
  v_new_taken boolean := NEW.status IN ('approved', 'cancel_requested');
  v_old_taken boolean := TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'cancel_requested');
BEGIN
  SELECT tracks_balance INTO v_tracks FROM leave_types WHERE id = COALESCE(NEW.leave_type_id, OLD.leave_type_id);
  IF NOT COALESCE(v_tracks, true) THEN
    RETURN NEW;
  END IF;

  IF v_new_taken AND NOT v_old_taken THEN
    SELECT * INTO v_balance FROM leave_balances
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = v_year;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année';
    END IF;
    IF (v_balance.allocated_days - v_balance.used_days) < NEW.days_count
       AND current_setting('wakabods.allow_overdraft', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Solde insuffisant — % jour(s) restant(s) pour ce type de congé. L''admin peut l''approuver à titre exceptionnel.',
        (v_balance.allocated_days - v_balance.used_days);
    END IF;
    UPDATE leave_balances SET used_days = used_days + NEW.days_count WHERE id = v_balance.id;
  ELSIF v_old_taken AND NOT v_new_taken THEN
    UPDATE leave_balances SET used_days = GREATEST(0, used_days - OLD.days_count)
    WHERE user_id = OLD.user_id AND leave_type_id = OLD.leave_type_id AND year = v_year;
  END IF;
  RETURN NEW;
END;
$$;

-- B. Exceptional approval (admin only, reason mandatory) -----------------------
CREATE OR REPLACE FUNCTION public.approve_leave_exception(p_request_id uuid, p_reason text)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_reason  text := NULLIF(btrim(p_reason), '');
  v_request leave_requests;
BEGIN
  IF v_caller IS NULL OR public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Seul un administrateur peut accorder une exception' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Indiquez le motif de l''accord exceptionnel';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Le motif ne peut pas dépasser 500 caractères';
  END IF;

  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF v_request.status NOT IN ('pending', 'manager_approved') THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée';
  END IF;

  PERFORM set_config('wakabods.allow_overdraft', 'on', true);
  UPDATE leave_requests
  SET status = 'approved', admin_reviewed_by = v_caller, admin_reviewed_at = now(),
      is_exception = true, exception_reason = v_reason
  WHERE id = p_request_id;
  PERFORM set_config('wakabods.allow_overdraft', 'off', true);
  RETURN 'approved';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_leave_exception(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave_exception(uuid, text) TO authenticated;

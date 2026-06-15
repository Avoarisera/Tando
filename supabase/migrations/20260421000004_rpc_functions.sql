CREATE OR REPLACE FUNCTION create_leave_request(
  p_leave_type_id  uuid,
  p_start_date     date,
  p_end_date       date,
  p_comment        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_days_count int  := (p_end_date - p_start_date) + 1;
  v_balance    leave_balances;
  v_new_id     uuid;
BEGIN
  -- Validate dates
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début';
  END IF;

  -- Check overlap with existing requests
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = v_user_id
      AND status IN ('pending', 'manager_approved', 'approved')
      AND start_date <= p_end_date
      AND end_date   >= p_start_date
  ) THEN
    RAISE EXCEPTION 'Vous avez déjà une demande sur cette période';
  END IF;

  -- Check balance
  SELECT * INTO v_balance
  FROM leave_balances
  WHERE user_id       = v_user_id
    AND leave_type_id = p_leave_type_id
    AND year          = EXTRACT(YEAR FROM p_start_date)::int;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun solde configuré pour ce type de congé';
  END IF;

  IF (v_balance.allocated_days - v_balance.used_days) < v_days_count THEN
    RAISE EXCEPTION 'Solde insuffisant — il vous reste % jour(s)',
      (v_balance.allocated_days - v_balance.used_days);
  END IF;

  -- Insert request
  INSERT INTO leave_requests (
    user_id, leave_type_id, start_date, end_date, days_count, comment
  )
  VALUES (v_user_id, p_leave_type_id, p_start_date, p_end_date, v_days_count, p_comment)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

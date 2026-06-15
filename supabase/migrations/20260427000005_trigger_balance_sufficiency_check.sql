-- Add balance sufficiency check to Case 1 of update_leave_balance trigger.
-- Previously the trigger only guarded against a missing balance row (NOT FOUND),
-- allowing used_days to exceed allocated_days silently. Now it raises an exception
-- when days_count would exceed the remaining balance, consistent with the
-- PRD rule: "Solde insuffisant : la demande est bloquée".
-- This applies to all paths that reach 'approved': manager approval, admin approval,
-- and the admin bypass (pending → approved directly). The admin bypasses the manager
-- level, not the balance rule.
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year    int;
  v_balance leave_balances%ROWTYPE;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.start_date, OLD.start_date))::int;

  -- Case 1: transition TO 'approved' (from any other status, or on INSERT directly approved)
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'approved')
  THEN
    SELECT * INTO v_balance
    FROM leave_balances
    WHERE user_id       = NEW.user_id
      AND leave_type_id = NEW.leave_type_id
      AND year          = v_year;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année';
    END IF;

    IF (v_balance.allocated_days - v_balance.used_days) < NEW.days_count THEN
      RAISE EXCEPTION 'Solde insuffisant — % jour(s) restant(s) pour ce type de congé',
        (v_balance.allocated_days - v_balance.used_days);
    END IF;

    UPDATE leave_balances
    SET used_days = used_days + NEW.days_count
    WHERE id = v_balance.id;

  -- Case 2: transition FROM 'approved' to something else (admin correction)
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'approved'
    AND NEW.status <> 'approved'
  THEN
    UPDATE leave_balances
    SET used_days = GREATEST(0, used_days - OLD.days_count)
    WHERE user_id       = OLD.user_id
      AND leave_type_id = OLD.leave_type_id
      AND year          = v_year;
  END IF;

  RETURN NEW;
END;
$$;

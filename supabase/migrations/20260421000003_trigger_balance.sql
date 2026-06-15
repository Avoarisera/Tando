CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year int;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.start_date, OLD.start_date))::int;

  -- Case 1: transition TO 'approved' (from any other status, or on INSERT directly approved)
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'approved')
  THEN
    UPDATE leave_balances
    SET used_days = used_days + NEW.days_count
    WHERE user_id       = NEW.user_id
      AND leave_type_id = NEW.leave_type_id
      AND year          = v_year;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année';
    END IF;

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

CREATE TRIGGER trigger_update_leave_balance
  AFTER INSERT OR UPDATE OF status
  ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_balance();

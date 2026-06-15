-- Creates or updates balance rows for all employees for a given leave type + year.
-- Used in two contexts:
--   1. After creating a new leave type (p_allocated_days = 0) — makes the type immediately usable
--   2. Admin bulk-set quota (p_allocated_days = N) — applies a uniform quota to all employees
-- ON CONFLICT only updates allocated_days — used_days is managed by the trigger, never touched here.
CREATE OR REPLACE FUNCTION upsert_leave_type_balances(
  p_leave_type_id  uuid,
  p_year           int,
  p_allocated_days int DEFAULT 0
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé';
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

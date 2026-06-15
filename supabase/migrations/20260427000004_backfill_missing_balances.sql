-- Fix 1: extend RPC to cover managers (role <> 'admin') in addition to employees.
-- Previous version only targeted role = 'employee', leaving managers without balance rows.
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

-- Fix 2: backfill zero-balance rows for all existing leave types × all non-admin users.
-- Uses ON CONFLICT DO NOTHING so existing rows (e.g. Congé payé with 25 days) are untouched.
INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
SELECT p.id, lt.id, 2026, 0, 0
FROM profiles p
CROSS JOIN leave_types lt
WHERE p.role <> 'admin'
ON CONFLICT (user_id, leave_type_id, year) DO NOTHING;

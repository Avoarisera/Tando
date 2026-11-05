-- =============================================================================
-- Notifications (05/11/2026, Prince): the admins are notified as soon as a
-- request is sent, not only once the manager has validated it. The team
-- manager is still notified as before.
-- Also back-fills one 'request_submitted' notification per admin for the
-- requests still waiting (sent before this change), so the bell matches
-- the "À valider" count.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_leave_event()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req   profiles;
  v_type  text;
  v_data  jsonb;
  v_actor uuid := auth.uid();
  v_kind  text;
  v_to    uuid[];
BEGIN
  SELECT * INTO v_req FROM profiles WHERE id = NEW.user_id;
  SELECT name INTO v_type FROM leave_types WHERE id = NEW.leave_type_id;
  v_data := jsonb_build_object('first_name', v_req.first_name, 'last_name', v_req.last_name, 'type', v_type,
                               'start_date', NEW.start_date, 'end_date', NEW.end_date, 'days', NEW.days_count,
                               'comment', NEW.review_comment);

  IF TG_OP = 'INSERT' THEN
    v_kind := 'request_submitted';
    -- the team manager (for an employee's request) and every admin
    SELECT array_agg(id) INTO v_to FROM profiles
     WHERE id <> NEW.user_id
       AND (role = 'admin'
            OR (v_req.role = 'employee' AND role = 'manager' AND team_id = v_req.team_id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'manager_approved' THEN
      v_kind := 'manager_approved';
      SELECT array_agg(id) INTO v_to FROM profiles WHERE role = 'admin';
      v_to := array_append(v_to, NEW.user_id);
    ELSIF NEW.status IN ('approved', 'rejected') AND OLD.status <> 'cancel_requested' THEN
      v_kind := NEW.status;
      v_to := ARRAY[NEW.user_id];
    ELSIF NEW.status = 'cancel_requested' THEN
      v_kind := 'cancel_requested';
      SELECT array_agg(id) INTO v_to FROM profiles WHERE role = 'admin';
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'cancel_requested' THEN
      v_kind := 'cancel_approved';
      v_to := ARRAY[NEW.user_id];
    ELSIF NEW.status = 'approved' AND OLD.status = 'cancel_requested' THEN
      v_kind := 'cancel_refused';
      v_to := ARRAY[NEW.user_id];
    END IF;
  END IF;

  IF v_kind IS NOT NULL AND v_to IS NOT NULL THEN
    INSERT INTO notifications (user_id, kind, request_id, actor_id, data)
    SELECT DISTINCT u, v_kind, NEW.id, v_actor, v_data
    FROM unnest(v_to) AS u
    WHERE u IS NOT NULL AND u IS DISTINCT FROM v_actor;  -- nobody is notified of their own action
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_leave_event() FROM PUBLIC, anon, authenticated;

-- Back-fill: requests still waiting, admins not yet notified of them
INSERT INTO public.notifications (user_id, kind, request_id, actor_id, data, created_at)
SELECT a.id, 'request_submitted', lr.id, lr.user_id,
       jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'type', lt.name,
                          'start_date', lr.start_date, 'end_date', lr.end_date, 'days', lr.days_count, 'comment', NULL),
       lr.created_at
FROM public.leave_requests lr
JOIN public.profiles p ON p.id = lr.user_id
LEFT JOIN public.leave_types lt ON lt.id = lr.leave_type_id
JOIN public.profiles a ON a.role = 'admin' AND a.id <> lr.user_id
WHERE lr.status IN ('pending', 'manager_approved')
  AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = a.id AND n.request_id = lr.id);

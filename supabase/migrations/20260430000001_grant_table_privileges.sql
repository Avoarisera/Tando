-- Supabase Cloud does not auto-grant data privileges on tables created via
-- migrations (unlike the dashboard). PostgREST uses the `authenticated` role
-- directly for REST calls, so it needs explicit GRANTs or it returns 403.
--
-- Grants are minimal: RLS policies still enforce row-level access.
-- INSERT on leave_requests is intentionally omitted — creation goes through
-- the SECURITY DEFINER RPC create_leave_request.
-- INSERT/UPDATE on leave_balances is intentionally omitted — writes go through
-- the SECURITY DEFINER RPC upsert_leave_balances and the trigger.

GRANT SELECT                 ON TABLE public.profiles       TO authenticated;
GRANT SELECT, UPDATE         ON TABLE public.leave_requests TO authenticated;
GRANT SELECT                 ON TABLE public.leave_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.leave_types    TO authenticated;
GRANT SELECT                 ON TABLE public.teams          TO authenticated;

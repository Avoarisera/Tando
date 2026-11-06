-- TND-30 lots 3 & 4 — anonymous screening, GDPR purge date that follows the last
-- contact, daily job bookkeeping, and the e-mail sending settings (API key in Vault).

-- ── Lot 3 ───────────────────────────────────────────────────────────────────
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS anonymous_screening boolean NOT NULL DEFAULT false;

-- purge date = last contact + 2 years (CNIL), kept in step automatically
CREATE OR REPLACE FUNCTION public.applications_purge_date()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.purge_after := (NEW.last_contact_at + interval '2 years')::date;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS applications_purge_date ON public.applications;
CREATE TRIGGER applications_purge_date BEFORE INSERT OR UPDATE OF last_contact_at ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_purge_date();

-- scheduled jobs that must run at most once a day (the cron fires every 15 min)
CREATE TABLE IF NOT EXISTS public.job_runs (
  name        text PRIMARY KEY CHECK (char_length(name) <= 60),
  last_run_at timestamptz NOT NULL DEFAULT now(),
  result      jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_runs FROM anon, authenticated;

-- ── Lot 4: e-mail sending settings ──────────────────────────────────────────
-- Never readable from the browser: no policy, no grant. Server routes (service role)
-- read and write it; the API key itself lives encrypted in Supabase Vault.
CREATE TABLE IF NOT EXISTS public.mail_settings (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider      text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend')),
  enabled       boolean NOT NULL DEFAULT false,
  from_name     text NOT NULL DEFAULT '' CHECK (char_length(from_name) <= 80),
  from_email    text NOT NULL DEFAULT '' CHECK (char_length(from_email) <= 254),
  reply_to      text NOT NULL DEFAULT '' CHECK (char_length(reply_to) <= 254),
  key_secret_id uuid,
  key_hint      text NOT NULL DEFAULT '' CHECK (char_length(key_hint) <= 8),
  last_test_at  timestamptz,
  last_error    text CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.mail_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.mail_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_settings FROM anon, authenticated;

-- store / replace the API key (service role only)
CREATE OR REPLACE FUNCTION public.set_mail_api_key(p_key text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_key IS NULL OR char_length(trim(p_key)) < 8 THEN RAISE EXCEPTION 'Clé invalide'; END IF;
  SELECT key_secret_id INTO v_id FROM mail_settings WHERE id;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(trim(p_key), 'tando_mail_api_key', 'Clé d’API du service d’envoi d’e-mails (TND-30)');
  ELSE
    PERFORM vault.update_secret(v_id, trim(p_key));
  END IF;
  UPDATE mail_settings SET key_secret_id = v_id, key_hint = right(trim(p_key), 4), updated_at = now() WHERE id;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_mail_api_key()
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault
AS $$
  SELECT s.decrypted_secret FROM vault.decrypted_secrets s JOIN mail_settings m ON m.key_secret_id = s.id WHERE m.id
$$;
REVOKE EXECUTE ON FUNCTION public.set_mail_api_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mail_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_mail_api_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mail_api_key() TO service_role;

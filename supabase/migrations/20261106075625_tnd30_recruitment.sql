-- TND-30 (lot 1) — Recruitment: HR access, job openings, public careers page,
-- applications (CV, cover letter), pipeline stages, activity feed.
--
-- Writes from candidates go through a server route (captcha, rate limit, file
-- checks) with the service role: anonymous visitors only READ published openings.
-- Recruiters (admin, or HR access) read/manage everything; a hiring manager reads
-- the applications of their own openings.

-- ── HR access ───────────────────────────────────────────────────────────────
-- A permission, not a 4th role: an HR person stays employee/manager for their own leave.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_hr boolean NOT NULL DEFAULT false;
GRANT SELECT (is_hr) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_recruiter()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR is_hr))
$$;
REVOKE EXECUTE ON FUNCTION public.is_recruiter() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_recruiter() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_hr(p_id uuid, p_is_hr boolean)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET is_hr = coalesce(p_is_hr, false) WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personne introuvable'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_hr(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_hr(uuid, boolean) TO authenticated;

-- Careers page intro (company settings, admin-edited; read publicly through the openings API)
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS careers_intro text NOT NULL DEFAULT ''
  CHECK (char_length(careers_intro) <= 2000);
GRANT UPDATE (careers_intro) ON public.company_settings TO authenticated;

-- ── Job openings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_openings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  team_id           uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  hiring_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  location          text NOT NULL DEFAULT '' CHECK (char_length(location) <= 120),
  contract_type     text NOT NULL DEFAULT 'cdi' CHECK (contract_type IN ('cdi', 'cdd', 'internship', 'apprenticeship', 'freelance')),
  remote            text NOT NULL DEFAULT 'hybrid' CHECK (remote IN ('on_site', 'hybrid', 'remote')),
  salary_min        integer CHECK (salary_min IS NULL OR salary_min >= 0),
  salary_max        integer CHECK (salary_max IS NULL OR salary_max >= 0),
  salary_period     text NOT NULL DEFAULT 'year' CHECK (salary_period IN ('year', 'month')),
  salary_currency   text NOT NULL DEFAULT 'EUR' CHECK (salary_currency ~ '^[A-Z]{3}$'),
  summary           text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 400),
  missions          text NOT NULL DEFAULT '' CHECK (char_length(missions) <= 6000),
  profile           text NOT NULL DEFAULT '' CHECK (char_length(profile) <= 6000),
  benefits          text NOT NULL DEFAULT '' CHECK (char_length(benefits) <= 4000),
  -- shown to candidates, e.g. {"Échange RH", "Entretien technique", "Rencontre équipe"}
  process_steps     text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(process_steps) <= 8),
  -- up to 3 questions: [{"id": "q1", "label": "...", "required": true}]
  questions         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 3),
  cover_letter      text NOT NULL DEFAULT 'optional' CHECK (cover_letter IN ('none', 'optional', 'required')),
  -- pipeline stages (internal): [{"key": "new", "label": "Nouvelle"}, ...]
  stages            jsonb NOT NULL DEFAULT '[
    {"key":"new","label":"Nouvelle"},{"key":"screen","label":"Présélection"},{"key":"hr","label":"Échange RH"},
    {"key":"tech","label":"Entretien technique"},{"key":"team","label":"Rencontre équipe"},{"key":"offer","label":"Offre"},
    {"key":"hired","label":"Embauché"}]'::jsonb CHECK (jsonb_typeof(stages) = 'array'),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'closed')),
  published_at      timestamptz,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);
CREATE INDEX IF NOT EXISTS job_openings_status_idx ON public.job_openings (status, published_at DESC);
CREATE INDEX IF NOT EXISTS job_openings_manager_idx ON public.job_openings (hiring_manager_id);
CREATE INDEX IF NOT EXISTS job_openings_team_idx ON public.job_openings (team_id);
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;

-- ── Candidates & applications ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
  first_name   text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
  last_name    text NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 80),
  phone        text CHECK (phone IS NULL OR char_length(phone) <= 40),
  linkedin_url text CHECK (linkedin_url IS NULL OR char_length(linkedin_url) <= 300),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id        uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  candidate_id      uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage             text NOT NULL DEFAULT 'new' CHECK (char_length(stage) <= 40),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rejected', 'withdrawn', 'hired')),
  answers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_letter_text text CHECK (cover_letter_text IS NULL OR char_length(cover_letter_text) <= 6000),
  source            text NOT NULL DEFAULT 'careers' CHECK (char_length(source) <= 40),
  consent_pool      boolean NOT NULL DEFAULT false,
  consent_at        timestamptz NOT NULL DEFAULT now(),
  rejection_reason  text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 300),
  -- private link for the candidate (follow-up, withdrawal) — lot 2
  track_token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  last_contact_at   timestamptz NOT NULL DEFAULT now(),
  -- CNIL: 2 years after the last contact (purge job — lot 3)
  purge_after       date NOT NULL DEFAULT (now() + interval '2 years')::date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opening_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS applications_opening_idx ON public.applications (opening_id, status, stage);
CREATE INDEX IF NOT EXISTS applications_candidate_idx ON public.applications (candidate_id);
CREATE INDEX IF NOT EXISTS applications_purge_idx ON public.applications (purge_after);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.application_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('cv', 'cover_letter')),
  storage_path   text NOT NULL UNIQUE,
  file_name      text NOT NULL CHECK (char_length(file_name) <= 200),
  mime_type      text NOT NULL CHECK (mime_type IN ('application/pdf', 'application/msword',
                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes     integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_files_app_idx ON public.application_files (application_id);
ALTER TABLE public.application_files ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.application_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN ('submitted', 'stage', 'note', 'email', 'rejected', 'restored', 'withdrawn')),
  data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_app_idx ON public.application_events (application_id, created_at);
CREATE INDEX IF NOT EXISTS application_events_actor_idx ON public.application_events (actor_id);
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

-- ── Access helpers ──────────────────────────────────────────────────────────
-- Openings the signed-in user may follow: every opening for a recruiter, their own for a hiring manager
CREATE OR REPLACE FUNCTION public.can_see_opening(p_opening uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_recruiter()
      OR EXISTS (SELECT 1 FROM job_openings o WHERE o.id = p_opening AND o.hiring_manager_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_opening(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_opening(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_application(p_application uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM applications a WHERE a.id = p_application AND public.can_see_opening(a.opening_id))
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_application(uuid) TO authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────
-- Openings: published ones are public (careers page); recruiters manage all; hiring managers read theirs
CREATE POLICY job_openings_public ON public.job_openings
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY job_openings_staff ON public.job_openings
  FOR SELECT TO authenticated USING ((SELECT public.is_recruiter()) OR hiring_manager_id = (SELECT auth.uid()));
CREATE POLICY job_openings_write ON public.job_openings
  FOR ALL TO authenticated USING ((SELECT public.is_recruiter())) WITH CHECK ((SELECT public.is_recruiter()));

CREATE POLICY applications_read ON public.applications
  FOR SELECT TO authenticated USING (public.can_see_opening(opening_id));
CREATE POLICY candidates_read ON public.candidates
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = candidates.id AND public.can_see_opening(a.opening_id)));
CREATE POLICY application_files_read ON public.application_files
  FOR SELECT TO authenticated USING (public.can_see_application(application_id));
CREATE POLICY application_events_read ON public.application_events
  FOR SELECT TO authenticated USING (public.can_see_application(application_id));
-- internal notes: anyone following the application, signed as themselves
CREATE POLICY application_events_note ON public.application_events
  FOR INSERT TO authenticated WITH CHECK (kind = 'note' AND actor_id = (SELECT auth.uid()) AND public.can_see_application(application_id));

-- Table rights (they start from nothing since lot 0). Stage changes, rejections and
-- applications go through server routes (service role) so e-mails and events stay consistent.
-- anonymous visitors: public columns only (never the manager, creator or internal stages)
GRANT SELECT (id, slug, title, team_id, location, contract_type, remote, salary_min, salary_max, salary_period,
              salary_currency, summary, missions, profile, benefits, process_steps, questions, cover_letter, status, published_at)
  ON public.job_openings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_openings TO authenticated;
GRANT SELECT ON public.applications, public.candidates, public.application_files TO authenticated;
GRANT SELECT, INSERT ON public.application_events TO authenticated;
GRANT USAGE ON SEQUENCE public.application_events_id_seq TO authenticated;

-- updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS job_openings_touch ON public.job_openings;
CREATE TRIGGER job_openings_touch BEFORE UPDATE ON public.job_openings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS applications_touch ON public.applications;
CREATE TRIGGER applications_touch BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Private storage for CVs and cover letters ───────────────────────────────
-- No storage policy: files are only written and read through server routes
-- (service role, short-lived signed URLs for recruiters).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('applications', 'applications', false, 10485760,
        ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- ── In-app notification « new application » for recruiters and the hiring manager ──
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'request_submitted', 'manager_approved', 'approved', 'rejected',
  'cancel_requested', 'cancel_approved', 'cancel_refused', 'application_received'));

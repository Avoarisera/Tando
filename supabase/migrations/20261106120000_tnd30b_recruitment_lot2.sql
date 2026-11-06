-- TND-30 (lot 2) — Structured interviews: criteria per opening, interviews with
-- invited interviewers, scorecards (independent: you see the others' once yours
-- is submitted), e-mail templates, candidate follow-up link, hire → account.

-- ── Criteria of the scorecard, per opening: [{"id": "c1", "label": "Maîtrise de Vue"}] ──
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) <= 6);

-- ── Interviews ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  stage_key      text NOT NULL CHECK (char_length(stage_key) <= 40),
  starts_at      timestamptz NOT NULL,
  duration_min   integer NOT NULL DEFAULT 45 CHECK (duration_min BETWEEN 10 AND 480),
  location       text NOT NULL DEFAULT '' CHECK (char_length(location) <= 200),
  video_url      text CHECK (video_url IS NULL OR (char_length(video_url) <= 500 AND video_url ~* '^https?://')),
  notes          text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  status         text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled')),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interviews_app_idx ON public.interviews (application_id, starts_at);
CREATE INDEX IF NOT EXISTS interviews_creator_idx ON public.interviews (created_by);
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.interview_participants (
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (interview_id, profile_id)
);
CREATE INDEX IF NOT EXISTS interview_participants_profile_idx ON public.interview_participants (profile_id);
ALTER TABLE public.interview_participants ENABLE ROW LEVEL SECURITY;

-- ── Scorecards ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scorecards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  author_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage_key      text NOT NULL CHECK (char_length(stage_key) <= 40),
  -- {"c1": 3, "c2": 4} — 1 (insuffisant) … 4 (excellent)
  ratings        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ratings) = 'object'),
  comments       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(comments) = 'object'),
  summary        text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 3000),
  recommendation text CHECK (recommendation IN ('strong_yes', 'yes', 'no', 'strong_no')),
  submitted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, author_id, stage_key),
  CHECK (submitted_at IS NULL OR recommendation IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS scorecards_author_idx ON public.scorecards (author_id);
ALTER TABLE public.scorecards ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS scorecards_touch ON public.scorecards;
CREATE TRIGGER scorecards_touch BEFORE UPDATE ON public.scorecards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── E-mail templates (editable by HR) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_templates (
  key        text PRIMARY KEY CHECK (key IN ('acknowledgement', 'rejection', 'invitation', 'offer')),
  subject    text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 6000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
INSERT INTO public.email_templates (key, subject, body) VALUES
('acknowledgement', 'Votre candidature — {poste}', 'Bonjour {prenom},

Merci pour votre candidature au poste « {poste} » chez {entreprise}. Nous l’avons bien reçue.

Nous lisons chaque candidature avec attention et revenons vers vous, quelle que soit la suite, en général sous deux semaines.

Vous pouvez suivre votre candidature, ou la retirer, ici : {lien_suivi}

Bien cordialement,
L’équipe {entreprise}'),
('rejection', 'Votre candidature — {poste}', 'Bonjour {prenom},

Merci de l’intérêt que vous portez à {entreprise} et du temps consacré à votre candidature au poste « {poste} ».

Après examen attentif, nous ne donnerons pas suite pour ce poste. Cette décision ne remet pas en cause la qualité de votre parcours.

Nous vous souhaitons pleine réussite dans vos recherches.

Bien cordialement,
L’équipe {entreprise}'),
('invitation', 'Entretien — {poste}', 'Bonjour {prenom},

Merci pour votre candidature au poste « {poste} ». Nous serions ravis d’échanger avec vous :

{date}
{lieu}

Si ce créneau ne vous convient pas, répondez simplement à cet e-mail pour en proposer un autre.

À très bientôt,
L’équipe {entreprise}'),
('offer', 'Notre proposition — {poste}', 'Bonjour {prenom},

Nous avons beaucoup apprécié nos échanges et sommes heureux de vous proposer de rejoindre {entreprise} au poste « {poste} ».

Nous revenons vers vous très vite avec les détails de la proposition. N’hésitez pas à répondre à cet e-mail pour toute question.

Bien cordialement,
L’équipe {entreprise}')
ON CONFLICT (key) DO NOTHING;

-- ── Access: invited interviewers see the application they interview ─────────
CREATE OR REPLACE FUNCTION public.is_interviewer_of(p_application uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM interviews i JOIN interview_participants p ON p.interview_id = i.id
                 WHERE i.application_id = p_application AND p.profile_id = auth.uid() AND i.status <> 'cancelled')
$$;
REVOKE EXECUTE ON FUNCTION public.is_interviewer_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_interviewer_of(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_application(p_application uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM applications a WHERE a.id = p_application AND public.can_see_opening(a.opening_id))
      OR public.is_interviewer_of(p_application)
$$;

-- an interviewer reads the opening (title, stages, criteria) of the applications they interview
CREATE OR REPLACE FUNCTION public.interviews_on_opening(p_opening uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM applications a WHERE a.opening_id = p_opening AND public.is_interviewer_of(a.id))
$$;
REVOKE EXECUTE ON FUNCTION public.interviews_on_opening(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.interviews_on_opening(uuid) TO authenticated;

DROP POLICY IF EXISTS job_openings_interviewer ON public.job_openings;
CREATE POLICY job_openings_interviewer ON public.job_openings
  FOR SELECT TO authenticated USING (public.interviews_on_opening(id));

DROP POLICY IF EXISTS applications_read ON public.applications;
CREATE POLICY applications_read ON public.applications
  FOR SELECT TO authenticated USING (public.can_see_opening(opening_id) OR public.is_interviewer_of(id));
DROP POLICY IF EXISTS candidates_read ON public.candidates;
CREATE POLICY candidates_read ON public.candidates
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = candidates.id AND public.can_see_application(a.id)));

-- interviews: whoever follows the application reads them; recruiters and the hiring manager plan them (server route)
CREATE POLICY interviews_read ON public.interviews
  FOR SELECT TO authenticated USING (public.can_see_application(application_id));
CREATE POLICY interview_participants_read ON public.interview_participants
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interviews i WHERE i.id = interview_id AND public.can_see_application(i.application_id)));

-- scorecards: write your own while it is a draft; read your own, all of them as a
-- recruiter / hiring manager, or the others' once yours is submitted (independent judgement)
CREATE POLICY scorecards_insert_own ON public.scorecards
  FOR INSERT TO authenticated WITH CHECK (author_id = (SELECT auth.uid()) AND public.can_see_application(application_id));
CREATE POLICY scorecards_update_draft ON public.scorecards
  FOR UPDATE TO authenticated USING (author_id = (SELECT auth.uid()) AND submitted_at IS NULL)
  WITH CHECK (author_id = (SELECT auth.uid()));
-- (security definer helper: a policy on scorecards must not query scorecards under RLS)
CREATE OR REPLACE FUNCTION public.has_submitted_scorecard(p_application uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM scorecards WHERE application_id = p_application AND author_id = auth.uid() AND submitted_at IS NOT NULL)
$$;
REVOKE EXECUTE ON FUNCTION public.has_submitted_scorecard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_submitted_scorecard(uuid) TO authenticated;

CREATE POLICY scorecards_read ON public.scorecards
  FOR SELECT TO authenticated USING (
    author_id = (SELECT auth.uid())
    OR (submitted_at IS NOT NULL AND (
      EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND public.can_see_opening(a.opening_id))
      OR public.has_submitted_scorecard(application_id))));

CREATE POLICY email_templates_read ON public.email_templates
  FOR SELECT TO authenticated USING ((SELECT public.is_recruiter()) OR EXISTS (SELECT 1 FROM job_openings o WHERE o.hiring_manager_id = (SELECT auth.uid())));
CREATE POLICY email_templates_write ON public.email_templates
  FOR UPDATE TO authenticated USING ((SELECT public.is_recruiter())) WITH CHECK ((SELECT public.is_recruiter()));

GRANT SELECT ON public.interviews, public.interview_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scorecards TO authenticated;
GRANT SELECT ON public.email_templates TO authenticated;
GRANT UPDATE (subject, body, updated_at) ON public.email_templates TO authenticated;

-- ── Activity kinds and notifications of lot 2 ───────────────────────────────
ALTER TABLE public.application_events DROP CONSTRAINT IF EXISTS application_events_kind_check;
ALTER TABLE public.application_events ADD CONSTRAINT application_events_kind_check CHECK (kind IN (
  'submitted', 'stage', 'note', 'email', 'rejected', 'restored', 'withdrawn', 'interview', 'scorecard', 'hired', 'erased'));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'request_submitted', 'manager_approved', 'approved', 'rejected',
  'cancel_requested', 'cancel_approved', 'cancel_refused', 'application_received', 'interview_scheduled'));

-- a submitted scorecard shows in the activity feed (without its content)
CREATE OR REPLACE FUNCTION public.log_scorecard_submitted()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.submitted_at IS NULL) THEN
    INSERT INTO application_events (application_id, actor_id, kind, data)
    VALUES (NEW.application_id, NEW.author_id, 'scorecard', jsonb_build_object('stage', NEW.stage_key, 'recommendation', NEW.recommendation));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS scorecards_submitted ON public.scorecards;
CREATE TRIGGER scorecards_submitted AFTER INSERT OR UPDATE OF submitted_at ON public.scorecards
  FOR EACH ROW EXECUTE FUNCTION public.log_scorecard_submitted();

-- HR (is_hr) plans interviews with anyone: they read every profile (granted columns only)
DROP POLICY IF EXISTS profiles_select_recruiter ON public.profiles;
CREATE POLICY profiles_select_recruiter ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT public.is_recruiter()));

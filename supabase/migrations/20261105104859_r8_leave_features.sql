-- =============================================================================
-- Lot R8 (part 1): leave features that need the database
--   A. working days, public holidays per country, half days
--   B. cancel / edit a request (statuses cancel_requested, cancelled)
--   C. refusal reason
--   D. in-app notifications
-- Spec: vault Tando/Tasks/R8-Spec.md. Same rules as lot 0: every write goes
-- through SECURITY DEFINER RPCs, NULL-safe role checks, minimal grants.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1. Country of a person, public holidays
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'FR'
    CHECK (country ~ '^[A-Z]{2}$');

GRANT SELECT (country) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.public_holidays (
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  day     date NOT NULL,
  name    text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  PRIMARY KEY (country, day)
);
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_holidays_select ON public.public_holidays
  FOR SELECT TO authenticated USING (true);
CREATE POLICY public_holidays_insert_admin ON public.public_holidays
  FOR INSERT TO authenticated WITH CHECK (public.auth_role() = 'admin');
CREATE POLICY public_holidays_delete_admin ON public.public_holidays
  FOR DELETE TO authenticated USING (public.auth_role() = 'admin');

GRANT SELECT, INSERT, DELETE ON public.public_holidays TO authenticated;

-- Easter Sunday (anonymous Gregorian algorithm)
CREATE OR REPLACE FUNCTION public.easter_sunday(p_year int)
  RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
BEGIN
  a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mo := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_year, mo, dy);
END;
$$;

-- Seed: national public holidays 2026–2027 for the main European countries.
-- Admins add regional days themselves (Congés et règles › Jours fériés).
DO $$
DECLARE
  y int; e date;
  first_mon_may date; first_mon_jun date; first_mon_aug date; first_mon_feb date; last_mon_oct date;
BEGIN
  FOR y IN 2026..2027 LOOP
    e := public.easter_sunday(y);
    first_mon_feb := make_date(y, 2, 1) + ((8 - EXTRACT(ISODOW FROM make_date(y, 2, 1))::int) % 7);
    first_mon_may := make_date(y, 5, 1) + ((8 - EXTRACT(ISODOW FROM make_date(y, 5, 1))::int) % 7);
    first_mon_jun := make_date(y, 6, 1) + ((8 - EXTRACT(ISODOW FROM make_date(y, 6, 1))::int) % 7);
    first_mon_aug := make_date(y, 8, 1) + ((8 - EXTRACT(ISODOW FROM make_date(y, 8, 1))::int) % 7);
    last_mon_oct  := make_date(y, 10, 31) - ((EXTRACT(ISODOW FROM make_date(y, 10, 31))::int + 6) % 7);

    INSERT INTO public.public_holidays (country, day, name) VALUES
      -- France
      ('FR', make_date(y, 1, 1), 'Jour de l''an'), ('FR', e + 1, 'Lundi de Pâques'), ('FR', make_date(y, 5, 1), 'Fête du Travail'),
      ('FR', make_date(y, 5, 8), 'Victoire 1945'), ('FR', e + 39, 'Ascension'), ('FR', e + 50, 'Lundi de Pentecôte'),
      ('FR', make_date(y, 7, 14), 'Fête nationale'), ('FR', make_date(y, 8, 15), 'Assomption'), ('FR', make_date(y, 11, 1), 'Toussaint'),
      ('FR', make_date(y, 11, 11), 'Armistice 1918'), ('FR', make_date(y, 12, 25), 'Noël'),
      -- Belgium
      ('BE', make_date(y, 1, 1), 'Nouvel An'), ('BE', e + 1, 'Lundi de Pâques'), ('BE', make_date(y, 5, 1), 'Fête du Travail'),
      ('BE', e + 39, 'Ascension'), ('BE', e + 50, 'Lundi de Pentecôte'), ('BE', make_date(y, 7, 21), 'Fête nationale'),
      ('BE', make_date(y, 8, 15), 'Assomption'), ('BE', make_date(y, 11, 1), 'Toussaint'), ('BE', make_date(y, 11, 11), 'Armistice'),
      ('BE', make_date(y, 12, 25), 'Noël'),
      -- Luxembourg
      ('LU', make_date(y, 1, 1), 'Nouvel An'), ('LU', e + 1, 'Lundi de Pâques'), ('LU', make_date(y, 5, 1), 'Fête du Travail'),
      ('LU', make_date(y, 5, 9), 'Journée de l''Europe'), ('LU', e + 39, 'Ascension'), ('LU', e + 50, 'Lundi de Pentecôte'),
      ('LU', make_date(y, 6, 23), 'Fête nationale'), ('LU', make_date(y, 8, 15), 'Assomption'), ('LU', make_date(y, 11, 1), 'Toussaint'),
      ('LU', make_date(y, 12, 25), 'Noël'), ('LU', make_date(y, 12, 26), 'Saint-Étienne'),
      -- Germany (national days only)
      ('DE', make_date(y, 1, 1), 'Neujahr'), ('DE', e - 2, 'Karfreitag'), ('DE', e + 1, 'Ostermontag'), ('DE', make_date(y, 5, 1), 'Tag der Arbeit'),
      ('DE', e + 39, 'Christi Himmelfahrt'), ('DE', e + 50, 'Pfingstmontag'), ('DE', make_date(y, 10, 3), 'Tag der Deutschen Einheit'),
      ('DE', make_date(y, 12, 25), '1. Weihnachtstag'), ('DE', make_date(y, 12, 26), '2. Weihnachtstag'),
      -- Austria
      ('AT', make_date(y, 1, 1), 'Neujahr'), ('AT', make_date(y, 1, 6), 'Heilige Drei Könige'), ('AT', e + 1, 'Ostermontag'),
      ('AT', make_date(y, 5, 1), 'Staatsfeiertag'), ('AT', e + 39, 'Christi Himmelfahrt'), ('AT', e + 50, 'Pfingstmontag'),
      ('AT', e + 60, 'Fronleichnam'), ('AT', make_date(y, 8, 15), 'Mariä Himmelfahrt'), ('AT', make_date(y, 10, 26), 'Nationalfeiertag'),
      ('AT', make_date(y, 11, 1), 'Allerheiligen'), ('AT', make_date(y, 12, 8), 'Mariä Empfängnis'), ('AT', make_date(y, 12, 25), 'Christtag'),
      ('AT', make_date(y, 12, 26), 'Stefanitag'),
      -- Spain (national days only)
      ('ES', make_date(y, 1, 1), 'Año Nuevo'), ('ES', make_date(y, 1, 6), 'Epifanía'), ('ES', e - 2, 'Viernes Santo'),
      ('ES', make_date(y, 5, 1), 'Fiesta del Trabajo'), ('ES', make_date(y, 8, 15), 'Asunción'), ('ES', make_date(y, 10, 12), 'Fiesta Nacional'),
      ('ES', make_date(y, 11, 1), 'Todos los Santos'), ('ES', make_date(y, 12, 6), 'Día de la Constitución'), ('ES', make_date(y, 12, 8), 'Inmaculada Concepción'),
      ('ES', make_date(y, 12, 25), 'Navidad'),
      -- Italy
      ('IT', make_date(y, 1, 1), 'Capodanno'), ('IT', make_date(y, 1, 6), 'Epifania'), ('IT', e + 1, 'Lunedì dell''Angelo'),
      ('IT', make_date(y, 4, 25), 'Festa della Liberazione'), ('IT', make_date(y, 5, 1), 'Festa del Lavoro'), ('IT', make_date(y, 6, 2), 'Festa della Repubblica'),
      ('IT', make_date(y, 8, 15), 'Ferragosto'), ('IT', make_date(y, 11, 1), 'Ognissanti'), ('IT', make_date(y, 12, 8), 'Immacolata Concezione'),
      ('IT', make_date(y, 12, 25), 'Natale'), ('IT', make_date(y, 12, 26), 'Santo Stefano'),
      -- Netherlands
      ('NL', make_date(y, 1, 1), 'Nieuwjaarsdag'), ('NL', e + 1, 'Tweede Paasdag'),
      ('NL', CASE WHEN EXTRACT(ISODOW FROM make_date(y, 4, 27)) = 7 THEN make_date(y, 4, 26) ELSE make_date(y, 4, 27) END, 'Koningsdag'),
      ('NL', e + 39, 'Hemelvaartsdag'), ('NL', e + 50, 'Tweede Pinksterdag'), ('NL', make_date(y, 12, 25), 'Eerste Kerstdag'),
      ('NL', make_date(y, 12, 26), 'Tweede Kerstdag'),
      -- Portugal
      ('PT', make_date(y, 1, 1), 'Ano Novo'), ('PT', e - 2, 'Sexta-feira Santa'), ('PT', make_date(y, 4, 25), 'Dia da Liberdade'),
      ('PT', make_date(y, 5, 1), 'Dia do Trabalhador'), ('PT', make_date(y, 6, 10), 'Dia de Portugal'), ('PT', e + 60, 'Corpo de Deus'),
      ('PT', make_date(y, 8, 15), 'Assunção'), ('PT', make_date(y, 10, 5), 'Implantação da República'), ('PT', make_date(y, 11, 1), 'Todos os Santos'),
      ('PT', make_date(y, 12, 1), 'Restauração da Independência'), ('PT', make_date(y, 12, 8), 'Imaculada Conceição'), ('PT', make_date(y, 12, 25), 'Natal'),
      -- Ireland
      ('IE', make_date(y, 1, 1), 'New Year''s Day'),
      ('IE', CASE WHEN EXTRACT(ISODOW FROM make_date(y, 2, 1)) = 5 THEN make_date(y, 2, 1) ELSE first_mon_feb END, 'St Brigid''s Day'),
      ('IE', make_date(y, 3, 17), 'St Patrick''s Day'), ('IE', e + 1, 'Easter Monday'), ('IE', first_mon_may, 'May Bank Holiday'),
      ('IE', first_mon_jun, 'June Bank Holiday'), ('IE', first_mon_aug, 'August Bank Holiday'), ('IE', last_mon_oct, 'October Bank Holiday'),
      ('IE', make_date(y, 12, 25), 'Christmas Day'), ('IE', make_date(y, 12, 26), 'St Stephen''s Day')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- A2. Half days: decimal day counts, half-day flags
-- -----------------------------------------------------------------------------
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_days_count_check;
ALTER TABLE public.leave_requests ALTER COLUMN days_count TYPE numeric(5,1);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_days_count_check CHECK (days_count >= 0.5);
ALTER TABLE public.leave_balances ALTER COLUMN allocated_days TYPE numeric(5,1);
ALTER TABLE public.leave_balances ALTER COLUMN used_days TYPE numeric(5,1);

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS start_half boolean NOT NULL DEFAULT false,  -- starts in the afternoon
  ADD COLUMN IF NOT EXISTS end_half   boolean NOT NULL DEFAULT false,  -- ends at noon
  ADD COLUMN IF NOT EXISTS review_comment text CHECK (char_length(review_comment) <= 500),
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- B. statuses
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'manager_approved', 'approved', 'rejected', 'cancel_requested', 'cancelled'));

-- Approved leave awaiting a cancellation is still taken: colleagues keep seeing it
DROP POLICY IF EXISTS leave_requests_select_employee_team_approved ON public.leave_requests;
CREATE POLICY leave_requests_select_employee_team_approved ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'employee'
    AND status IN ('approved', 'cancel_requested')
    AND public.auth_team_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles requester
                WHERE requester.id = leave_requests.user_id AND requester.team_id = public.auth_team_id())
  );

-- -----------------------------------------------------------------------------
-- A3. Day counting (working days, holidays of the person's country, half days)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_leave_days(
  p_user_id uuid, p_start date, p_end date, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false
)
  RETURNS numeric
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_country text;
  v_days    numeric := 0;
  v_day     date;
  v_working boolean;
BEGIN
  SELECT country INTO v_country FROM profiles WHERE id = p_user_id;
  v_country := COALESCE(v_country, 'FR');
  IF p_start = p_end AND p_start_half AND p_end_half THEN
    RAISE EXCEPTION 'Une demande d''une journée ne peut pas commencer l''après-midi et finir le matin';
  END IF;
  v_day := p_start;
  WHILE v_day <= p_end LOOP
    v_working := EXTRACT(ISODOW FROM v_day) < 6
      AND NOT EXISTS (SELECT 1 FROM public_holidays h WHERE h.country = v_country AND h.day = v_day);
    IF v_working THEN
      v_days := v_days + 1;
      IF v_day = p_start AND p_start_half THEN v_days := v_days - 0.5; END IF;
      IF v_day = p_end AND p_end_half THEN v_days := v_days - 0.5; END IF;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN v_days;
END;
$$;

-- Shared validation for create / update. Returns the day count. Not exposed.
CREATE OR REPLACE FUNCTION public._validate_leave(
  p_user_id uuid, p_leave_type_id uuid, p_start date, p_end date,
  p_start_half boolean, p_end_half boolean, p_exclude_id uuid
)
  RETURNS numeric
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_days     numeric;
  v_year     int := EXTRACT(YEAR FROM p_start)::int;
  v_balance  leave_balances;
  v_pending  numeric;
  v_c_start  date;
  v_c_end    date;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Les dates de début et de fin sont obligatoires';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début';
  END IF;
  IF p_start < CURRENT_DATE THEN
    RAISE EXCEPTION 'La date de début ne peut pas être dans le passé';
  END IF;
  IF EXTRACT(YEAR FROM p_end)::int <> v_year THEN
    RAISE EXCEPTION 'Une demande ne peut pas chevaucher deux années : posez une demande par année';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE id = p_leave_type_id AND is_active) THEN
    RAISE EXCEPTION 'Ce type de congé n''est pas disponible';
  END IF;

  v_days := public.count_leave_days(p_user_id, p_start, p_end, p_start_half, p_end_half);
  IF v_days <= 0 THEN
    RAISE EXCEPTION 'Cette période ne contient aucun jour ouvré';
  END IF;

  SELECT start_date, end_date INTO v_c_start, v_c_end
  FROM leave_requests
  WHERE user_id = p_user_id
    AND id IS DISTINCT FROM p_exclude_id
    AND status IN ('pending', 'manager_approved', 'approved', 'cancel_requested')
    AND start_date <= p_end AND end_date >= p_start
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Vous avez déjà une demande du % au % sur cette période',
      TO_CHAR(v_c_start, 'DD/MM/YYYY'), TO_CHAR(v_c_end, 'DD/MM/YYYY');
  END IF;

  SELECT * INTO v_balance FROM leave_balances
  WHERE user_id = p_user_id AND leave_type_id = p_leave_type_id AND year = v_year;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun solde configuré pour ce type de congé';
  END IF;

  SELECT COALESCE(SUM(days_count), 0) INTO v_pending
  FROM leave_requests
  WHERE user_id = p_user_id AND leave_type_id = p_leave_type_id
    AND id IS DISTINCT FROM p_exclude_id
    AND EXTRACT(YEAR FROM start_date)::int = v_year
    AND status IN ('pending', 'manager_approved');

  IF v_balance.allocated_days - v_balance.used_days - v_pending < v_days THEN
    RAISE EXCEPTION 'Solde insuffisant — vous demandez % jour(s) mais il ne vous en reste que % (demandes en attente comprises)',
      v_days, GREATEST(v_balance.allocated_days - v_balance.used_days - v_pending, 0);
  END IF;

  RETURN v_days;
END;
$$;

-- Day count preview for the signed-in user (same rule as the server)
CREATE OR REPLACE FUNCTION public.preview_leave_days(p_start date, p_end date, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false)
  RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  RETURN public.count_leave_days(auth.uid(), p_start, p_end, p_start_half, p_end_half);
END;
$$;

DROP FUNCTION IF EXISTS public.create_leave_request(uuid, date, date, text);
CREATE OR REPLACE FUNCTION public.create_leave_request(
  p_leave_type_id uuid, p_start_date date, p_end_date date, p_comment text DEFAULT NULL,
  p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false
)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_days numeric;
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  v_days := public._validate_leave(v_user, p_leave_type_id, p_start_date, p_end_date, p_start_half, p_end_half, NULL);
  INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, days_count, comment, start_half, end_half)
  VALUES (v_user, p_leave_type_id, p_start_date, p_end_date, v_days, NULLIF(btrim(p_comment), ''), p_start_half, p_end_half)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- B. Edit (pending only) and cancel
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_leave_request_update()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- update_leave_request sets this flag for the current transaction only
  IF current_setting('wakabods.allow_leave_edit', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id       IS DISTINCT FROM OLD.user_id
  OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
  OR NEW.start_date    IS DISTINCT FROM OLD.start_date
  OR NEW.end_date      IS DISTINCT FROM OLD.end_date
  OR NEW.days_count    IS DISTINCT FROM OLD.days_count
  OR NEW.start_half    IS DISTINCT FROM OLD.start_half
  OR NEW.end_half      IS DISTINCT FROM OLD.end_half
  THEN
    RAISE EXCEPTION 'Une demande ne peut pas être modifiée après sa création' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_leave_request(
  p_request_id uuid, p_leave_type_id uuid, p_start_date date, p_end_date date,
  p_comment text DEFAULT NULL, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false
)
  RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req  leave_requests;
  v_days numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.user_id <> v_user THEN
    RAISE EXCEPTION 'Demande introuvable' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Seule une demande en attente peut être modifiée';
  END IF;
  v_days := public._validate_leave(v_user, p_leave_type_id, p_start_date, p_end_date, p_start_half, p_end_half, p_request_id);
  PERFORM set_config('wakabods.allow_leave_edit', 'on', true);
  UPDATE leave_requests
  SET leave_type_id = p_leave_type_id, start_date = p_start_date, end_date = p_end_date,
      days_count = v_days, comment = NULLIF(btrim(p_comment), ''), start_half = p_start_half, end_half = p_end_half
  WHERE id = p_request_id;
  PERFORM set_config('wakabods.allow_leave_edit', 'off', true);
  RETURN v_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_leave_request(p_request_id uuid)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req  leave_requests;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.user_id <> v_user THEN
    RAISE EXCEPTION 'Demande introuvable' USING ERRCODE = '42501';
  END IF;

  IF v_req.status IN ('pending', 'manager_approved') THEN
    UPDATE leave_requests SET status = 'cancelled', cancelled_at = now() WHERE id = p_request_id;
    RETURN 'cancelled';
  ELSIF v_req.status = 'approved' THEN
    IF v_req.start_date <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Un congé déjà commencé ne peut pas être annulé';
    END IF;
    UPDATE leave_requests SET status = 'cancel_requested', cancel_requested_at = now() WHERE id = p_request_id;
    RETURN 'cancel_requested';
  ELSE
    RAISE EXCEPTION 'Cette demande ne peut pas être annulée';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_cancellation(p_request_id uuid, p_decision text)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req leave_requests;
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Décision invalide : %', p_decision;
  END IF;
  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'cancel_requested' THEN
    RAISE EXCEPTION 'Aucune annulation en attente pour cette demande';
  END IF;
  IF p_decision = 'approve' THEN
    UPDATE leave_requests SET status = 'cancelled', cancelled_at = now() WHERE id = p_request_id;
    RETURN 'cancelled';
  END IF;
  UPDATE leave_requests SET status = 'approved', cancel_requested_at = NULL WHERE id = p_request_id;
  RETURN 'approved';
END;
$$;

-- Balance: approved and cancel_requested are both "taken"; days come back on cancelled
CREATE OR REPLACE FUNCTION public.update_leave_balance()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_year    int := EXTRACT(YEAR FROM COALESCE(NEW.start_date, OLD.start_date))::int;
  v_balance leave_balances%ROWTYPE;
  v_new_taken boolean := NEW.status IN ('approved', 'cancel_requested');
  v_old_taken boolean := TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'cancel_requested');
BEGIN
  IF v_new_taken AND NOT v_old_taken THEN
    SELECT * INTO v_balance FROM leave_balances
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = v_year;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année';
    END IF;
    IF (v_balance.allocated_days - v_balance.used_days) < NEW.days_count THEN
      RAISE EXCEPTION 'Solde insuffisant — % jour(s) restant(s) pour ce type de congé',
        (v_balance.allocated_days - v_balance.used_days);
    END IF;
    UPDATE leave_balances SET used_days = used_days + NEW.days_count WHERE id = v_balance.id;
  ELSIF v_old_taken AND NOT v_new_taken THEN
    UPDATE leave_balances SET used_days = GREATEST(0, used_days - OLD.days_count)
    WHERE user_id = OLD.user_id AND leave_type_id = OLD.leave_type_id AND year = v_year;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- C. Review with a reason (mandatory to refuse)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.review_leave_request(uuid, text);
CREATE OR REPLACE FUNCTION public.review_leave_request(p_request_id uuid, p_decision text, p_comment text DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_role       text := public.auth_role();
  v_request    leave_requests;
  v_req_team   uuid;
  v_new_status text;
  v_comment    text := NULLIF(btrim(p_comment), '');
BEGIN
  IF v_caller IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Décision invalide : %', p_decision;
  END IF;
  IF p_decision = 'reject' AND v_comment IS NULL THEN
    RAISE EXCEPTION 'Indiquez le motif du refus';
  END IF;
  IF char_length(v_comment) > 500 THEN
    RAISE EXCEPTION 'Le motif ne peut pas dépasser 500 caractères';
  END IF;

  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;

  IF v_role = 'manager' THEN
    SELECT team_id INTO v_req_team FROM profiles WHERE id = v_request.user_id;
    IF v_request.user_id = v_caller THEN
      RAISE EXCEPTION 'Vous ne pouvez pas valider votre propre demande' USING ERRCODE = '42501';
    END IF;
    IF v_req_team IS NULL OR v_req_team IS DISTINCT FROM public.auth_team_id() THEN
      RAISE EXCEPTION 'Cette demande n''appartient pas à votre équipe' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée'; END IF;
    v_new_status := CASE p_decision WHEN 'approve' THEN 'manager_approved' ELSE 'rejected' END;
    UPDATE leave_requests
    SET status = v_new_status, manager_reviewed_by = v_caller, manager_reviewed_at = now(), review_comment = v_comment
    WHERE id = p_request_id;
  ELSIF v_role = 'admin' THEN
    IF v_request.status NOT IN ('pending', 'manager_approved') THEN RAISE EXCEPTION 'Cette demande a déjà été traitée'; END IF;
    v_new_status := CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
    UPDATE leave_requests
    SET status = v_new_status, admin_reviewed_by = v_caller, admin_reviewed_at = now(),
        review_comment = COALESCE(v_comment, review_comment)
    WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN v_new_status;
END;
$$;

-- -----------------------------------------------------------------------------
-- D. Notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('request_submitted', 'manager_approved', 'approved', 'rejected',
                                           'cancel_requested', 'cancel_approved', 'cancel_refused')),
  request_id uuid REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.notifications TO authenticated;

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
    IF v_req.role = 'employee' THEN
      SELECT array_agg(id) INTO v_to FROM profiles WHERE role = 'manager' AND team_id = v_req.team_id AND id <> NEW.user_id;
    END IF;
    IF v_to IS NULL THEN
      SELECT array_agg(id) INTO v_to FROM profiles WHERE role = 'admin' AND id <> NEW.user_id;
    END IF;
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

DROP TRIGGER IF EXISTS trigger_notify_leave_event ON public.leave_requests;
CREATE TRIGGER trigger_notify_leave_event
  AFTER INSERT OR UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_event();

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  UPDATE notifications SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- Execute rights: only what the app calls
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.easter_sunday(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_leave_days(uuid, date, date, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._validate_leave(uuid, uuid, date, date, boolean, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_leave_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_leave_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_leave_request_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_leave_days(date, date, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_leave_request(uuid, date, date, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_leave_request(uuid, uuid, date, date, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_leave_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_cancellation(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_leave_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preview_leave_days(date, date, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_leave_request(uuid, date, date, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_leave_request(uuid, uuid, date, date, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_leave_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_cancellation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_leave_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

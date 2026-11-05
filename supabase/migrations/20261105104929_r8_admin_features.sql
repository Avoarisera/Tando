-- =============================================================================
-- Lot R8 (part 2): admin features
--   E. edit people and teams (invitation itself is a server route: service role)
--   F. company settings
--   G. invoice lines (PDF generated in the browser, stored in the existing bucket)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- E. People and teams
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_id uuid, p_first_name text, p_last_name text, p_role text,
  p_team_id uuid, p_country text, p_joined_at date
)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current text;
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('employee', 'manager', 'admin') THEN
    RAISE EXCEPTION 'Rôle invalide';
  END IF;
  IF btrim(coalesce(p_first_name, '')) = '' OR btrim(coalesce(p_last_name, '')) = '' THEN
    RAISE EXCEPTION 'Le prénom et le nom sont obligatoires';
  END IF;
  IF p_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Pays invalide';
  END IF;
  SELECT role INTO v_current FROM profiles WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personne introuvable'; END IF;

  IF v_current = 'admin' AND p_role <> 'admin' THEN
    IF p_id = auth.uid() THEN
      RAISE EXCEPTION 'Vous ne pouvez pas retirer votre propre rôle d''administrateur';
    END IF;
    IF (SELECT count(*) FROM profiles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'Il faut au moins un administrateur';
    END IF;
  END IF;

  UPDATE profiles
  SET first_name = btrim(p_first_name), last_name = btrim(p_last_name), role = p_role,
      team_id = p_team_id, country = p_country, joined_at = COALESCE(p_joined_at, joined_at)
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_team(p_id uuid, p_name text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_name, '')) = '' OR char_length(btrim(p_name)) > 60 THEN
    RAISE EXCEPTION 'Le nom de l''équipe est obligatoire (60 caractères maximum)';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO teams (name) VALUES (btrim(p_name)) RETURNING id INTO v_id;
  ELSE
    UPDATE teams SET name = btrim(p_name) WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Équipe introuvable'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- F. Company settings (one row)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  legal_name          text NOT NULL DEFAULT '' CHECK (char_length(legal_name) <= 120),
  vat_number          text NOT NULL DEFAULT '' CHECK (char_length(vat_number) <= 40),
  address             text NOT NULL DEFAULT '' CHECK (char_length(address) <= 300),
  iban                text NOT NULL DEFAULT '' CHECK (char_length(iban) <= 40),
  bic                 text NOT NULL DEFAULT '' CHECK (char_length(bic) <= 15),
  default_country     text NOT NULL DEFAULT 'FR' CHECK (default_country ~ '^[A-Z]{2}$'),
  invoice_prefix      text NOT NULL DEFAULT 'FAC' CHECK (char_length(invoice_prefix) BETWEEN 1 AND 12),
  next_invoice_number integer NOT NULL DEFAULT 1 CHECK (next_invoice_number >= 1),
  invoice_footer      text NOT NULL DEFAULT '' CHECK (char_length(invoice_footer) <= 500),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.company_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_settings_select_admin ON public.company_settings
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
CREATE POLICY company_settings_update_admin ON public.company_settings
  FOR UPDATE TO authenticated USING (public.auth_role() = 'admin') WITH CHECK (public.auth_role() = 'admin');
GRANT SELECT ON public.company_settings TO authenticated;
GRANT UPDATE (legal_name, vat_number, address, iban, bic, default_country, invoice_prefix,
              next_invoice_number, invoice_footer, updated_at) ON public.company_settings TO authenticated;

-- Next invoice reference, e.g. FAC-2026-004 (atomic: two admins never get the same number)
CREATE OR REPLACE FUNCTION public.claim_invoice_reference()
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_prefix text; v_num int; v_ref text;
BEGIN
  IF public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  -- Skip numbers already used by invoices typed by hand (row lock: no two admins get the same one)
  LOOP
    UPDATE company_settings SET next_invoice_number = next_invoice_number + 1, updated_at = now()
    WHERE id RETURNING invoice_prefix, next_invoice_number - 1 INTO v_prefix, v_num;
    v_ref := format('%s-%s-%s', v_prefix, EXTRACT(YEAR FROM CURRENT_DATE)::int, lpad(v_num::text, 3, '0'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invoices WHERE reference = v_ref);
  END LOOP;
  RETURN v_ref;
END;
$$;

-- -----------------------------------------------------------------------------
-- G. Invoice lines
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 300),
  quantity    numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  vat_rate    numeric(5,2)  NOT NULL DEFAULT 20 CHECK (vat_rate BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id, position);
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_admin ON public.invoice_lines
  FOR ALL TO authenticated USING (public.auth_role() = 'admin') WITH CHECK (public.auth_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;

-- -----------------------------------------------------------------------------
-- Execute rights
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, uuid, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_team(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_invoice_reference() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_team(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_reference() TO authenticated;

-- Custom initialization – runs after Supabase Postgres sets up the auth schema.

-- ── Profiles table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Jeder eingeloggte User darf sein eigenes Profil lesen
CREATE POLICY "users_read_own_profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- service_role darf alles (für n8n Admin-Operationen)
CREATE POLICY "service_role_full_access"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Trigger: Profil bei Registrierung anlegen ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Social Posts (bestehende Tabelle) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id             SERIAL PRIMARY KEY,
  topic          TEXT,
  hook           TEXT,
  post_text      TEXT,
  cta            TEXT,
  image_b64      TEXT,
  status         TEXT DEFAULT 'draft',
  n8n_resume_url TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  published_at   TIMESTAMPTZ
);

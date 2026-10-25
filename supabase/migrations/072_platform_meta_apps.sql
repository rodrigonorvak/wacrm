-- Apps Meta da plataforma (Cadastro Incorporado do WhatsApp).
-- Configurados apenas por administradores da plataforma; acesso somente via service_role.
CREATE TABLE IF NOT EXISTS public.platform_meta_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  app_id TEXT NOT NULL,
  api_version TEXT NOT NULL DEFAULT 'v21.0',
  config_id TEXT,
  app_secret_encrypted TEXT,
  system_token_encrypted TEXT,
  redirect_uri TEXT,
  instagram_app_id TEXT,
  webhook_verify_token TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_meta_apps_app_id_key
  ON public.platform_meta_apps (app_id);

ALTER TABLE public.platform_meta_apps ENABLE ROW LEVEL SECURITY;

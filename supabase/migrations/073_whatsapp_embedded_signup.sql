-- WhatsApp Embedded Signup (Cadastro Incorporado) + coexistence.
-- Existing rows stay as manual connections.
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (connection_type IN ('manual', 'embedded')),
  ADD COLUMN IF NOT EXISTS coexistence BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS platform_app_id UUID REFERENCES platform_meta_apps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

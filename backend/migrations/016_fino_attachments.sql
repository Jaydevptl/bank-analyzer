-- ============================================================
-- Fino Phase 2 · Migration 016
-- Table: fino_attachments
-- Generic file attachments — any record can hold N files
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text NOT NULL,
  source_id     uuid NOT NULL,
  file_name     text NOT NULL,
  file_url      text NOT NULL,
  file_size     integer,
  mime_type     text,
  uploaded_by   uuid,
  uploaded_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attach_source ON fino_attachments (source_module, source_id);

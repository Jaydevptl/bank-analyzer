-- ============================================================
-- Fino Phase 3c · Migration 050
-- Table: fino_gift_card_platforms (+ 5 seeds)
-- ============================================================

CREATE TABLE IF NOT EXISTS fino_gift_card_platforms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text UNIQUE NOT NULL,
  display_color text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

INSERT INTO fino_gift_card_platforms (name, display_color) VALUES
  ('Amazon',   '#FF9900'),
  ('Flipkart', '#2874F0'),
  ('Myntra',   '#FF3F6C'),
  ('Nykaa',    '#FC2779'),
  ('Other',    '#888888')
ON CONFLICT (name) DO NOTHING;

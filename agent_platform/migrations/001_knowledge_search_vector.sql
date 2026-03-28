-- Add full-text search vector to knowledge_articles
-- Run this migration in your Supabase SQL editor

ALTER TABLE knowledge_articles
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE knowledge_articles
SET search_vector = to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(body, '') || ' ' ||
  coalesce(category, '')
)
WHERE search_vector IS NULL;

-- Index for fast full-text search
CREATE INDEX IF NOT EXISTS knowledge_articles_search_idx
ON knowledge_articles USING gin(search_vector);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_knowledge_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.body, '') || ' ' ||
    coalesce(NEW.category, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_knowledge_search_vector_trigger ON knowledge_articles;

CREATE TRIGGER update_knowledge_search_vector_trigger
BEFORE INSERT OR UPDATE ON knowledge_articles
FOR EACH ROW EXECUTE FUNCTION update_knowledge_search_vector();

-- Add missing columns if not present
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS industry text DEFAULT 'generic',
ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS address_line2 text,
ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE agent_settings
ADD COLUMN IF NOT EXISTS voice_id text DEFAULT 'ava';

ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS label text,
ADD COLUMN IF NOT EXISTS monthly_cost numeric DEFAULT 2.00;

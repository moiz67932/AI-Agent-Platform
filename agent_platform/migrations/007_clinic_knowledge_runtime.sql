-- Normalized clinic knowledge runtime tables and hybrid FAQ retrieval
-- Safe to run multiple times

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  canonical_name text NOT NULL,
  display_name text NOT NULL,
  normalized_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  bookable boolean NOT NULL DEFAULT true,
  default_duration_minutes integer,
  sort_order integer,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  fact_type text NOT NULL,
  answer_text text NOT NULL,
  structured_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  source_ref text,
  content_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faq_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  category text NOT NULL,
  fact_type text,
  title text,
  chunk_text text NOT NULL,
  normalized_text text NOT NULL DEFAULT '',
  content_hash text NOT NULL,
  search_vector tsvector,
  embedding vector(1536),
  source_article_id uuid REFERENCES public.knowledge_articles(id) ON DELETE SET NULL,
  source_ref text,
  chunk_index integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_knowledge_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  trigger_source text NOT NULL DEFAULT 'unknown',
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_knowledge_sync_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS services_clinic_normalized_name_uidx
  ON public.services (clinic_id, normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS service_aliases_service_normalized_alias_uidx
  ON public.service_aliases (service_id, normalized_alias);

CREATE INDEX IF NOT EXISTS service_aliases_clinic_normalized_alias_idx
  ON public.service_aliases (clinic_id, normalized_alias);

CREATE INDEX IF NOT EXISTS services_org_clinic_active_idx
  ON public.services (organization_id, clinic_id, active, bookable);

CREATE UNIQUE INDEX IF NOT EXISTS service_facts_clinic_service_fact_hash_uidx
  ON public.service_facts (clinic_id, service_id, fact_type, content_hash);

CREATE INDEX IF NOT EXISTS service_facts_lookup_idx
  ON public.service_facts (organization_id, clinic_id, service_id, fact_type, active, priority);

CREATE UNIQUE INDEX IF NOT EXISTS faq_chunks_clinic_content_hash_uidx
  ON public.faq_chunks (clinic_id, content_hash);

CREATE INDEX IF NOT EXISTS faq_chunks_lookup_idx
  ON public.faq_chunks (organization_id, clinic_id, active, category, fact_type, service_id);

CREATE INDEX IF NOT EXISTS faq_chunks_search_idx
  ON public.faq_chunks USING gin (search_vector);

CREATE INDEX IF NOT EXISTS faq_chunks_embedding_idx
  ON public.faq_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_knowledge_sync_jobs_clinic_uidx
  ON public.clinic_knowledge_sync_jobs (clinic_id);

CREATE INDEX IF NOT EXISTS clinic_knowledge_sync_jobs_status_idx
  ON public.clinic_knowledge_sync_jobs (status, requested_at);

CREATE OR REPLACE FUNCTION public.update_faq_chunk_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_text := lower(
    regexp_replace(
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW.category, '') || ' ' ||
      coalesce(NEW.fact_type, '') || ' ' ||
      coalesce(NEW.chunk_text, ''),
      '\s+',
      ' ',
      'g'
    )
  );
  NEW.search_vector := to_tsvector(
    'english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.category, '') || ' ' ||
    coalesce(NEW.fact_type, '') || ' ' ||
    coalesce(NEW.chunk_text, '')
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_touch_updated_at ON public.services;
CREATE TRIGGER services_touch_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS service_aliases_touch_updated_at ON public.service_aliases;
CREATE TRIGGER service_aliases_touch_updated_at
BEFORE UPDATE ON public.service_aliases
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS service_facts_touch_updated_at ON public.service_facts;
CREATE TRIGGER service_facts_touch_updated_at
BEFORE UPDATE ON public.service_facts
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS clinic_knowledge_sync_jobs_touch_updated_at ON public.clinic_knowledge_sync_jobs;
CREATE TRIGGER clinic_knowledge_sync_jobs_touch_updated_at
BEFORE UPDATE ON public.clinic_knowledge_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS faq_chunks_search_vector_trigger ON public.faq_chunks;
CREATE TRIGGER faq_chunks_search_vector_trigger
BEFORE INSERT OR UPDATE ON public.faq_chunks
FOR EACH ROW
EXECUTE FUNCTION public.update_faq_chunk_search_vector();

CREATE OR REPLACE FUNCTION public.request_clinic_knowledge_sync(
  p_organization_id uuid,
  p_clinic_id uuid,
  p_trigger_source text DEFAULT 'manual',
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_clinic_id IS NULL OR p_organization_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.clinic_knowledge_sync_jobs (
    organization_id,
    clinic_id,
    status,
    trigger_source,
    reason,
    requested_at,
    updated_at,
    started_at,
    completed_at,
    last_error
  )
  VALUES (
    p_organization_id,
    p_clinic_id,
    'pending',
    coalesce(p_trigger_source, 'manual'),
    p_reason,
    now(),
    now(),
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (clinic_id)
  DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    status = 'pending',
    trigger_source = EXCLUDED.trigger_source,
    reason = COALESCE(EXCLUDED.reason, public.clinic_knowledge_sync_jobs.reason),
    requested_at = now(),
    updated_at = now(),
    started_at = NULL,
    completed_at = NULL,
    last_error = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_clinic_knowledge_sync_from_knowledge_articles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _clinic_id uuid := COALESCE(NEW.clinic_id, OLD.clinic_id);
  _organization_id uuid := COALESCE(NEW.organization_id, OLD.organization_id);
BEGIN
  PERFORM public.request_clinic_knowledge_sync(
    _organization_id,
    _clinic_id,
    'knowledge_articles',
    TG_OP
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_clinic_knowledge_sync_from_agent_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _agent_id uuid := COALESCE(NEW.agent_id, OLD.agent_id);
  _clinic_id uuid;
  _organization_id uuid := COALESCE(NEW.organization_id, OLD.organization_id);
BEGIN
  SELECT clinic_id INTO _clinic_id
  FROM public.agents
  WHERE id = _agent_id
  LIMIT 1;

  PERFORM public.request_clinic_knowledge_sync(
    _organization_id,
    _clinic_id,
    'agent_settings',
    TG_OP
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_clinic_knowledge_sync_from_clinics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _clinic_id uuid := COALESCE(NEW.id, OLD.id);
  _organization_id uuid := COALESCE(NEW.organization_id, OLD.organization_id);
BEGIN
  PERFORM public.request_clinic_knowledge_sync(
    _organization_id,
    _clinic_id,
    'clinics',
    TG_OP
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_clinic_knowledge_sync_from_clinic_hours()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _clinic_id uuid := COALESCE(NEW.clinic_id, OLD.clinic_id);
  _organization_id uuid := COALESCE(NEW.organization_id, OLD.organization_id);
BEGIN
  PERFORM public.request_clinic_knowledge_sync(
    _organization_id,
    _clinic_id,
    'clinic_hours',
    TG_OP
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS knowledge_articles_queue_clinic_knowledge_sync ON public.knowledge_articles;
CREATE TRIGGER knowledge_articles_queue_clinic_knowledge_sync
AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_articles
FOR EACH ROW
EXECUTE FUNCTION public.queue_clinic_knowledge_sync_from_knowledge_articles();

DROP TRIGGER IF EXISTS agent_settings_queue_clinic_knowledge_sync ON public.agent_settings;
CREATE TRIGGER agent_settings_queue_clinic_knowledge_sync
AFTER INSERT OR UPDATE OR DELETE ON public.agent_settings
FOR EACH ROW
EXECUTE FUNCTION public.queue_clinic_knowledge_sync_from_agent_settings();

DROP TRIGGER IF EXISTS clinics_queue_clinic_knowledge_sync ON public.clinics;
CREATE TRIGGER clinics_queue_clinic_knowledge_sync
AFTER INSERT OR UPDATE OR DELETE ON public.clinics
FOR EACH ROW
EXECUTE FUNCTION public.queue_clinic_knowledge_sync_from_clinics();

DROP TRIGGER IF EXISTS clinic_hours_queue_clinic_knowledge_sync ON public.clinic_hours;
CREATE TRIGGER clinic_hours_queue_clinic_knowledge_sync
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_hours
FOR EACH ROW
EXECUTE FUNCTION public.queue_clinic_knowledge_sync_from_clinic_hours();

CREATE OR REPLACE FUNCTION public.hybrid_search_faq_chunks(
  p_query_text text,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_clinic_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_fact_type text DEFAULT NULL,
  p_limit integer DEFAULT 5,
  p_fts_limit integer DEFAULT 12,
  p_semantic_limit integer DEFAULT 12,
  p_fts_weight double precision DEFAULT 1.25,
  p_semantic_weight double precision DEFAULT 0.85,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  clinic_id uuid,
  service_id uuid,
  category text,
  fact_type text,
  title text,
  chunk_text text,
  source_article_id uuid,
  source_ref text,
  chunk_index integer,
  fts_score double precision,
  semantic_score double precision,
  combined_score double precision,
  match_source text
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT *
    FROM public.faq_chunks
    WHERE active = true
      AND (p_clinic_id IS NULL OR clinic_id = p_clinic_id)
      AND (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND (p_service_id IS NULL OR service_id = p_service_id)
      AND (p_category IS NULL OR lower(category) = lower(p_category))
      AND (p_fact_type IS NULL OR lower(coalesce(fact_type, '')) = lower(p_fact_type))
  ),
  fts AS (
    SELECT
      f.id,
      ts_rank_cd(f.search_vector, websearch_to_tsquery('english', p_query_text))::double precision AS fts_score,
      row_number() OVER (
        ORDER BY ts_rank_cd(f.search_vector, websearch_to_tsquery('english', p_query_text)) DESC, f.updated_at DESC, f.id
      ) AS rank_position
    FROM filtered f
    WHERE coalesce(trim(p_query_text), '') <> ''
      AND f.search_vector @@ websearch_to_tsquery('english', p_query_text)
    ORDER BY fts_score DESC, f.updated_at DESC, f.id
    LIMIT GREATEST(p_limit, p_fts_limit)
  ),
  semantic AS (
    SELECT
      f.id,
      (1 - (f.embedding <=> p_query_embedding))::double precision AS semantic_score,
      row_number() OVER (
        ORDER BY f.embedding <=> p_query_embedding ASC, f.updated_at DESC, f.id
      ) AS rank_position
    FROM filtered f
    WHERE p_query_embedding IS NOT NULL
      AND f.embedding IS NOT NULL
    ORDER BY f.embedding <=> p_query_embedding ASC, f.updated_at DESC, f.id
    LIMIT GREATEST(p_limit, p_semantic_limit)
  ),
  candidate_ids AS (
    SELECT id FROM fts
    UNION
    SELECT id FROM semantic
  ),
  ranked AS (
    SELECT
      c.id,
      fts.fts_score,
      semantic.semantic_score,
      coalesce(p_fts_weight / (p_rrf_k + fts.rank_position), 0) +
      coalesce(p_semantic_weight / (p_rrf_k + semantic.rank_position), 0) AS combined_score,
      CASE
        WHEN fts.id IS NOT NULL AND semantic.id IS NOT NULL THEN 'fts+semantic'
        WHEN fts.id IS NOT NULL THEN 'fts'
        WHEN semantic.id IS NOT NULL THEN 'semantic'
        ELSE 'none'
      END AS match_source
    FROM candidate_ids c
    LEFT JOIN fts USING (id)
    LEFT JOIN semantic USING (id)
  )
  SELECT
    f.id,
    f.organization_id,
    f.clinic_id,
    f.service_id,
    f.category,
    f.fact_type,
    f.title,
    f.chunk_text,
    f.source_article_id,
    f.source_ref,
    f.chunk_index,
    r.fts_score,
    r.semantic_score,
    r.combined_score,
    r.match_source
  FROM ranked r
  JOIN filtered f ON f.id = r.id
  ORDER BY
    r.combined_score DESC,
    coalesce(r.fts_score, 0) DESC,
    coalesce(r.semantic_score, 0) DESC,
    f.updated_at DESC,
    f.id
  LIMIT GREATEST(1, p_limit);
$$;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_knowledge_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select ON public.services;
DROP POLICY IF EXISTS services_insert ON public.services;
DROP POLICY IF EXISTS services_update ON public.services;
DROP POLICY IF EXISTS services_delete ON public.services;

CREATE POLICY services_select ON public.services
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY services_insert ON public.services
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY services_update ON public.services
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY services_delete ON public.services
  FOR DELETE USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS service_aliases_select ON public.service_aliases;
DROP POLICY IF EXISTS service_aliases_insert ON public.service_aliases;
DROP POLICY IF EXISTS service_aliases_update ON public.service_aliases;
DROP POLICY IF EXISTS service_aliases_delete ON public.service_aliases;

CREATE POLICY service_aliases_select ON public.service_aliases
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY service_aliases_insert ON public.service_aliases
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY service_aliases_update ON public.service_aliases
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY service_aliases_delete ON public.service_aliases
  FOR DELETE USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS service_facts_select ON public.service_facts;
DROP POLICY IF EXISTS service_facts_insert ON public.service_facts;
DROP POLICY IF EXISTS service_facts_update ON public.service_facts;
DROP POLICY IF EXISTS service_facts_delete ON public.service_facts;

CREATE POLICY service_facts_select ON public.service_facts
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY service_facts_insert ON public.service_facts
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY service_facts_update ON public.service_facts
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY service_facts_delete ON public.service_facts
  FOR DELETE USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS faq_chunks_select ON public.faq_chunks;
DROP POLICY IF EXISTS faq_chunks_insert ON public.faq_chunks;
DROP POLICY IF EXISTS faq_chunks_update ON public.faq_chunks;
DROP POLICY IF EXISTS faq_chunks_delete ON public.faq_chunks;

CREATE POLICY faq_chunks_select ON public.faq_chunks
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY faq_chunks_insert ON public.faq_chunks
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY faq_chunks_update ON public.faq_chunks
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY faq_chunks_delete ON public.faq_chunks
  FOR DELETE USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS clinic_knowledge_sync_jobs_select ON public.clinic_knowledge_sync_jobs;
DROP POLICY IF EXISTS clinic_knowledge_sync_jobs_insert ON public.clinic_knowledge_sync_jobs;
DROP POLICY IF EXISTS clinic_knowledge_sync_jobs_update ON public.clinic_knowledge_sync_jobs;
DROP POLICY IF EXISTS clinic_knowledge_sync_jobs_delete ON public.clinic_knowledge_sync_jobs;

CREATE POLICY clinic_knowledge_sync_jobs_select ON public.clinic_knowledge_sync_jobs
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY clinic_knowledge_sync_jobs_insert ON public.clinic_knowledge_sync_jobs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY clinic_knowledge_sync_jobs_update ON public.clinic_knowledge_sync_jobs
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY clinic_knowledge_sync_jobs_delete ON public.clinic_knowledge_sync_jobs
  FOR DELETE USING (organization_id = get_user_org_id());

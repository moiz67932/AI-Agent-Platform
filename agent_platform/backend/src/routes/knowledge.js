import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { scrapeUrl, isValidScrapableUrl } from '../services/scraperService.js';

const router = Router();

// GET /api/knowledge/:clinicId
router.get('/:clinicId', async (req, res, next) => {
  try {
    const { clinicId } = req.params;
    const { q } = req.query;

    let query = supabase
      .from('knowledge_articles')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('organization_id', req.orgId)
      .order('updated_at', { ascending: false });

    if (q) {
      query = query.textSearch('search_vector', q, { type: 'websearch' });
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/knowledge/:clinicId
router.post('/:clinicId', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { clinicId } = req.params;
    const { data, error } = await supabase
      .from('knowledge_articles')
      .insert({
        ...req.body,
        clinic_id: clinicId,
        organization_id: req.orgId,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

// PUT /api/knowledge/:clinicId/:articleId
router.put('/:clinicId/:articleId', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { clinicId, articleId } = req.params;
    const { data, error } = await supabase
      .from('knowledge_articles')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', articleId)
      .eq('clinic_id', clinicId)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/:clinicId/:articleId
router.delete('/:clinicId/:articleId', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { clinicId, articleId } = req.params;
    const { error } = await supabase
      .from('knowledge_articles')
      .delete()
      .eq('id', articleId)
      .eq('clinic_id', clinicId)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// POST /api/knowledge/:clinicId/search
router.post('/:clinicId/search', async (req, res, next) => {
  try {
    const { clinicId } = req.params;
    const { query } = req.body;

    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('organization_id', req.orgId)
      .textSearch('search_vector', query, { type: 'websearch' })
      .limit(10);

    if (error) {
      // Fallback to ilike if tsvector not yet set up
      const { data: fallback } = await supabase
        .from('knowledge_articles')
        .select('*')
        .eq('clinic_id', clinicId)
        .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
        .limit(10);
      return res.json({ data: fallback || [] });
    }

    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/knowledge/:clinicId/import-url
router.post('/:clinicId/import-url', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { clinicId } = req.params;
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!isValidScrapableUrl(url)) return res.status(400).json({ error: 'Invalid or disallowed URL' });

    const { data: job, error: jobErr } = await supabase
      .from('scrape_jobs')
      .insert({ clinic_id: clinicId, organization_id: req.orgId, url, status: 'pending' })
      .select()
      .single();

    if (jobErr) throw jobErr;

    // Fire and forget
    (async () => {
      const { error: procErr } = await supabase
        .from('scrape_jobs')
        .update({ status: 'processing' })
        .eq('id', job.id);
      if (procErr) return;

      const result = await scrapeUrl(url);

      if (result.error) {
        await supabase.from('scrape_jobs').update({
          status: 'failed',
          error: result.error,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        return;
      }

      let articlesCreated = 0;
      for (const section of result.sections) {
        const { error: insertErr } = await supabase.from('knowledge_articles').insert({
          clinic_id: clinicId,
          organization_id: req.orgId,
          title: section.title || result.title,
          body: section.body,
          category: 'Imported',
          status: 'active',
        });
        if (!insertErr) articlesCreated++;
      }

      await supabase.from('scrape_jobs').update({
        status: 'done',
        articles_created: articlesCreated,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
    })();

    res.status(202).json({ jobId: job.id, message: 'Scraping started' });
  } catch (err) { next(err); }
});

// GET /api/knowledge/:clinicId/scrape-status/:jobId
router.get('/:clinicId/scrape-status/:jobId', async (req, res, next) => {
  try {
    const { clinicId, jobId } = req.params;
    const { data, error } = await supabase
      .from('scrape_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('clinic_id', clinicId)
      .eq('organization_id', req.orgId)
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

export default router;

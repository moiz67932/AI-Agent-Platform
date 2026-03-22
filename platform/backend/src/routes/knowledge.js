import { Router } from 'express';
import { supabase } from '../services/supabase.js';

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
router.post('/:clinicId', async (req, res, next) => {
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
router.put('/:clinicId/:articleId', async (req, res, next) => {
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
router.delete('/:clinicId/:articleId', async (req, res, next) => {
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
router.post('/:clinicId/import-url', async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Create a draft article from URL (real implementation would scrape)
    const { data, error } = await supabase
      .from('knowledge_articles')
      .insert({
        clinic_id: req.params.clinicId,
        organization_id: req.orgId,
        title: `Imported from ${new URL(url).hostname}`,
        body: 'Content imported from website. Please edit this article.',
        category: 'General',
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

export default router;

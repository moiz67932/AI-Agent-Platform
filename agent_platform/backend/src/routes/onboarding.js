import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();
const DEPLOY_API_URL = (process.env.DEPLOY_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

/**
 * POST /api/onboarding/complete
 * Creates all required records in the correct order:
 * organization → clinic → agent → agent_settings → knowledge_articles → phone_numbers
 */
router.post('/complete', async (req, res, next) => {
  try {
    const { industry, businessInfo, hours, services, agentConfig, knowledgeBase, phoneNumber } = req.body;
    const userId = req.user.id;

    // 1. Create or update organization
    let orgId = req.orgId;
    if (!orgId) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: businessInfo.name, owner_id: userId })
        .select()
        .single();
      if (orgError) throw orgError;
      orgId = org.id;
    }

    // 2. Create clinic
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .insert({
        organization_id: orgId,
        name: businessInfo.name,
        industry,
        timezone: businessInfo.timezone,
        phone: businessInfo.phone,
        email: businessInfo.email,
        address_line1: businessInfo.address_line1,
        address_line2: businessInfo.address_line2,
        city: businessInfo.city,
        state: businessInfo.state,
        zip: businessInfo.zip,
        country: businessInfo.country || 'US',
        website: businessInfo.website,
        working_hours: hours,
      })
      .select()
      .single();
    if (clinicError) throw clinicError;

    // 3. Create agent (status starts as 'offline' — publish-async will move it to deploying → live)
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        organization_id: orgId,
        clinic_id: clinic.id,
        name: agentConfig.name,
        status: 'offline',
        default_language: agentConfig.language || 'en',
        config_json: {
          twilio_existing_number: phoneNumber?.number
            ? (() => {
                const digits = (phoneNumber.number || '').replace(/\D/g, '');
                if (digits.length === 10) return `+1${digits}`;
                if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
                return digits.length > 0 ? `+${digits}` : null;
              })()
            : null,
          twilio_release_on_unpublish: false,
        },
      })
      .select()
      .single();
    if (agentError) throw agentError;

    // 4. Create agent_settings
    const treatmentDurations = {};
    services.forEach(s => { treatmentDurations[s.name] = s.duration; });

    const { error: settingsError } = await supabase
      .from('agent_settings')
      .insert({
        organization_id: orgId,
        agent_id: agent.id,
        greeting_text: agentConfig.greeting || `Hi, thanks for calling ${businessInfo.name}! This is ${agentConfig.name}.`,
        persona_tone: agentConfig.tone || 'warm',
        voice_id: agentConfig.voice_id || 'ava',
        config_json: {
          treatment_durations: treatmentDurations,
          services,
          emergency_handling: agentConfig.emergency_handling || false,
          emergency_script: agentConfig.emergency_script,
          collect_insurance: agentConfig.collect_insurance || false,
          cancellation_policy: agentConfig.cancellation_policy,
          custom_instructions: agentConfig.custom_instructions,
          agent_role: agentConfig.role || 'receptionist',
        },
      });
    if (settingsError) throw settingsError;

    // 5. Insert knowledge articles
    if (knowledgeBase?.articles?.length) {
      const articles = knowledgeBase.articles.map(a => ({
        organization_id: orgId,
        clinic_id: clinic.id,
        title: a.title,
        body: a.body,
        category: a.category || 'FAQ',
        status: 'active',
      }));
      await supabase.from('knowledge_articles').insert(articles);
    }

    // 6. Provision phone number
    let provisionedNumber = null;
    if (phoneNumber?.number) {
      const e164 = phoneNumber.number.replace(/\D/g, '');
      const { data: num } = await supabase
        .from('phone_numbers')
        .insert({
          organization_id: orgId,
          clinic_id: clinic.id,
          agent_id: agent.id,
          phone_number: phoneNumber.number,
          phone_e164: e164.startsWith('1') ? `+${e164}` : `+1${e164}`,
          status: 'active',
          monthly_cost: 2.00,
        })
        .select()
        .single();
      provisionedNumber = num;
    }

    // 7. Kick off async deploy — fire-and-forget; frontend polls /api/agents/:id/status
    try {
      await fetch(`${DEPLOY_API_URL}/api/agents/${agent.id}/publish-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (deployErr) {
      // Non-fatal: agent record is created, deploy will show as offline if this fails.
      console.error(`[onboarding] publish-async failed for agent ${agent.id}:`, deployErr);
    }

    res.status(201).json({
      data: {
        agent_id: agent.id,
        clinic_id: clinic.id,
        organization_id: orgId,
        phone_number: provisionedNumber?.phone_number,
      },
    });
  } catch (err) { next(err); }
});

export default router;

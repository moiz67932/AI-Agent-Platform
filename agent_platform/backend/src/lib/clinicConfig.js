const WEEKDAY_CONFIG = [
  { full: 'monday', short: 'mon', index: 0, label: 'Monday' },
  { full: 'tuesday', short: 'tue', index: 1, label: 'Tuesday' },
  { full: 'wednesday', short: 'wed', index: 2, label: 'Wednesday' },
  { full: 'thursday', short: 'thu', index: 3, label: 'Thursday' },
  { full: 'friday', short: 'fri', index: 4, label: 'Friday' },
  { full: 'saturday', short: 'sat', index: 5, label: 'Saturday' },
  { full: 'sunday', short: 'sun', index: 6, label: 'Sunday' },
];

const GENERATED_KNOWLEDGE_ARTICLES = [
  { title: 'Clinic Hours', category: 'Hours' },
  { title: 'Services Overview', category: 'Services' },
  { title: 'Service Pricing', category: 'Pricing' },
];

function defaultFullWorkingHours() {
  return {
    monday: { open: true, start: '09:00', end: '17:00' },
    tuesday: { open: true, start: '09:00', end: '17:00' },
    wednesday: { open: true, start: '09:00', end: '17:00' },
    thursday: { open: true, start: '09:00', end: '17:00' },
    friday: { open: true, start: '09:00', end: '17:00' },
    saturday: { open: false, start: '09:00', end: '13:00' },
    sunday: { open: false, start: '09:00', end: '13:00' },
  };
}

function normalizeTime(value, fallback) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function normalizeWorkingHours(input) {
  const full = defaultFullWorkingHours();

  if (!input || typeof input !== 'object') {
    return {
      full,
      compact: fullToCompactWorkingHours(full),
    };
  }

  for (const day of WEEKDAY_CONFIG) {
    const raw = input[day.full] ?? input[day.short];
    if (Array.isArray(raw)) {
      const interval = raw[0];
      if (!interval || typeof interval !== 'object') {
        full[day.full] = { ...full[day.full], open: false };
        continue;
      }
      full[day.full] = {
        open: raw.length > 0,
        start: normalizeTime(interval.start, full[day.full].start),
        end: normalizeTime(interval.end, full[day.full].end),
      };
      continue;
    }

    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const isClosed = raw.closed === true || raw.open === false;
    const explicitOpen = raw.open === true;
    const hasTimeRange = typeof raw.start === 'string' || typeof raw.end === 'string';
    const open = isClosed ? false : (explicitOpen || hasTimeRange);
    full[day.full] = {
      open,
      start: normalizeTime(raw.start, full[day.full].start),
      end: normalizeTime(raw.end, full[day.full].end),
    };
  }

  return {
    full,
    compact: fullToCompactWorkingHours(full),
  };
}

function fullToCompactWorkingHours(fullHours) {
  const compact = {};
  for (const day of WEEKDAY_CONFIG) {
    const schedule = fullHours?.[day.full];
    compact[day.short] = schedule?.open
      ? [{ start: normalizeTime(schedule.start, '09:00'), end: normalizeTime(schedule.end, '17:00') }]
      : [];
  }
  return compact;
}

function formatClock(time) {
  const [hourRaw, minuteRaw] = String(time || '09:00').split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return String(time || '');
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function buildHoursKnowledgeBody(fullHours) {
  return WEEKDAY_CONFIG.map((day) => {
    const schedule = fullHours?.[day.full];
    if (!schedule?.open) {
      return `${day.label}: Closed.`;
    }
    return `${day.label}: ${formatClock(schedule.start)} to ${formatClock(schedule.end)}.`;
  }).join(' ');
}

function buildServicesOverviewBody(services) {
  if (!services.length) {
    return null;
  }

  const parts = services.map((service) => {
    const duration = Number.isFinite(service.duration) ? `${service.duration} minutes` : 'duration varies';
    return `${service.name} (${duration})`;
  });

  if (parts.length === 1) {
    return `We currently offer ${parts[0]}.`;
  }

  return `We currently offer ${parts.join(', ')}.`;
}

function formatPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed === 0) {
    return 'Complimentary';
  }
  return `$${parsed.toFixed(parsed % 1 === 0 ? 0 : 2)}`;
}

function buildPricingBody(services) {
  if (!services.length) {
    return null;
  }

  const parts = services.map((service) => {
    const price = formatPrice(service.price);
    const duration = Number.isFinite(service.duration) ? `${service.duration} minutes` : 'duration varies';
    if (price) {
      return `${service.name}: ${price} (${duration}).`;
    }
    return `${service.name}: Please contact the clinic for current pricing (${duration}).`;
  });

  return parts.join(' ');
}

function sanitizeService(service) {
  const name = String(service?.name || '').trim();
  if (!name) {
    return null;
  }
  return {
    name,
    duration: Number.isFinite(Number(service?.duration)) ? Number(service.duration) : 30,
    price: service?.price ?? null,
    enabled: service?.enabled !== false,
  };
}

function normalizeServices(services) {
  if (!Array.isArray(services)) {
    return [];
  }
  return services
    .map(sanitizeService)
    .filter(Boolean);
}

function buildGeneratedKnowledgeArticles({
  organizationId,
  clinicId,
  fullHours,
  services,
}) {
  const normalizedServices = normalizeServices(services).filter((service) => service.enabled !== false);
  const articles = [
    {
      organization_id: organizationId,
      clinic_id: clinicId,
      title: 'Clinic Hours',
      body: buildHoursKnowledgeBody(fullHours),
      category: 'Hours',
      active: true,
    },
  ];

  const servicesBody = buildServicesOverviewBody(normalizedServices);
  if (servicesBody) {
    articles.push({
      organization_id: organizationId,
      clinic_id: clinicId,
      title: 'Services Overview',
      body: servicesBody,
      category: 'Services',
      active: true,
    });
  }

  const pricingBody = buildPricingBody(normalizedServices);
  if (pricingBody) {
    articles.push({
      organization_id: organizationId,
      clinic_id: clinicId,
      title: 'Service Pricing',
      body: pricingBody,
      category: 'Pricing',
      active: true,
    });
  }

  return articles;
}

function toKnowledgeArticleRecord(article) {
  const payload = { ...article };
  if ('status' in payload) {
    payload.active = payload.status !== 'draft';
    delete payload.status;
  }
  if (!('active' in payload)) {
    payload.active = true;
  }
  return payload;
}

function fromKnowledgeArticleRow(row) {
  return {
    ...row,
    status: row?.active === false ? 'draft' : 'active',
  };
}

async function syncClinicHoursTable(supabase, { organizationId, clinicId, fullHours }) {
  const buildRows = (indexResolver) => WEEKDAY_CONFIG.map((day) => {
    const schedule = fullHours?.[day.full];
    const isOpen = Boolean(schedule?.open);
    return {
      organization_id: organizationId,
      clinic_id: clinicId,
      weekday: indexResolver(day),
      open_time: isOpen ? normalizeTime(schedule.start, '09:00') : null,
      close_time: isOpen ? normalizeTime(schedule.end, '17:00') : null,
      closed: !isOpen,
    };
  });

  const { error: deleteError } = await supabase
    .from('clinic_hours')
    .delete()
    .eq('organization_id', organizationId)
    .eq('clinic_id', clinicId);

  if (deleteError) {
    throw deleteError;
  }

  const candidateResolvers = [
    (day) => day.index,
    (day) => (day.full === 'sunday' ? 0 : day.index + 1),
  ];

  let lastError = null;
  for (const resolver of candidateResolvers) {
    const rows = buildRows(resolver);
    const { error: insertError } = await supabase.from('clinic_hours').insert(rows);
    if (!insertError) {
      return;
    }

    lastError = insertError;
    const message = String(insertError.message || '');
    if (!message.includes('clinic_hours_weekday_check')) {
      throw insertError;
    }

    const { error: cleanupError } = await supabase
      .from('clinic_hours')
      .delete()
      .eq('organization_id', organizationId)
      .eq('clinic_id', clinicId);

    if (cleanupError) {
      throw cleanupError;
    }
  }

  throw lastError;
}

async function syncClinicHolidaysTable(supabase, { organizationId, clinicId, closedDates = [] }) {
  const { error: deleteError } = await supabase
    .from('clinic_holidays')
    .delete()
    .eq('organization_id', organizationId)
    .eq('clinic_id', clinicId);

  if (deleteError) {
    throw deleteError;
  }

  if (!closedDates.length) {
    return;
  }

  const rows = closedDates.map((closedDate) => ({
    organization_id: organizationId,
    clinic_id: clinicId,
    date: closedDate,
    description: 'Closed',
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from('clinic_holidays').insert(rows);
  if (insertError) {
    throw insertError;
  }
}

async function syncGeneratedKnowledgeArticles(
  supabase,
  { organizationId, clinicId, fullHours, services },
) {
  for (const article of GENERATED_KNOWLEDGE_ARTICLES) {
    const { error } = await supabase
      .from('knowledge_articles')
      .delete()
      .eq('organization_id', organizationId)
      .eq('clinic_id', clinicId)
      .eq('title', article.title)
      .eq('category', article.category);

    if (error) {
      throw error;
    }
  }

  const generatedArticles = buildGeneratedKnowledgeArticles({
    organizationId,
    clinicId,
    fullHours,
    services,
  });

  if (!generatedArticles.length) {
    return;
  }

  const { error } = await supabase.from('knowledge_articles').insert(generatedArticles);
  if (error) {
    throw error;
  }
}

export {
  WEEKDAY_CONFIG,
  defaultFullWorkingHours,
  normalizeWorkingHours,
  fullToCompactWorkingHours,
  normalizeServices,
  toKnowledgeArticleRecord,
  fromKnowledgeArticleRow,
  syncClinicHoursTable,
  syncClinicHolidaysTable,
  syncGeneratedKnowledgeArticles,
};

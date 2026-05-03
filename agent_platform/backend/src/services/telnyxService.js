const TELNYX_API_BASE_URL = (process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2').replace(/\/$/, '');

function resolveApiKey(apiKey) {
  return (apiKey || process.env.TELNYX_API_KEY || '').trim();
}

function isSuccessStatus(status, expectedStatuses) {
  return expectedStatuses.includes(status);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function telnyxRequest({ method, path, apiKey, params, jsonBody, expectedStatuses = [200, 201, 202] }) {
  const resolvedApiKey = resolveApiKey(apiKey);
  if (!resolvedApiKey) throw new Error('TELNYX_API_KEY is not configured');

  const url = new URL(`${TELNYX_API_BASE_URL}/${path.replace(/^\//, '')}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && String(value).length > 0) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${resolvedApiKey}`,
      Accept: 'application/json',
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(jsonBody ? { body: JSON.stringify(jsonBody) } : {}),
  });

  const payload = await parseResponse(response);
  if (!isSuccessStatus(response.status, expectedStatuses)) {
    const message =
      payload?.errors?.[0]?.detail ||
      payload?.error ||
      `Telnyx API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function findOwnedPhoneNumber(phoneNumber, apiKey) {
  const payload = await telnyxRequest({
    method: 'GET',
    path: '/phone_numbers',
    apiKey,
    params: {
      'filter[phone_number]': phoneNumber,
      'page[size]': 1,
    },
    expectedStatuses: [200],
  });

  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data[0] || null;
}

export function initTelnyx() {
  return Boolean(resolveApiKey());
}

export async function testTelnyxConnection(apiKey) {
  await telnyxRequest({
    method: 'GET',
    path: '/phone_numbers',
    apiKey,
    params: { 'page[size]': 1 },
    expectedStatuses: [200],
  });
  return { connected: true };
}

export async function searchAvailableNumbers(country = 'US', areaCode = null) {
  const params = {
    'page[size]': 20,
    'filter[country_code]': String(country || 'US').toUpperCase(),
  };
  if (areaCode && String(country || 'US').toUpperCase() === 'US') {
    params['filter[phone_number][starts_with]'] = `+1${String(areaCode).trim()}`;
  }

  const payload = await telnyxRequest({
    method: 'GET',
    path: '/available_phone_numbers',
    params,
    expectedStatuses: [200],
  });

  const numbers = Array.isArray(payload?.data) ? payload.data : [];
  return numbers.map((item) => ({
    phoneNumber: item.phone_number,
    friendlyName: item.phone_number,
    locality: item.locality || item.city || null,
    region: item.region_code || item.administrative_area || null,
    isoCountry: item.country_code || null,
    capabilities: item.features || {},
  }));
}

export async function purchaseNumber(phoneNumber) {
  const existing = await findOwnedPhoneNumber(phoneNumber);
  if (existing) {
    return {
      sid: existing.id,
      phoneNumber: existing.phone_number || phoneNumber,
    };
  }

  await telnyxRequest({
    method: 'POST',
    path: '/number_orders',
    jsonBody: {
      phone_numbers: [{ phone_number: phoneNumber }],
    },
    expectedStatuses: [200, 201, 202],
  });

  const ordered = await findOwnedPhoneNumber(phoneNumber);
  if (!ordered) {
    throw new Error(`Ordered Telnyx phone number ${phoneNumber} but could not retrieve it`);
  }

  return {
    sid: ordered.id,
    phoneNumber: ordered.phone_number || phoneNumber,
  };
}

export async function releaseNumber(phoneNumber) {
  await telnyxRequest({
    method: 'POST',
    path: '/phone_numbers/jobs/delete_phone_numbers',
    jsonBody: {
      phone_numbers: [phoneNumber],
    },
    expectedStatuses: [200, 202],
  });
}

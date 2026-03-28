import twilio from 'twilio';

let client = null;

export function initTwilio() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function searchAvailableNumbers(country = 'US', areaCode = null) {
  const tw = initTwilio();
  if (!tw) throw new Error('Twilio not configured');

  const params = { limit: 20 };
  if (areaCode) params.areaCode = areaCode;

  const numbers = await tw.availablePhoneNumbers(country).local.list(params);
  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region,
    isoCountry: n.isoCountry,
    capabilities: n.capabilities,
  }));
}

export async function purchaseNumber(phoneNumber) {
  const tw = initTwilio();
  if (!tw) throw new Error('Twilio not configured');

  const incoming = await tw.incomingPhoneNumbers.create({ phoneNumber });
  return {
    sid: incoming.sid,
    phoneNumber: incoming.phoneNumber,
  };
}

export async function releaseNumber(sid) {
  const tw = initTwilio();
  if (!tw) throw new Error('Twilio not configured');

  await tw.incomingPhoneNumbers(sid).remove();
}

export async function configureNumberWebhook(sid, voiceUrl) {
  const tw = initTwilio();
  if (!tw) throw new Error('Twilio not configured');

  const updated = await tw.incomingPhoneNumbers(sid).update({ voiceUrl });
  return updated;
}

// SMSLive247's OTP-compliant path -- separate from Smslive247Provider.send()
// (which hits their generic /api/v5/sms route and rejects any message
// containing an OTP-shaped number). This uses their dedicated token API:
// https://smslive247api.readme.io/v5.0/reference/tokencreatesms
// https://smslive247api.readme.io/v5.0/reference/tokenverify
// SMSLive247 generates the code itself and verifies it on their side -- we
// never see or store the code, only the phone number, which is enough to
// correlate create->verify since their verify call takes {token, to}.
const BASE_URL = 'https://api.smslive247.com';

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function credentials(): { apiKey: string; senderId: string } {
  const apiKey = process.env.SMSLIVE247_API_KEY;
  const senderId = process.env.SMSLIVE247_SENDER_ID;
  if (!apiKey || !senderId) throw new Error('SMSLive247 credentials not set');
  return { apiKey, senderId };
}

// SMSLive247 rejects E.164's leading "+" on destination numbers ("None of
// the provided destination numbers could be processed") -- they expect a
// bare MSISDN, e.g. 2348012345678 rather than +2348012345678.
function toSmslive247Msisdn(phoneNumberE164: string): string {
  return phoneNumberE164.replace(/^\+/, '');
}

export async function createSmslive247Otp(phoneNumber: string): Promise<{ expiresAt: string }> {
  const { apiKey, senderId } = credentials();

  const res = await fetch(`${BASE_URL}/api/v5/tokens/sms`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ phoneNumber: toSmslive247Msisdn(phoneNumber), senderID: senderId }),
  });
  if (!res.ok) throw new Error(`SMSLive247 token-create failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { expiresAt?: string };
  if (!data.expiresAt) throw new Error('SMSLive247 token-create response missing expiresAt');
  return { expiresAt: data.expiresAt };
}

export async function verifySmslive247Otp(phoneNumber: string, code: string): Promise<boolean> {
  const { apiKey } = credentials();

  const res = await fetch(`${BASE_URL}/api/v5/tokens`, {
    method: 'DELETE',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ token: code, to: toSmslive247Msisdn(phoneNumber) }),
  });
  if (!res.ok) throw new Error(`SMSLive247 token-verify failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { isValid?: boolean };
  return data.isValid === true;
}

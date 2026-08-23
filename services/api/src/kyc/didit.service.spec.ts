import { createHmac } from 'crypto';
import { DiditService } from './didit.service';

describe('DiditService', () => {
  const webhookSecret = 'test-didit-webhook-secret';
  let service: DiditService;

  beforeEach(() => {
    process.env.DIDIT_WEBHOOK_SECRET = webhookSecret;
    service = new DiditService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.DIDIT_API_KEY;
    delete process.env.DIDIT_WORKFLOW_ID;
    delete process.env.DIDIT_WEBHOOK_SECRET;
  });

  function freshTimestamp(): string {
    return String(Math.floor(Date.now() / 1000));
  }

  describe('verifyWebhookSignature', () => {
    const payload = { session_id: 'sess-1', status: 'Approved', webhook_type: 'status.updated' };

    it('rejects when X-Timestamp is missing', () => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      expect(service.verifyWebhookSignature(rawBody, {}, payload)).toBe(false);
    });

    it('rejects when X-Timestamp is older than 5 minutes', () => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
      const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      expect(
        service.verifyWebhookSignature(
          rawBody,
          { 'x-timestamp': staleTimestamp, 'x-signature': signature },
          payload,
        ),
      ).toBe(false);
    });

    it('accepts a matching X-Signature header (HMAC over raw body)', () => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      expect(
        service.verifyWebhookSignature(
          rawBody,
          { 'x-timestamp': freshTimestamp(), 'x-signature': signature },
          payload,
        ),
      ).toBe(true);
    });

    it('rejects a mismatched X-Signature header', () => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      const wrongSignature = createHmac('sha256', 'wrong-secret').update(rawBody).digest('hex');
      expect(
        service.verifyWebhookSignature(
          rawBody,
          { 'x-timestamp': freshTimestamp(), 'x-signature': wrongSignature },
          payload,
        ),
      ).toBe(false);
    });

    it('accepts a matching X-Signature-V2 header (HMAC over sorted-key compact JSON)', () => {
      // Unsorted key order in the raw body -- X-Signature-V2 is computed over
      // the sorted/compact re-serialization, not the raw bytes, so this must
      // still verify even though key order differs from a canonical dump.
      const rawBody = Buffer.from('{"status":"Approved","session_id":"sess-1"}');
      const sorted = Buffer.from(JSON.stringify({ session_id: 'sess-1', status: 'Approved' }));
      const signature = createHmac('sha256', webhookSecret).update(sorted).digest('hex');
      expect(
        service.verifyWebhookSignature(
          rawBody,
          { 'x-timestamp': freshTimestamp(), 'x-signature-v2': signature },
          { session_id: 'sess-1', status: 'Approved' },
        ),
      ).toBe(true);
    });

    it('accepts a matching X-Signature-Simple header (HMAC over the envelope string)', () => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      const timestamp = freshTimestamp();
      const envelope = `${timestamp}:${payload.session_id}:${payload.status}:${payload.webhook_type}`;
      const signature = createHmac('sha256', webhookSecret).update(envelope).digest('hex');
      expect(
        service.verifyWebhookSignature(
          rawBody,
          { 'x-timestamp': timestamp, 'x-signature-simple': signature },
          payload,
        ),
      ).toBe(true);
    });

    it('rejects when none of the three signature headers are present', () => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      expect(
        service.verifyWebhookSignature(rawBody, { 'x-timestamp': freshTimestamp() }, payload),
      ).toBe(false);
    });

    it('is sensitive to raw body changes even with a valid HMAC key (tamper detection)', () => {
      const originalBody = Buffer.from(JSON.stringify(payload));
      const signature = createHmac('sha256', webhookSecret).update(originalBody).digest('hex');
      const tamperedBody = Buffer.from(JSON.stringify({ ...payload, status: 'Declined' }));
      expect(
        service.verifyWebhookSignature(
          tamperedBody,
          { 'x-timestamp': freshTimestamp(), 'x-signature': signature },
          payload,
        ),
      ).toBe(false);
    });
  });

  describe('getWebhookEventHash', () => {
    it('produces the same hash for identical raw bytes', () => {
      const rawBody = Buffer.from('{"a":1}');
      expect(service.getWebhookEventHash(rawBody)).toBe(service.getWebhookEventHash(rawBody));
    });

    it('produces a different hash for different raw bytes', () => {
      expect(service.getWebhookEventHash(Buffer.from('{"a":1}'))).not.toBe(
        service.getWebhookEventHash(Buffer.from('{"a":2}')),
      );
    });
  });

  describe('createSession', () => {
    it('does not call the provider when the API key is unavailable', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(service.createSession('user-1', 'https://example.com/callback')).rejects.toThrow(
        'DIDIT_API_KEY is not set',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns the session id and hosted verification url on success', async () => {
      process.env.DIDIT_API_KEY = 'test-api-key';
      process.env.DIDIT_WORKFLOW_ID = 'wf-1';
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            session_id: 'sess-1',
            url: 'https://verify.didit.me/session/sess-1',
            session_token: 'tok',
          }),
          { status: 200 },
        ),
      );

      await expect(service.createSession('user-1', 'https://example.com/callback')).resolves.toEqual(
        { sessionId: 'sess-1', url: 'https://verify.didit.me/session/sess-1' },
      );
    });
  });
});

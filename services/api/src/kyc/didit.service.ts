import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

// Didit exposes session creation and decision retrieval on separate v2 hosts.
// The v3 verification namespace serves other products and does not expose
// the hosted-workflow session creation endpoint.
const DIDIT_SESSION_API_BASE = 'https://apx.didit.me/auth/v2';
const DIDIT_DECISION_API_BASE = 'https://verification.didit.me/v2';
const DIDIT_REQUEST_TIMEOUT_MS = 15_000;
const WEBHOOK_MAX_AGE_SECONDS = 300;

export interface CreateSessionResult {
  sessionId: string;
  url: string;
}

export interface DiditIdVerification {
  documentType: string | null;
  documentNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  status: string | null;
}

export interface DiditDecision {
  status: string;
  idVerifications: DiditIdVerification[];
  faceMatchScore: number | null;
  faceMatchStatus: string | null;
  livenessScore: number | null;
  livenessStatus: string | null;
  declineReason: string | null;
  raw: Record<string, unknown>;
}

/**
 * Thin wrapper around Didit's v2 hosted-workflow API -- same "one class
 * per external integration" shape as flutterwave.service.ts: no constructor
 * DI, env vars read lazily via getters that fail fast on first use, typed
 * results never leak raw provider JSON to callers except in `raw` (kept only
 * for the encrypted-at-rest full decision payload), every failure logged
 * server-side and surfaced as a generic BadGatewayException.
 */
@Injectable()
export class DiditService {
  private readonly logger = new Logger(DiditService.name);

  private get apiKey(): string {
    const key = process.env.DIDIT_API_KEY;
    if (!key) {
      throw new Error('DIDIT_API_KEY is not set');
    }
    return key;
  }

  private get workflowId(): string {
    const id = process.env.DIDIT_WORKFLOW_ID;
    if (!id) {
      throw new Error('DIDIT_WORKFLOW_ID is not set');
    }
    return id;
  }

  private get webhookSecret(): string {
    const secret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('DIDIT_WEBHOOK_SECRET is not set');
    }
    return secret;
  }

  private authHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async createSession(userId: string, callbackUrl: string): Promise<CreateSessionResult> {
    // Resolve configuration outside the provider error boundary so a broken
    // deployment remains explicit instead of looking like a transient outage.
    const headers = this.authHeaders();
    const workflowId = this.workflowId;
    try {
      const res = await fetch(`${DIDIT_SESSION_API_BASE}/session/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workflow_id: workflowId,
          vendor_data: userId,
          callback: callbackUrl,
        }),
        signal: AbortSignal.timeout(DIDIT_REQUEST_TIMEOUT_MS),
      });
      const raw = await readDiditJson(res);
      if (!res.ok) {
        this.logger.error(`Didit createSession failed: ${res.status} ${JSON.stringify(raw)}`);
        throw new BadGatewayException(
          'The identity verification provider could not start a session. Please try again.',
        );
      }
      const sessionId = raw.session_id;
      const url = raw.url;
      if (typeof sessionId !== 'string' || typeof url !== 'string') {
        this.logger.error(
          `Didit createSession response missing session_id/url: ${JSON.stringify(raw)}`,
        );
        throw new BadGatewayException(
          'The identity verification provider returned an invalid session response.',
        );
      }
      return { sessionId, url };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(`Didit createSession request failed: ${String(error)}`);
      throw new BadGatewayException(
        'The identity verification provider could not start a session. Please try again.',
      );
    }
  }

  /** Fallback poll used only by the admin "Refresh from Didit" action -- the webhook is the primary result path. */
  async getDecision(sessionId: string): Promise<DiditDecision> {
    try {
      const res = await fetch(
        `${DIDIT_DECISION_API_BASE}/session/${encodeURIComponent(sessionId)}/decision/`,
        {
          method: 'GET',
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(DIDIT_REQUEST_TIMEOUT_MS),
        },
      );
      const raw = await readDiditJson(res);
      if (!res.ok) {
        this.logger.error(`Didit getDecision failed: ${res.status} ${JSON.stringify(raw)}`);
        throw new BadGatewayException(
          'The identity verification provider could not fetch this decision.',
        );
      }
      return parseDecision(raw);
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(`Didit getDecision request failed: ${String(error)}`);
      throw new BadGatewayException(
        'The identity verification provider could not fetch this decision.',
      );
    }
  }

  /**
   * Didit sends three HMAC-SHA256 signature headers on every webhook, all
   * keyed by the same shared secret: X-Signature-V2 (over sorted/compact
   * JSON, most resilient to middleware re-encoding -- checked first),
   * X-Signature (over raw request body bytes -- requires the RAW body,
   * captured via main.ts's `rawBody: true`, same as Flutterwave's webhook),
   * and X-Signature-Simple (an envelope-only fallback over
   * "{timestamp}:{session_id}:{status}:{webhook_type}"). Accept any one of
   * the three rather than guess which the account actually sends -- mirrors
   * flutterwave.service.ts's verifyWebhookSignature accepting either of its
   * two documented schemes. X-Timestamp is checked separately to reject
   * replays older than 5 minutes.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    payload: { session_id?: string; status?: string; webhook_type?: string },
  ): boolean {
    const timestampHeader = headers['x-timestamp'];
    if (!timestampHeader) return false;
    const timestamp = Number(timestampHeader);
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_MAX_AGE_SECONDS
    ) {
      return false;
    }

    const v2 = headers['x-signature-v2'];
    if (v2 && this.hmacMatches(v2, sortedCompactJson(rawBody))) {
      return true;
    }

    const raw = headers['x-signature'];
    if (raw && this.hmacMatches(raw, rawBody)) {
      return true;
    }

    const simple = headers['x-signature-simple'];
    if (
      simple &&
      this.hmacMatches(
        simple,
        Buffer.from(
          `${timestampHeader}:${payload.session_id ?? ''}:${payload.status ?? ''}:${payload.webhook_type ?? ''}`,
        ),
      )
    ) {
      return true;
    }

    return false;
  }

  private hmacMatches(signatureHex: string, data: Buffer): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(data).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signatureHex, 'hex');
    return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  }

  getWebhookEventHash(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }
}

/** Re-serializes the raw webhook body as sorted-key compact JSON for the X-Signature-V2 scheme -- falls back to the raw bytes if the body isn't valid JSON (the signature check then simply fails, which is correct). */
function sortedCompactJson(rawBody: Buffer): Buffer {
  try {
    const parsed = JSON.parse(rawBody.toString('utf8'));
    return Buffer.from(JSON.stringify(sortKeysDeep(parsed)));
  } catch {
    return rawBody;
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function parseDecision(raw: Record<string, unknown>): DiditDecision {
  const decision = (raw.decision as Record<string, unknown> | undefined) ?? raw;
  const idVerifications = toArray(decision.id_verifications).map((item) => ({
    documentType: strOrNull(item.document_type),
    documentNumber: strOrNull(item.document_number),
    firstName: strOrNull(item.first_name),
    lastName: strOrNull(item.last_name),
    dateOfBirth: strOrNull(item.date_of_birth),
    status: strOrNull(item.status),
  }));
  const faceMatch = toArray(decision.face_matches)[0];
  const liveness = toArray(decision.liveness_checks)[0];
  return {
    status: strOrNull(raw.status) ?? 'IN_PROGRESS',
    idVerifications,
    faceMatchScore: numOrNull(faceMatch?.score),
    faceMatchStatus: strOrNull(faceMatch?.status),
    livenessScore: numOrNull(liveness?.score),
    livenessStatus: strOrNull(liveness?.status),
    declineReason: strOrNull(decision.decline_reason) ?? strOrNull(raw.decline_reason),
    raw,
  };
}

function toArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

async function readDiditJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

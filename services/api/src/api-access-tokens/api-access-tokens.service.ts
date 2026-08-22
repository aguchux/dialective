import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptToken, encryptToken } from '../common/token-crypto.util';

/**
 * Fixed, small vocabulary of admin-editable third-party API tokens -- not a
 * user-defined key/value store. Add an entry here (and the corresponding
 * consumer read, e.g. whisper-worker's db.py get_hf_token) whenever a new
 * credential needs to move from a k8s-Secret-only env var to an
 * admin-rotatable one; never let the frontend submit an arbitrary key.
 */
export const KNOWN_API_ACCESS_TOKEN_KEYS = ['huggingface'] as const;
export type ApiAccessTokenKey = (typeof KNOWN_API_ACCESS_TOKEN_KEYS)[number];

export interface ApiAccessTokenSummary {
  key: string;
  isSet: boolean;
  lastFour: string | null;
  updatedAt: Date | null;
  updatedByEmail: string | null;
}

@Injectable()
export class ApiAccessTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Always returns one row per KNOWN_API_ACCESS_TOKEN_KEYS entry, even if
   * never set -- the admin tab lists every known credential slot, not just
   * configured ones, so an admin can see at a glance what's missing (same
   * "show the full known set" posture as models/asr-registry.yaml listing
   * every dialect it knows about, configured or not).
   */
  async list(): Promise<ApiAccessTokenSummary[]> {
    const rows = await this.prisma.apiAccessToken.findMany({
      where: { key: { in: [...KNOWN_API_ACCESS_TOKEN_KEYS] } },
      include: { updatedBy: { select: { email: true } } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return KNOWN_API_ACCESS_TOKEN_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        isSet: Boolean(row),
        lastFour: row?.lastFour ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedByEmail: row?.updatedBy?.email ?? null,
      };
    });
  }

  /**
   * Encrypts and upserts -- plaintext `value` is never persisted or
   * returned; only encryptToken's ciphertext/iv/authTag and the last-4-chars
   * display fragment are stored. No OTP gate (see ApiAccessTokensController
   * -- instant save, same posture as most of admin/platform-settings).
   */
  async set(key: ApiAccessTokenKey, value: string, updatedByUserId: string): Promise<ApiAccessTokenSummary> {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Token value must not be empty');
    }
    const { encryptedValue, iv, authTag } = encryptToken(trimmed);
    const lastFour = trimmed.slice(-4);
    const row = await this.prisma.apiAccessToken.upsert({
      where: { key },
      create: { key, encryptedValue, iv, authTag, lastFour, updatedByUserId },
      update: { encryptedValue, iv, authTag, lastFour, updatedByUserId },
      include: { updatedBy: { select: { email: true } } },
    });
    return {
      key: row.key,
      isSet: true,
      lastFour: row.lastFour,
      updatedAt: row.updatedAt,
      updatedByEmail: row.updatedBy?.email ?? null,
    };
  }

  async remove(key: ApiAccessTokenKey): Promise<void> {
    await this.prisma.apiAccessToken.deleteMany({ where: { key } });
  }

  /** Server-side only -- never exposed via a controller route. For a future TS caller that needs the raw token (whisper-worker, being Python, decrypts independently -- see db.py). */
  async getDecrypted(key: ApiAccessTokenKey): Promise<string | null> {
    const row = await this.prisma.apiAccessToken.findUnique({ where: { key } });
    if (!row) return null;
    return decryptToken(row);
  }
}

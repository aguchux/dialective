import { randomUUID } from 'crypto';
import {
  PrismaClient,
  SubscriberOrgRole,
  SubscriptionStatus,
  StreamKeyScope,
  StreamDeckType,
  SubmissionStatus,
} from '@dialectiva/db';
import { hashToken } from '../../src/auth/token.util';
import { signSubscriberAccessToken } from '../../src/voice-stream/subscriber-auth/subscriber-jwt.util';
import { signM2mToken } from '../../src/voice-stream/oauth/oauth-m2m-jwt.util';

const STREAM_KEY_PREFIX = 'dlsk_live_';

export interface SeededOrg {
  organizationId: string;
  userId: string;
  subscriberJwt: string;
  planId: string;
  subscriptionId: string;
}

/**
 * One org, one OWNER user + subscriber JWT, one active subscription on a
 * fresh plan (defaults chosen so every guard's "null = unlimited" branch is
 * exercised unless a test overrides planOverrides). Every fixture in this
 * file inserts directly via Prisma, bypassing the service layer, since
 * these are authorization tests -- the thing under test is what the guards
 * do with pre-existing state, not the write paths themselves.
 */
export async function seedOrg(
  prisma: PrismaClient,
  opts: {
    planOverrides?: Partial<{
      maxConcurrentStreams: number | null;
      rateLimitPerMinute: number | null;
      monthlyByteQuota: bigint | null;
      monthlyRequestQuota: number | null;
    }>;
    subscriptionStatus?: SubscriptionStatus;
    orgRole?: SubscriberOrgRole;
  } = {},
): Promise<SeededOrg> {
  const suffix = randomUUID().slice(0, 8);

  const plan = await prisma.subscriptionPlan.create({
    data: {
      key: `test-plan-${suffix}`,
      name: `Test Plan ${suffix}`,
      stripePriceId: `price_test_${suffix}`,
      monthlyUsdAmount: 0,
      maxConcurrentStreams: opts.planOverrides?.maxConcurrentStreams ?? null,
      rateLimitPerMinute: opts.planOverrides?.rateLimitPerMinute ?? null,
      monthlyByteQuota: opts.planOverrides?.monthlyByteQuota ?? null,
      monthlyRequestQuota: opts.planOverrides?.monthlyRequestQuota ?? null,
    },
  });

  const org = await prisma.subscriberOrganization.create({
    data: { name: `Test Org ${suffix}`, slug: `test-org-${suffix}` },
  });

  const subscription = await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planId: plan.id,
      status: opts.subscriptionStatus ?? SubscriptionStatus.ACTIVE,
    },
  });

  const user = await prisma.subscriberUser.create({
    data: {
      email: `owner-${suffix}@test.dialectlibrary.com`,
      passwordHash: 'unused-in-tests',
      firstName: 'Test',
      lastName: 'Owner',
      emailVerifiedAt: new Date(),
    },
  });

  const role = opts.orgRole ?? SubscriberOrgRole.OWNER;
  await prisma.subscriberMembership.create({
    data: { userId: user.id, organizationId: org.id, role, acceptedAt: new Date() },
  });

  const subscriberJwt = signSubscriberAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: org.id,
    orgRole: role,
  });

  return {
    organizationId: org.id,
    userId: user.id,
    subscriberJwt,
    planId: plan.id,
    subscriptionId: subscription.id,
  };
}

export interface SeededDeck {
  deckId: string;
  deckKey: string;
}

export async function seedDeck(
  prisma: PrismaClient,
  organizationId: string,
  createdByUserId: string,
  opts: { type?: StreamDeckType } = {},
): Promise<SeededDeck> {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const deck = await prisma.streamDeck.create({
    data: {
      deckKey: `DLSD-TEST-TEST-TEST-${suffix}`,
      organizationId,
      name: `Test Deck ${suffix}`,
      type: opts.type ?? StreamDeckType.MANUAL,
      createdByUserId,
    },
  });
  return { deckId: deck.id, deckKey: deck.deckKey };
}

export interface SeededRecording {
  recordingId: string;
}

/** A minimal SETTLED, streamable WordRecording -- no Word/Prompt/User FK needed, all nullable. */
export async function seedStreamableRecording(
  prisma: PrismaClient,
  opts: { dialectTag?: string } = {},
): Promise<SeededRecording> {
  const suffix = randomUUID().slice(0, 8);
  const recording = await prisma.wordRecording.create({
    data: {
      dialectTag: opts.dialectTag ?? 'test-dialect',
      translationText: `test translation ${suffix}`,
      status: SubmissionStatus.SETTLED,
      audioBucket: 'test-bucket',
      audioKey: `test/${suffix}.wav`,
    },
  });
  return { recordingId: recording.id };
}

export async function addDeckItem(
  prisma: PrismaClient,
  deckId: string,
  recordingId: string,
  addedByUserId: string,
): Promise<void> {
  await prisma.streamDeckItem.create({
    data: { deckId, recordingId, addedByUserId },
  });
}

export interface SeededStreamKey {
  keyId: string;
  plaintextKey: string;
}

export async function seedStreamKey(
  prisma: PrismaClient,
  organizationId: string,
  createdByUserId: string,
  opts: {
    deckId?: string | null;
    scopes?: StreamKeyScope[];
    revoked?: boolean;
    expiresAt?: Date | null;
    allowedIps?: string[];
  } = {},
): Promise<SeededStreamKey> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const plaintextKey = `${STREAM_KEY_PREFIX}${token}`;
  const keyHash = hashToken(plaintextKey);

  const key = await prisma.streamApiKey.create({
    data: {
      organizationId,
      deckId: opts.deckId ?? null,
      keyHash,
      keyPrefix: plaintextKey.slice(0, STREAM_KEY_PREFIX.length + 8),
      scopes: opts.scopes ?? [
        StreamKeyScope.DECK_READ,
        StreamKeyScope.DECK_LIST,
        StreamKeyScope.AUDIO_STREAM,
        StreamKeyScope.METADATA_READ,
        StreamKeyScope.MANIFEST_READ,
        StreamKeyScope.USAGE_READ,
      ],
      allowedIps: opts.allowedIps ?? [],
      createdByUserId,
      expiresAt: opts.expiresAt ?? null,
      revokedAt: opts.revoked ? new Date() : null,
    },
  });

  return { keyId: key.id, plaintextKey };
}

export interface SeededOAuthClient {
  clientId: string;
  jwt: string;
  oauthClientRowId: string;
}

/** Mints a valid M2M JWT directly (bypassing the token endpoint) for a given organization/scopes. */
export async function seedOAuthClient(
  prisma: PrismaClient,
  organizationId: string,
  createdByUserId: string,
  opts: { deckId?: string | null; scopes?: StreamKeyScope[]; revoked?: boolean } = {},
): Promise<SeededOAuthClient> {
  const suffix = randomUUID().slice(0, 8);
  const clientId = `dlm2m_${suffix}`;
  const scopes = opts.scopes ?? [
    StreamKeyScope.DECK_READ,
    StreamKeyScope.DECK_LIST,
    StreamKeyScope.AUDIO_STREAM,
    StreamKeyScope.METADATA_READ,
    StreamKeyScope.MANIFEST_READ,
    StreamKeyScope.USAGE_READ,
  ];

  const row = await prisma.oAuthClient.create({
    data: {
      organizationId,
      deckId: opts.deckId ?? null,
      clientId,
      secretHash: hashToken(`unused-secret-${suffix}`),
      scopes,
      createdByUserId,
      revokedAt: opts.revoked ? new Date() : null,
    },
  });

  const { token } = signM2mToken({
    sub: clientId,
    organizationId,
    deckId: opts.deckId ?? null,
    scopes,
  });

  return { clientId, jwt: token, oauthClientRowId: row.id };
}

/**
 * Deletes every row this suite could plausibly have created, scoped to
 * organizations created via seedOrg (cascades handle deck/key/recording
 * children through onDelete: Cascade FKs). WordRecording rows have no FK
 * back to an org, so they're deleted separately by id.
 */
export async function cleanupOrgs(prisma: PrismaClient, organizationIds: string[]): Promise<void> {
  if (organizationIds.length === 0) return;
  await prisma.subscriberOrganization.deleteMany({ where: { id: { in: organizationIds } } });
}

export async function cleanupRecordings(prisma: PrismaClient, recordingIds: string[]): Promise<void> {
  if (recordingIds.length === 0) return;
  await prisma.wordRecording.deleteMany({ where: { id: { in: recordingIds } } });
}

/**
 * StreamManifestController's logRequest() call is fire-and-forget
 * (`void this.accessLog.record(...)`), so the HTTP response can return
 * before the write lands. Polls briefly rather than asserting immediately.
 */
export async function waitForCondition(
  check: () => Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.seedOrg = seedOrg;
exports.seedDeck = seedDeck;
exports.seedStreamableRecording = seedStreamableRecording;
exports.addDeckItem = addDeckItem;
exports.seedStreamKey = seedStreamKey;
exports.seedOAuthClient = seedOAuthClient;
exports.cleanupOrgs = cleanupOrgs;
exports.cleanupRecordings = cleanupRecordings;
exports.waitForCondition = waitForCondition;
const crypto_1 = require('crypto');
const db_1 = require('@dialectiva/db');
const token_util_1 = require('../../src/auth/token.util');
const subscriber_jwt_util_1 = require('../../src/voice-stream/subscriber-auth/subscriber-jwt.util');
const oauth_m2m_jwt_util_1 = require('../../src/voice-stream/oauth/oauth-m2m-jwt.util');
const STREAM_KEY_PREFIX = 'dlsk_live_';
/**
 * One org, one OWNER user + subscriber JWT, one active subscription on a
 * fresh plan (defaults chosen so every guard's "null = unlimited" branch is
 * exercised unless a test overrides planOverrides). Every fixture in this
 * file inserts directly via Prisma, bypassing the service layer, since
 * these are authorization tests -- the thing under test is what the guards
 * do with pre-existing state, not the write paths themselves.
 */
async function seedOrg(prisma, opts = {}) {
  const suffix = (0, crypto_1.randomUUID)().slice(0, 8);
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
      status: opts.subscriptionStatus ?? db_1.SubscriptionStatus.ACTIVE,
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
  const role = opts.orgRole ?? db_1.SubscriberOrgRole.OWNER;
  await prisma.subscriberMembership.create({
    data: { userId: user.id, organizationId: org.id, role, acceptedAt: new Date() },
  });
  const subscriberJwt = (0, subscriber_jwt_util_1.signSubscriberAccessToken)({
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
async function seedDeck(prisma, organizationId, createdByUserId, opts = {}) {
  const suffix = (0, crypto_1.randomUUID)().slice(0, 6).toUpperCase();
  const deck = await prisma.streamDeck.create({
    data: {
      deckKey: `DLSD-TEST-TEST-TEST-${suffix}`,
      organizationId,
      name: `Test Deck ${suffix}`,
      type: opts.type ?? db_1.StreamDeckType.MANUAL,
      createdByUserId,
    },
  });
  return { deckId: deck.id, deckKey: deck.deckKey };
}
/** A minimal SETTLED, streamable WordRecording -- no Word/Prompt/User FK needed, all nullable. */
async function seedStreamableRecording(prisma, opts = {}) {
  const suffix = (0, crypto_1.randomUUID)().slice(0, 8);
  const recording = await prisma.wordRecording.create({
    data: {
      dialectTag: opts.dialectTag ?? 'test-dialect',
      translationText: `test translation ${suffix}`,
      status: db_1.SubmissionStatus.SETTLED,
      audioBucket: 'test-bucket',
      audioKey: `test/${suffix}.wav`,
    },
  });
  return { recordingId: recording.id };
}
async function addDeckItem(prisma, deckId, recordingId, addedByUserId) {
  await prisma.streamDeckItem.create({
    data: { deckId, recordingId, addedByUserId },
  });
}
async function seedStreamKey(prisma, organizationId, createdByUserId, opts = {}) {
  const token =
    (0, crypto_1.randomUUID)().replace(/-/g, '') + (0, crypto_1.randomUUID)().replace(/-/g, '');
  const plaintextKey = `${STREAM_KEY_PREFIX}${token}`;
  const keyHash = (0, token_util_1.hashToken)(plaintextKey);
  const key = await prisma.streamApiKey.create({
    data: {
      organizationId,
      deckId: opts.deckId ?? null,
      keyHash,
      keyPrefix: plaintextKey.slice(0, STREAM_KEY_PREFIX.length + 8),
      scopes: opts.scopes ?? [
        db_1.StreamKeyScope.DECK_READ,
        db_1.StreamKeyScope.DECK_LIST,
        db_1.StreamKeyScope.AUDIO_STREAM,
        db_1.StreamKeyScope.METADATA_READ,
        db_1.StreamKeyScope.MANIFEST_READ,
        db_1.StreamKeyScope.USAGE_READ,
      ],
      allowedIps: opts.allowedIps ?? [],
      createdByUserId,
      expiresAt: opts.expiresAt ?? null,
      revokedAt: opts.revoked ? new Date() : null,
    },
  });
  return { keyId: key.id, plaintextKey };
}
/** Mints a valid M2M JWT directly (bypassing the token endpoint) for a given organization/scopes. */
async function seedOAuthClient(prisma, organizationId, createdByUserId, opts = {}) {
  const suffix = (0, crypto_1.randomUUID)().slice(0, 8);
  const clientId = `dlm2m_${suffix}`;
  const scopes = opts.scopes ?? [
    db_1.StreamKeyScope.DECK_READ,
    db_1.StreamKeyScope.DECK_LIST,
    db_1.StreamKeyScope.AUDIO_STREAM,
    db_1.StreamKeyScope.METADATA_READ,
    db_1.StreamKeyScope.MANIFEST_READ,
    db_1.StreamKeyScope.USAGE_READ,
  ];
  const row = await prisma.oAuthClient.create({
    data: {
      organizationId,
      deckId: opts.deckId ?? null,
      clientId,
      secretHash: (0, token_util_1.hashToken)(`unused-secret-${suffix}`),
      scopes,
      createdByUserId,
      revokedAt: opts.revoked ? new Date() : null,
    },
  });
  const { token } = (0, oauth_m2m_jwt_util_1.signM2mToken)({
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
async function cleanupOrgs(prisma, organizationIds) {
  if (organizationIds.length === 0) return;
  await prisma.subscriberOrganization.deleteMany({ where: { id: { in: organizationIds } } });
}
async function cleanupRecordings(prisma, recordingIds) {
  if (recordingIds.length === 0) return;
  await prisma.wordRecording.deleteMany({ where: { id: { in: recordingIds } } });
}
/**
 * StreamManifestController's logRequest() call is fire-and-forget
 * (`void this.accessLog.record(...)`), so the HTTP response can return
 * before the write lands. Polls briefly rather than asserting immediately.
 */
async function waitForCondition(check, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
//# sourceMappingURL=fixtures.js.map

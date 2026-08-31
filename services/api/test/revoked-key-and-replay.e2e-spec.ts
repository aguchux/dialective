import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@dialectiva/db';
import { createTestApp, apiPath, closeTestApp } from './support/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  seedOrg,
  seedDeck,
  seedStreamableRecording,
  addDeckItem,
  seedStreamKey,
  seedOAuthClient,
  cleanupOrgs,
  cleanupRecordings,
  SeededOrg,
} from './support/fixtures';
import { StreamKeysService } from '../src/voice-stream/stream-api/stream-keys.service';

/**
 * Section 64: "revoked-key tests" + "request replay tests". Stream Keys are
 * DB-backed and instantly revocable (StreamKeyAuthGuard hits the DB every
 * request); OAuth M2M JWTs are stateless and NOT instantly revocable by
 * design (see oauth-jwt-auth.guard.ts) -- both behaviors are asserted
 * explicitly below so a future change to either posture fails a test
 * instead of silently shipping.
 */
describe('revoked-key and replay tests', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let org: SeededOrg;
  let deckId: string;
  let recordingId: string;
  const orgIds: string[] = [];
  const recordingIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    org = await seedOrg(prisma);
    orgIds.push(org.organizationId);

    const deck = await seedDeck(prisma, org.organizationId, org.userId);
    deckId = deck.deckId;

    const recording = await seedStreamableRecording(prisma);
    recordingId = recording.recordingId;
    recordingIds.push(recordingId);
    await addDeckItem(prisma, deckId, recordingId, org.userId);
  });

  afterAll(async () => {
    await cleanupRecordings(prisma, recordingIds);
    await cleanupOrgs(prisma, orgIds);
    await closeTestApp(app);
  });

  describe('Stream Keys', () => {
    it('rejects a key with revokedAt already set', async () => {
      const key = await seedStreamKey(prisma, org.organizationId, org.userId, { revoked: true });
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/revoked/i);
    });

    it('rejects a key with an expiresAt in the past', async () => {
      const key = await seedStreamKey(prisma, org.organizationId, org.userId, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    it('a valid key works, then stops working the instant it is revoked (DB-backed revocation)', async () => {
      const key = await seedStreamKey(prisma, org.organizationId, org.userId);

      const before = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(before.status).toBe(200);

      await prisma.streamApiKey.update({
        where: { id: key.keyId },
        data: { revokedAt: new Date() },
      });

      const after = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(after.status).toBe(401);
    });

    it('rotate() invalidates the old plaintext key and issues a working new one (replay of the old key fails)', async () => {
      const keysService = app.get(StreamKeysService);
      const key = await seedStreamKey(prisma, org.organizationId, org.userId);

      const rotated = await keysService.rotate(org.organizationId, key.keyId, org.userId);

      const oldKeyReplay = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(oldKeyReplay.status).toBe(401);

      const newKeyWorks = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${rotated.plaintextKey}`);
      expect(newKeyWorks.status).toBe(200);
    });

    it('rejects an empty/garbage bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', 'Bearer not-a-real-key');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid stream key/i);
    });

    it('rejects a request with no Authorization header at all', async () => {
      const res = await request(app.getHttpServer()).get(apiPath(`stream/v1/decks/${deckId}/manifest`));
      expect(res.status).toBe(401);
    });
  });

  describe('OAuth M2M (documented non-instant-revocation tradeoff)', () => {
    it('a JWT minted for a client that is THEN revoked still authenticates (stateless verification, no DB check)', async () => {
      const client = await seedOAuthClient(prisma, org.organizationId, org.userId);

      await prisma.oAuthClient.update({
        where: { id: client.oauthClientRowId },
        data: { revokedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', `Bearer ${client.jwt}`);
      // Intentional: OAuthJwtAuthGuard never queries OAuthClient.revokedAt.
      // If this starts failing, either the guard now checks revocation (update
      // this test) or something else broke -- do not "fix" by deleting it.
      expect(res.status).toBe(200);
    });

    it('rejects a malformed/garbage JWT-shaped token (3 dot-segments, invalid signature)', async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
        .set('Authorization', 'Bearer aaaa.bbbb.cccc');
      expect(res.status).toBe(401);
    });
  });

  describe('malformed Range header handling on the audio route', () => {
    it('rejects a malformed Range header with 400, not 500', async () => {
      const key = await seedStreamKey(prisma, org.organizationId, org.userId);
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckId}/items/${recordingId}/audio`))
        .set('Authorization', `Bearer ${key.plaintextKey}`)
        .set('Range', 'not-a-valid-range');
      expect(res.status).toBe(400);
    });
  });
});

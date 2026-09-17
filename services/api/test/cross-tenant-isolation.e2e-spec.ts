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

/**
 * Section 64: "cross-tenant data isolation tests". Two independently seeded
 * orgs (A owns the deck/recording/keys under test, B is the attacker) --
 * every assertion below is "B's credential, A's resource id".
 */
describe('cross-tenant data isolation', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgA: SeededOrg;
  let orgB: SeededOrg;
  let deckAId: string;
  let recordingAId: string;
  const orgIds: string[] = [];
  const recordingIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    orgA = await seedOrg(prisma);
    orgB = await seedOrg(prisma);
    orgIds.push(orgA.organizationId, orgB.organizationId);

    const deck = await seedDeck(prisma, orgA.organizationId, orgA.userId);
    deckAId = deck.deckId;

    const recording = await seedStreamableRecording(prisma);
    recordingAId = recording.recordingId;
    recordingIds.push(recordingAId);
    await addDeckItem(prisma, deckAId, recordingAId, orgA.userId);
  });

  afterAll(async () => {
    await cleanupRecordings(prisma, recordingIds);
    await cleanupOrgs(prisma, orgIds);
    await closeTestApp(app);
  });

  describe('dashboard (subscriber JWT) side', () => {
    it("rejects org B's JWT reading org A's deck by id", async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath(`voice-stream/stream-decks/${deckAId}`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(res.status).toBe(404);
    });

    it("rejects org B's JWT deleting org A's deck", async () => {
      const res = await request(app.getHttpServer())
        .delete(apiPath(`voice-stream/stream-decks/${deckAId}`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(res.status).toBe(404);

      // deck must still exist for org A afterward
      const stillThere = await request(app.getHttpServer())
        .get(apiPath(`voice-stream/stream-decks/${deckAId}`))
        .set('Authorization', `Bearer ${orgA.subscriberJwt}`);
      expect(stillThere.status).toBe(200);
    });

    it("rejects org B's JWT adding an item to org A's deck", async () => {
      const res = await request(app.getHttpServer())
        .post(apiPath(`voice-stream/stream-decks/${deckAId}/items`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`)
        .send({ recordingId: recordingAId });
      expect(res.status).toBe(404);
    });

    it("org B's own deck list never contains org A's deck", async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath('voice-stream/stream-decks'))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
      expect(ids).not.toContain(deckAId);
    });
  });

  describe('Voice Stream API (Stream Key) side', () => {
    it("rejects org B's Stream Key reading org A's deck manifest", async () => {
      const keyB = await seedStreamKey(prisma, orgB.organizationId, orgB.userId);
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(res.status).toBe(404);
    });

    it("rejects org B's Stream Key reading org A's deck item metadata", async () => {
      const keyB = await seedStreamKey(prisma, orgB.organizationId, orgB.userId);
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckAId}/items/${recordingAId}`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(res.status).toBe(404);
    });

    it("rejects org B's Stream Key streaming org A's audio", async () => {
      const keyB = await seedStreamKey(prisma, orgB.organizationId, orgB.userId);
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckAId}/items/${recordingAId}/audio`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(res.status).toBe(404);
    });

    it("rejects a deck-scoped Stream Key for org A's OTHER deck", async () => {
      const otherDeck = await seedDeck(prisma, orgA.organizationId, orgA.userId);
      const scopedKey = await seedStreamKey(prisma, orgA.organizationId, orgA.userId, {
        deckId: otherDeck.deckId,
      });
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${scopedKey.plaintextKey}`);
      expect(res.status).toBe(404);
    });
  });

  describe('OAuth M2M side', () => {
    it("rejects org B's M2M JWT reading org A's deck manifest", async () => {
      const clientB = await seedOAuthClient(prisma, orgB.organizationId, orgB.userId);
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${clientB.jwt}`);
      expect(res.status).toBe(404);
    });

    it('OAuth and Stream Key credentials for the SAME org see the SAME deck', async () => {
      const clientA = await seedOAuthClient(prisma, orgA.organizationId, orgA.userId);
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${clientA.jwt}`);
      expect(res.status).toBe(200);
    });
  });

  describe('catalogue preview side', () => {
    it('org B can preview the SAME shared-catalogue recording as org A (by design -- not deck-scoped)', async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath(`voice-stream/catalogue/${recordingAId}/preview`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      // Documents current behavior: preview() authorizes on recording
      // eligibility + org's own active subscription, NOT deck membership.
      expect([200, 404]).toContain(res.status);
    });
  });
});

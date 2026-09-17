import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@dialectiva/db';
import { createTestApp, apiPath, closeTestApp } from './support/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  seedOrg,
  seedDeck,
  seedStreamableRecording,
  seedStreamKey,
  cleanupOrgs,
  cleanupRecordings,
  waitForCondition,
  SeededOrg,
} from './support/fixtures';

/**
 * Section 64: "audit completeness tests". OrgActivityService.record() is
 * called from stream-keys.service.ts (create/revoke/rotate),
 * oauth-clients.service.ts (create/revoke), and now StreamDecksService/
 * PublicDecksService (create/rename/remove/addItem/removeItem/
 * setVisibility) -- all confirmed instrumented. updateRule is the one
 * remaining deck mutation with no activity event, since a Smart Deck
 * rule edit is a metadata change on an already-audited deck, not a new
 * mutation class.
 */
describe('audit completeness', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let org: SeededOrg;
  const orgIds: string[] = [];
  const recordingIds: string[] = [];

  async function activityCount(organizationId: string): Promise<number> {
    return prisma.orgActivityEvent.count({ where: { organizationId } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    org = await seedOrg(prisma);
    orgIds.push(org.organizationId);
  });

  afterAll(async () => {
    await cleanupRecordings(prisma, recordingIds);
    await cleanupOrgs(prisma, orgIds);
    await closeTestApp(app);
  });

  describe('instrumented: Stream Keys and OAuth Clients write activity events', () => {
    it('creating a Stream Key writes a KEY_CREATED activity event', async () => {
      const before = await activityCount(org.organizationId);
      const res = await request(app.getHttpServer())
        .post(apiPath('voice-stream/stream-keys'))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ scopes: ['DECK_LIST'] });
      expect(res.status).toBe(201);

      // orgActivity.record(...) call sites are void/fire-and-forget.
      await waitForCondition(async () => (await activityCount(org.organizationId)) > before);
      const events = await prisma.orgActivityEvent.findMany({
        where: { organizationId: org.organizationId, eventType: 'KEY_CREATED' },
      });
      expect(events.length).toBeGreaterThan(0);
      expect(await activityCount(org.organizationId)).toBeGreaterThan(before);
    });

    it('creating an OAuth client writes an OAUTH_CLIENT_CREATED activity event', async () => {
      const before = await activityCount(org.organizationId);
      const res = await request(app.getHttpServer())
        .post(apiPath('voice-stream/oauth/clients'))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ scopes: ['DECK_LIST'] });
      expect(res.status).toBe(201);

      await waitForCondition(async () => (await activityCount(org.organizationId)) > before);
      const events = await prisma.orgActivityEvent.findMany({
        where: { organizationId: org.organizationId, eventType: 'OAUTH_CLIENT_CREATED' },
      });
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('instrumented: StreamDecksService writes activity events for every mutation', () => {
    it('creating a deck writes a DECK_CREATED activity event', async () => {
      const before = await activityCount(org.organizationId);
      const res = await request(app.getHttpServer())
        .post(apiPath('voice-stream/stream-decks'))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ name: 'Audit test deck' });
      expect(res.status).toBe(201);

      await waitForCondition(async () => (await activityCount(org.organizationId)) > before);
      const events = await prisma.orgActivityEvent.findMany({
        where: { organizationId: org.organizationId, eventType: 'DECK_CREATED' },
      });
      expect(events.length).toBeGreaterThan(0);
    });

    it('renaming, adding an item, removing an item, and deleting a deck each write their own activity event', async () => {
      const deck = await seedDeck(prisma, org.organizationId, org.userId);
      const recording = await seedStreamableRecording(prisma);
      recordingIds.push(recording.recordingId);

      const rename = await request(app.getHttpServer())
        .patch(apiPath(`voice-stream/stream-decks/${deck.deckId}`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ name: 'Renamed' });
      expect(rename.status).toBe(200);
      await waitForCondition(
        async () =>
          (await prisma.orgActivityEvent.count({
            where: { organizationId: org.organizationId, eventType: 'DECK_RENAMED' },
          })) > 0,
      );

      const addItem = await request(app.getHttpServer())
        .post(apiPath(`voice-stream/stream-decks/${deck.deckId}/items`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ recordingId: recording.recordingId });
      expect(addItem.status).toBe(201);
      await waitForCondition(
        async () =>
          (await prisma.orgActivityEvent.count({
            where: { organizationId: org.organizationId, eventType: 'DECK_ITEM_ADDED' },
          })) > 0,
      );

      const removeItem = await request(app.getHttpServer())
        .delete(apiPath(`voice-stream/stream-decks/${deck.deckId}/items/${addItem.body.id}`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`);
      expect(removeItem.status).toBe(200);
      await waitForCondition(
        async () =>
          (await prisma.orgActivityEvent.count({
            where: { organizationId: org.organizationId, eventType: 'DECK_ITEM_REMOVED' },
          })) > 0,
      );

      const remove = await request(app.getHttpServer())
        .delete(apiPath(`voice-stream/stream-decks/${deck.deckId}`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`);
      expect(remove.status).toBe(200);
      await waitForCondition(
        async () =>
          (await prisma.orgActivityEvent.count({
            where: { organizationId: org.organizationId, eventType: 'DECK_DELETED' },
          })) > 0,
      );
    });

    it('publishing a deck writes a DECK_VISIBILITY_CHANGED activity event', async () => {
      const deck = await seedDeck(prisma, org.organizationId, org.userId);
      const before = await activityCount(org.organizationId);

      const res = await request(app.getHttpServer())
        .patch(apiPath(`voice-stream/stream-decks/${deck.deckId}/visibility`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ visibility: 'PUBLIC' });
      expect(res.status).toBe(200);

      await waitForCondition(async () => (await activityCount(org.organizationId)) > before);
      const events = await prisma.orgActivityEvent.findMany({
        where: { organizationId: org.organizationId, eventType: 'DECK_VISIBILITY_CHANGED' },
      });
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('StreamAccessLog: every manifest/audio request is logged regardless of outcome', () => {
    it('a successful manifest request produces an "allowed" StreamAccessLog row', async () => {
      const deck = await seedDeck(prisma, org.organizationId, org.userId);
      const key = await seedStreamKey(prisma, org.organizationId, org.userId);

      const before = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId, deckId: deck.deckId, requestType: 'manifest' },
      });
      const res = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(res.status).toBe(200);

      // logRequest() is fire-and-forget (void this.accessLog.record(...)),
      // so the write can land after the response returns.
      await waitForCondition(async () => {
        const count = await prisma.streamAccessLog.count({
          where: {
            organizationId: org.organizationId,
            deckId: deck.deckId,
            requestType: 'manifest',
          },
        });
        return count > before;
      });
      const after = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId, deckId: deck.deckId, requestType: 'manifest' },
      });
      expect(after).toBe(before + 1);

      const lastLog = await prisma.streamAccessLog.findFirst({
        where: { organizationId: org.organizationId, deckId: deck.deckId, requestType: 'manifest' },
        orderBy: { createdAt: 'desc' },
      });
      expect(lastLog?.entitlementDecision).toBe('allowed');
    });

    it('an audio stream request (allowed or denied) always produces a StreamAccessLog row', async () => {
      const deck = await seedDeck(prisma, org.organizationId, org.userId);
      const key = await seedStreamKey(prisma, org.organizationId, org.userId);

      const before = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId, deckId: deck.deckId, requestType: 'audio' },
      });
      // No item in this deck -> guaranteed 404 (denied:not_found_or_ineligible),
      // still must be logged.
      const res = await request(app.getHttpServer())
        .get(
          apiPath(
            `stream/v1/decks/${deck.deckId}/items/00000000-0000-0000-0000-000000000000/audio`,
          ),
        )
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(res.status).toBe(404);
      const after = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId, deckId: deck.deckId, requestType: 'audio' },
      });
      expect(after).toBe(before + 1);

      const lastLog = await prisma.streamAccessLog.findFirst({
        where: { organizationId: org.organizationId, deckId: deck.deckId, requestType: 'audio' },
        orderBy: { createdAt: 'desc' },
      });
      expect(lastLog?.entitlementDecision).toMatch(/^denied:/);
    });
  });
});

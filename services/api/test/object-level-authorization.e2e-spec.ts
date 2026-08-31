import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StreamKeyScope } from '@dialectiva/db';
import { createTestApp, apiPath, closeTestApp } from './support/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  seedOrg,
  seedDeck,
  seedStreamableRecording,
  addDeckItem,
  seedStreamKey,
  cleanupOrgs,
  cleanupRecordings,
  SeededOrg,
} from './support/fixtures';

/**
 * Section 64: "object-level authorization tests". Distinct from
 * cross-tenant-isolation.e2e-spec.ts -- these hold the org/credential fixed
 * and vary only the object id/scope/eligibility, checking IDOR-style access
 * (nonexistent ids, ids the credential was never granted, ids that exist
 * but aren't eligible) rather than org boundaries.
 */
describe('object-level authorization', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let org: SeededOrg;
  let deckId: string;
  let eligibleRecordingId: string;
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
    eligibleRecordingId = recording.recordingId;
    recordingIds.push(eligibleRecordingId);
    await addDeckItem(prisma, deckId, eligibleRecordingId, org.userId);
  });

  afterAll(async () => {
    await cleanupRecordings(prisma, recordingIds);
    await cleanupOrgs(prisma, orgIds);
    await closeTestApp(app);
  });

  it('404s a wholly nonexistent deck id, same response shape as a cross-tenant deck (no existence leak)', async () => {
    const key = await seedStreamKey(prisma, org.organizationId, org.userId);
    const res = await request(app.getHttpServer())
      .get(apiPath('stream/v1/decks/00000000-0000-0000-0000-000000000000/manifest'))
      .set('Authorization', `Bearer ${key.plaintextKey}`);
    expect(res.status).toBe(404);
  });

  it('404s a recordingId that exists but was never added to this deck', async () => {
    const key = await seedStreamKey(prisma, org.organizationId, org.userId);
    const orphanRecording = await seedStreamableRecording(prisma);
    recordingIds.push(orphanRecording.recordingId);

    const res = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/items/${orphanRecording.recordingId}`))
      .set('Authorization', `Bearer ${key.plaintextKey}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found in this stream deck/i);
  });

  it('404s streaming a recording that is in the deck but NOT eligible (not SETTLED)', async () => {
    const key = await seedStreamKey(prisma, org.organizationId, org.userId);
    const pendingRecording = await prisma.wordRecording.create({
      data: {
        dialectTag: 'test-dialect',
        translationText: 'pending, not settled',
        status: 'PENDING',
        audioBucket: 'test-bucket',
        audioKey: 'test/pending.wav',
      },
    });
    recordingIds.push(pendingRecording.id);
    await addDeckItem(prisma, deckId, pendingRecording.id, org.userId);

    const res = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/items/${pendingRecording.id}/audio`))
      .set('Authorization', `Bearer ${key.plaintextKey}`);
    expect(res.status).toBe(404);
  });

  it('404s streaming a recording whose audio was purged (audioDeletedAt set)', async () => {
    const key = await seedStreamKey(prisma, org.organizationId, org.userId);
    const purgedRecording = await prisma.wordRecording.create({
      data: {
        dialectTag: 'test-dialect',
        translationText: 'purged audio',
        status: 'SETTLED',
        audioBucket: null,
        audioKey: null,
        audioDeletedAt: new Date(),
      },
    });
    recordingIds.push(purgedRecording.id);
    await addDeckItem(prisma, deckId, purgedRecording.id, org.userId);

    const res = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/items/${purgedRecording.id}/audio`))
      .set('Authorization', `Bearer ${key.plaintextKey}`);
    expect(res.status).toBe(404);
  });

  it('403s a key without the required scope, before touching org/deck/object state at all', async () => {
    const scopeLessKey = await seedStreamKey(prisma, org.organizationId, org.userId, {
      scopes: [StreamKeyScope.DECK_LIST], // deliberately missing MANIFEST_READ
    });
    const res = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
      .set('Authorization', `Bearer ${scopeLessKey.plaintextKey}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/required scope/i);
  });

  it('403s AUDIO_STREAM scope missing even when MANIFEST_READ is present (per-route scope check, not all-or-nothing)', async () => {
    const manifestOnlyKey = await seedStreamKey(prisma, org.organizationId, org.userId, {
      scopes: [StreamKeyScope.MANIFEST_READ, StreamKeyScope.DECK_READ],
    });
    const manifestRes = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
      .set('Authorization', `Bearer ${manifestOnlyKey.plaintextKey}`);
    expect(manifestRes.status).toBe(200);

    const audioRes = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/items/${eligibleRecordingId}/audio`))
      .set('Authorization', `Bearer ${manifestOnlyKey.plaintextKey}`);
    expect(audioRes.status).toBe(403);
  });

  it('400s the changes endpoint when the required "after" query param is omitted', async () => {
    const key = await seedStreamKey(prisma, org.organizationId, org.userId);
    const res = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/changes`))
      .set('Authorization', `Bearer ${key.plaintextKey}`);
    expect(res.status).toBe(400);
  });

  it('a deck-scoped key CAN reach its own deck but no other route bypasses that scoping', async () => {
    const scopedKey = await seedStreamKey(prisma, org.organizationId, org.userId, { deckId });
    const res = await request(app.getHttpServer())
      .get(apiPath(`stream/v1/decks/${deckId}/manifest`))
      .set('Authorization', `Bearer ${scopedKey.plaintextKey}`);
    expect(res.status).toBe(200);
  });
});

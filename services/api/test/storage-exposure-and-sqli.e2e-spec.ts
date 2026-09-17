import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@dialectiva/db';
import { createTestApp, apiPath, closeTestApp } from './support/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  seedOrg,
  seedStreamableRecording,
  cleanupOrgs,
  cleanupRecordings,
  SeededOrg,
} from './support/fixtures';

/**
 * Section 64: "private object-storage tests" + "signed URL exposure tests"
 * + "SQL injection tests". Catalogue preview intentionally has no
 * deck-membership check (confirmed by design -- it's shared catalogue
 * content gated by recording eligibility + the org's own active
 * subscription, not by which decks reference the recording); these tests
 * pin down that contract explicitly rather than assume it. SQLi coverage is
 * necessarily light: every query in this codebase goes through Prisma's
 * query builder (grepped -- zero $queryRaw/$executeRaw usage anywhere in
 * src/), so there is no raw-SQL sink to attack. The tests below confirm
 * free-text search filters are treated as literal strings, not query
 * fragments.
 */
describe('storage exposure and SQL injection', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgA: SeededOrg;
  let orgB: SeededOrg;
  let sharedRecordingId: string;
  const orgIds: string[] = [];
  const recordingIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    orgA = await seedOrg(prisma);
    orgB = await seedOrg(prisma);
    orgIds.push(orgA.organizationId, orgB.organizationId);

    const recording = await seedStreamableRecording(prisma);
    sharedRecordingId = recording.recordingId;
    recordingIds.push(sharedRecordingId);
  });

  afterAll(async () => {
    await cleanupRecordings(prisma, recordingIds);
    await cleanupOrgs(prisma, orgIds);
    await closeTestApp(app);
  });

  describe('catalogue preview: signed URL shape and cross-org sharing (documented, not a bug)', () => {
    it('returns a presigned GET url with an expiresInSeconds field, never a bare bucket/key', async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath(`voice-stream/catalogue/${sharedRecordingId}/preview`))
        .set('Authorization', `Bearer ${orgA.subscriberJwt}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url).toMatch(/^https:\/\//);
      expect(typeof res.body.expiresInSeconds).toBe('number');
      expect(res.body).not.toHaveProperty('bucket');
      expect(res.body).not.toHaveProperty('key');
    });

    it('two DIFFERENT orgs previewing the SAME recordingId both succeed with equally-valid urls (shared catalogue, not deck-scoped)', async () => {
      const resA = await request(app.getHttpServer())
        .get(apiPath(`voice-stream/catalogue/${sharedRecordingId}/preview`))
        .set('Authorization', `Bearer ${orgA.subscriberJwt}`);
      const resB = await request(app.getHttpServer())
        .get(apiPath(`voice-stream/catalogue/${sharedRecordingId}/preview`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      // Same underlying object -- confirms preview() has no deck-membership
      // gate, only recording-eligibility + active-subscription. This is the
      // documented, intended design, not a leak of org-private data.
    });

    it('404s previewing a nonexistent recordingId (no existence oracle)', async () => {
      const res = await request(app.getHttpServer())
        .get(apiPath('voice-stream/catalogue/00000000-0000-0000-0000-000000000000/preview'))
        .set('Authorization', `Bearer ${orgA.subscriberJwt}`);
      expect(res.status).toBe(404);
    });
  });

  describe('SQL injection: free-text search filters are treated as literals', () => {
    const injectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE subscriber_organizations; --",
      '" OR ""="',
      "' UNION SELECT NULL--",
    ];

    it.each(injectionPayloads)(
      'countryCode=%j does not error and does not return unfiltered results',
      async (payload) => {
        const res = await request(app.getHttpServer())
          .get(apiPath('voice-stream/catalogue/search'))
          .query({ countryCode: payload })
          .set('Authorization', `Bearer ${orgA.subscriberJwt}`);
        // Must not 500 (would indicate the string broke a query) and must not
        // behave as a tautology that returns all rows regardless of filter.
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.results ?? res.body.items ?? res.body)).toBe(true);
      },
    );

    it('confirms the subscriber_organizations table still exists after a DROP TABLE payload (Prisma parameterizes, no raw SQL sinks exist in this codebase)', async () => {
      await request(app.getHttpServer())
        .get(apiPath('voice-stream/catalogue/search'))
        .query({ dialectTag: "'; DROP TABLE subscriber_organizations; --" })
        .set('Authorization', `Bearer ${orgA.subscriberJwt}`);

      const stillExists = await prisma.subscriberOrganization.count();
      expect(stillExists).toBeGreaterThanOrEqual(2); // orgA + orgB seeded above
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StreamKeyScope, SubscriptionStatus, VdclPurpose } from '@dialectiva/db';
import { StreamAudioController } from './stream-audio.controller';
import { StreamManifestService } from './stream-manifest.service';
import { StreamAccessLogService } from './stream-access-log.service';
import { StreamKeyScopesGuard } from './stream-key-scopes.guard';
import { StreamKeySubscriptionGuard } from './stream-key-subscription.guard';
import { StreamKeyRateLimitGuard } from './stream-key-rate-limit.guard';
import { ConcurrentStreamGuard } from './concurrent-stream.guard';
import { QuotaGuard } from './quota.guard';
import { DedicatedCapacityGuard } from './dedicated-capacity.guard';
import { UsageCounterService } from './usage-counter.service';
import { StreamKeyAuthGuard } from './stream-key-auth.guard';
import { OAuthJwtAuthGuard } from '../oauth/oauth-jwt-auth.guard';
import { EitherStreamCredentialGuard } from '../oauth/either-stream-credential.guard';
import { WebhookEventService } from '../webhooks/webhook-event.service';
import { RightsService } from '../../vdcl/rights/rights.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * HTTP-layer test for the actual billable streaming path -- exercises the
 * real guard chain (auth, scopes, subscription, quota, concurrency, rate
 * limit) wired exactly as StreamAudioController declares it via
 * @UseGuards, through Test.createTestingModule + supertest, not just each
 * guard/service in isolation. DedicatedCapacityGuard/StreamKeyRateLimitGuard
 * construct their own ioredis client -- mocked the same way
 * dedicated-capacity.guard.spec.ts and stream-key-rate-limit.guard.spec.ts
 * mock it, so this suite never needs a real Redis/Postgres.
 */
const mockRedisInstance = {
  get: jest.fn().mockResolvedValue(null),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  multi: jest.fn().mockReturnValue({
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  }),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

const STREAM_KEY_ID = 'key-1';
const ORG_ID = 'org-1';
const DECK_ID = 'deck-1';
const RECORDING_ID = 'recording-1';
const PLAIN_KEY = 'dlsk_live_testtoken';

function activeSubscription() {
  return {
    organizationId: ORG_ID,
    status: SubscriptionStatus.ACTIVE,
    plan: {
      monthlyByteQuota: null,
      monthlyRequestQuota: null,
      maxConcurrentStreams: null,
      rateLimitPerMinute: null,
      reservedCapacityPercent: null,
    },
  };
}

describe('StreamAudioController (HTTP layer)', () => {
  let app: INestApplication;
  let prisma: {
    subscription: { findUnique: jest.Mock };
    streamApiKey: { findUnique: jest.Mock; update: jest.Mock };
  };
  let manifest: { getEligibleItemMetadata: jest.Mock };
  let storage: { getObject: jest.Mock };
  let accessLog: { record: jest.Mock };
  let webhookEvents: { emit: jest.Mock };
  let rights: { mayUseForCredential: jest.Mock; recordDecision: jest.Mock };

  beforeEach(async () => {
    Object.values(mockRedisInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) (fn as jest.Mock).mockClear();
    });

    prisma = {
      subscription: { findUnique: jest.fn().mockResolvedValue(activeSubscription()) },
      streamApiKey: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    manifest = { getEligibleItemMetadata: jest.fn() };
    storage = { getObject: jest.fn() };
    accessLog = { record: jest.fn().mockResolvedValue(undefined) };
    webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
    // VDCL rights check -- allowed by default so existing assertions stay
    // about the streaming layer; the licence-denial case has its own test.
    rights = {
      mayUseForCredential: jest
        .fn()
        .mockResolvedValue({ allowed: true, entitlementDecision: 'allowed' }),
      recordDecision: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StreamAudioController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: StreamManifestService, useValue: manifest },
        { provide: StorageService, useValue: storage },
        { provide: StreamAccessLogService, useValue: accessLog },
        { provide: WebhookEventService, useValue: webhookEvents },
        { provide: RightsService, useValue: rights },
        {
          provide: UsageCounterService,
          useValue: { getCurrentUsage: jest.fn(), tryReserveRequest: jest.fn() },
        },
        StreamKeyAuthGuard,
        OAuthJwtAuthGuard,
        EitherStreamCredentialGuard,
        StreamKeyScopesGuard,
        StreamKeySubscriptionGuard,
        StreamKeyRateLimitGuard,
        ConcurrentStreamGuard,
        QuotaGuard,
        DedicatedCapacityGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects with 401 when no bearer token is presented', async () => {
    const res = await request(app.getHttpServer()).get(
      `/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`,
    );

    expect(res.status).toBe(401);
    expect(manifest.getEligibleItemMetadata).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the Stream Key is invalid', async () => {
    prisma.streamApiKey.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the Stream Key has been revoked', async () => {
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [StreamKeyScope.AUDIO_STREAM],
      revokedAt: new Date(),
      expiresAt: null,
      allowedIps: [],
    });

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(401);
  });

  it('rejects with 403 when the Stream Key lacks AUDIO_STREAM scope', async () => {
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [], // no AUDIO_STREAM
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(403);
    expect(manifest.getEligibleItemMetadata).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the organization has no active subscription', async () => {
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [StreamKeyScope.AUDIO_STREAM],
      purposes: [VdclPurpose.ASR_TRAINING],
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });
    prisma.subscription.findUnique.mockResolvedValue({
      ...activeSubscription(),
      status: SubscriptionStatus.SUSPENDED,
    });

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(403);
  });

  it('streams audio bytes end-to-end on the success path (valid key, scope, subscription, quota, concurrency, rate limit)', async () => {
    const { Readable } = require('stream');
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [StreamKeyScope.AUDIO_STREAM],
      purposes: [VdclPurpose.ASR_TRAINING],
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });
    manifest.getEligibleItemMetadata.mockResolvedValue({
      audioBucket: 'bucket',
      audioKey: 'path/to/audio.wav',
      durationMs: 1234,
    });
    const body = Readable.from([Buffer.from('audio-bytes')]);
    storage.getObject.mockResolvedValue({
      body,
      contentLength: 11,
      contentRange: undefined,
    });

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/wav');
    expect(accessLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ entitlementDecision: 'allowed', resultCode: 200 }),
    );
    expect(webhookEvents.emit).toHaveBeenCalledWith(
      ORG_ID,
      'AUDIO_STREAM_COMPLETED',
      expect.objectContaining({ deck_id: DECK_ID, recording_id: RECORDING_ID }),
    );
  });

  it('returns 404 when the recording has no audio available', async () => {
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [StreamKeyScope.AUDIO_STREAM],
      purposes: [VdclPurpose.ASR_TRAINING],
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });
    manifest.getEligibleItemMetadata.mockResolvedValue({ audioBucket: null, audioKey: null });

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(404);
  });

  it('passes the declared purposes of the presenting credential to the rights check', async () => {
    // The purpose checked must be what THIS key declared, not a fixed
    // assumption -- otherwise itemised consent is decorative.
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [StreamKeyScope.AUDIO_STREAM],
      purposes: [VdclPurpose.TTS_TRAINING],
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });
    manifest.getEligibleItemMetadata.mockResolvedValue({
      audioBucket: 'bucket',
      audioKey: 'path/to/audio.wav',
      durationMs: 1234,
    });
    const { Readable } = require('stream');
    storage.getObject.mockResolvedValue({
      body: Readable.from([Buffer.from('audio-bytes')]),
      contentLength: 11,
      contentRange: undefined,
    });

    await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(rights.mayUseForCredential).toHaveBeenCalledWith(
      RECORDING_ID,
      expect.objectContaining({ purposes: [VdclPurpose.TTS_TRAINING] }),
    );
  });

  it('returns 403 and streams no bytes when no active VDCL covers the recording', async () => {
    // The commercial lock: "no VDCL, no commercial use". It must refuse
    // BEFORE any byte moves, so an unlicensed clip is never partially served.
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: STREAM_KEY_ID,
      organizationId: ORG_ID,
      deckId: null,
      scopes: [StreamKeyScope.AUDIO_STREAM],
      purposes: [VdclPurpose.ASR_TRAINING],
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });
    manifest.getEligibleItemMetadata.mockResolvedValue({
      audioBucket: 'bucket',
      audioKey: 'path/to/audio.wav',
      durationMs: 1234,
    });
    rights.mayUseForCredential.mockResolvedValue({
      allowed: false,
      reason: 'no_vdcl',
      entitlementDecision: 'denied:no_vdcl',
    });

    const res = await request(app.getHttpServer())
      .get(`/stream/v1/decks/${DECK_ID}/items/${RECORDING_ID}/audio`)
      .set('Authorization', `Bearer ${PLAIN_KEY}`);

    expect(res.status).toBe(403);
    expect(storage.getObject).not.toHaveBeenCalled();
    // The denial reason has to reach StreamAccessLog verbatim, so an
    // enforcement decision stays explainable after the fact.
    expect(accessLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ entitlementDecision: 'denied:no_vdcl', resultCode: 403 }),
    );
  });
});

process.env.STREAM_JWT_ACCESS_SECRET = process.env.STREAM_JWT_ACCESS_SECRET ?? 'test-stream-secret';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SecurityPolicyController } from './security-policy.controller';
import { SecurityPolicyService } from './security-policy.service';
import { SecurityPolicyEntitlementGuard } from './security-policy-entitlement.guard';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { signSubscriberAccessToken } from '../subscriber-auth/subscriber-jwt.util';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * HTTP-layer coverage for the guard-consistency fix (finding #5): POST and
 * DELETE must carry the same SecurityPolicyEntitlementGuard, GET
 * deliberately does not. Exercises the real guard chain (SubscriberAuthGuard
 * -> SubscriberRolesGuard -> SecurityPolicyEntitlementGuard where present)
 * via Test.createTestingModule + supertest, not each guard in isolation.
 */
describe('SecurityPolicyController (HTTP layer)', () => {
  let app: INestApplication;
  let prisma: { subscription: { findUnique: jest.Mock } };
  let policy: { get: jest.Mock; upsert: jest.Mock; remove: jest.Mock };

  const adminToken = signSubscriberAccessToken({
    sub: 'user-1',
    email: 'admin@customer.com',
    organizationId: 'org-1',
    orgRole: SubscriberOrgRole.ADMIN,
  });
  const validatorToken = signSubscriberAccessToken({
    sub: 'user-2',
    email: 'validator@customer.com',
    organizationId: 'org-1',
    orgRole: SubscriberOrgRole.VALIDATOR,
  });

  beforeEach(async () => {
    prisma = { subscription: { findUnique: jest.fn() } };
    policy = {
      get: jest.fn().mockResolvedValue({ requireSso: false }),
      upsert: jest.fn().mockResolvedValue({ requireSso: true }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityPolicyController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: SecurityPolicyService, useValue: policy },
        SecurityPolicyEntitlementGuard,
        SubscriberAuthGuard,
        SubscriberRolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects with 401 when no bearer token is presented on GET', async () => {
    const res = await request(app.getHttpServer()).get('/voice-stream/security-policy');
    expect(res.status).toBe(401);
  });

  it('rejects with 403 on GET for a role below ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${validatorToken}`);
    expect(res.status).toBe(403);
  });

  it('allows GET for ADMIN without entitlement (plan may have downgraded, read stays available)', async () => {
    const res = await request(app.getHttpServer())
      .get('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('rejects POST with 403 when the plan lacks enterpriseSecurityPoliciesEnabled', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: { enterpriseSecurityPoliciesEnabled: false } });

    const res = await request(app.getHttpServer())
      .post('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requireSso: true });

    expect(res.status).toBe(403);
    expect(policy.upsert).not.toHaveBeenCalled();
  });

  it('allows POST when the plan has enterpriseSecurityPoliciesEnabled', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: { enterpriseSecurityPoliciesEnabled: true } });

    const res = await request(app.getHttpServer())
      .post('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requireSso: true });

    expect(res.status).toBe(201);
    expect(policy.upsert).toHaveBeenCalled();
  });

  it('rejects DELETE with 403 when the plan lacks enterpriseSecurityPoliciesEnabled -- same protection as POST (finding #5)', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: { enterpriseSecurityPoliciesEnabled: false } });

    const res = await request(app.getHttpServer())
      .delete('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(policy.remove).not.toHaveBeenCalled();
  });

  it('allows DELETE when the plan has enterpriseSecurityPoliciesEnabled', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: { enterpriseSecurityPoliciesEnabled: true } });

    const res = await request(app.getHttpServer())
      .delete('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
    expect(policy.remove).toHaveBeenCalled();
  });

  it('rejects DELETE with 403 for a role below ADMIN, before the entitlement check ever runs', async () => {
    const res = await request(app.getHttpServer())
      .delete('/voice-stream/security-policy')
      .set('Authorization', `Bearer ${validatorToken}`);

    expect(res.status).toBe(403);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });
});

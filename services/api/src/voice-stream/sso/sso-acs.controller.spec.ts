import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SsoAcsController } from './sso-acs.controller';
import { SsoService } from './sso.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * HTTP-layer test for the SAML ACS endpoint -- the untrusted, unauthenticated
 * surface an external IdP POSTs to. No guard chain to exercise here (this
 * controller is deliberately NOT behind SubscriberAuthGuard), so the
 * meaningful "real request handling" coverage is: missing org resolves to
 * the right error, an inactive/absent SsoIdpConfig 404s before any SAML
 * parsing happens, and a validated assertion round-trips to the auth result
 * shape the dashboard expects.
 */
describe('SsoAcsController (HTTP layer)', () => {
  let app: INestApplication;
  let prisma: { ssoIdpConfig: { findUnique: jest.Mock } };
  let sso: { generateMetadata: jest.Mock; getLoginRedirectUrl: jest.Mock; handleAcsPost: jest.Mock };

  beforeEach(async () => {
    prisma = { ssoIdpConfig: { findUnique: jest.fn() } };
    sso = {
      generateMetadata: jest.fn(),
      getLoginRedirectUrl: jest.fn(),
      handleAcsPost: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAcsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: SsoService, useValue: sso },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects with 401 when the ?org= query param is missing on /acs', async () => {
    const res = await request(app.getHttpServer())
      .post('/voice-stream/sso/acs')
      .send({ SAMLResponse: 'irrelevant-for-this-case' });

    expect(res.status).toBe(401);
    expect(prisma.ssoIdpConfig.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when no SsoIdpConfig exists for the organization', async () => {
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/voice-stream/sso/acs?org=org-1')
      .send({ SAMLResponse: 'irrelevant-for-this-case' });

    expect(res.status).toBe(404);
    expect(sso.handleAcsPost).not.toHaveBeenCalled();
  });

  it('returns 404 when the org has an SsoIdpConfig but it is deactivated', async () => {
    prisma.ssoIdpConfig.findUnique.mockResolvedValue({ id: 'idp-1', organizationId: 'org-1', active: false });

    const res = await request(app.getHttpServer())
      .post('/voice-stream/sso/acs?org=org-1')
      .send({ SAMLResponse: 'irrelevant-for-this-case' });

    expect(res.status).toBe(404);
  });

  it('returns 401 when SsoService.handleAcsPost rejects an invalid SAML response', async () => {
    prisma.ssoIdpConfig.findUnique.mockResolvedValue({ id: 'idp-1', organizationId: 'org-1', active: true });
    sso.handleAcsPost.mockRejectedValue(new Error('Invalid SAML response'));

    const res = await request(app.getHttpServer())
      .post('/voice-stream/sso/acs?org=org-1')
      .send({ SAMLResponse: 'forged-or-malformed' });

    expect(res.status).toBe(500);
  });

  it('succeeds on a valid assertion and returns the auth result from SsoService', async () => {
    const config = { id: 'idp-1', organizationId: 'org-1', active: true };
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(config);
    sso.handleAcsPost.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'jane@customer.com', firstName: 'Jane', lastName: 'Doe' },
      organizationId: 'org-1',
      orgRole: 'VALIDATOR',
    });

    const res = await request(app.getHttpServer())
      .post('/voice-stream/sso/acs?org=org-1')
      .send({ SAMLResponse: 'a-valid-base64-response' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('access-token');
    expect(sso.handleAcsPost).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ SAMLResponse: 'a-valid-base64-response' }),
    );
  });

  it('returns 404 for /metadata when SSO is not configured for the org', async () => {
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer()).get('/voice-stream/sso/org-1/metadata');

    expect(res.status).toBe(404);
  });
});

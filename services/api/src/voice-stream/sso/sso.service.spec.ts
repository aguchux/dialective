import { UnauthorizedException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SsoService } from './sso.service';

function setup() {
  const prisma: any = {
    ssoIdentity: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    subscriberUser: { findUnique: jest.fn(), create: jest.fn() },
    subscriberMembership: { findUnique: jest.fn(), create: jest.fn() },
    ssoRequestCache: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const subscriberAuth = {
    issueAuthResult: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'b',
      user: { id: 'user-1', email: 'a@b.com', firstName: 'A', lastName: 'B' },
      organizationId: 'org-1',
      orgRole: SubscriberOrgRole.VALIDATOR,
    }),
  };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SsoService(prisma as never, subscriberAuth as never, orgActivity as never);
  return { service, prisma, subscriberAuth, orgActivity };
}

const config = {
  id: 'idp-1',
  organizationId: 'org-1',
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'CERT',
  spEntityId: 'sp-entity-1',
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  emailAttribute: 'email',
  firstNameAttribute: 'firstName',
  lastNameAttribute: 'lastName',
  defaultRole: SubscriberOrgRole.VALIDATOR,
  active: true,
  createdByUserId: 'admin-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe('SsoService.handleAssertion', () => {
  const assertion = {
    nameId: 'saml-subject-1',
    email: 'jane@customer.com',
    firstName: 'Jane',
    lastName: 'Doe',
  };

  it('repeat login: updates lastLoginAt, issues tokens for the linked user, does not create a new SubscriberUser', async () => {
    const { service, prisma, subscriberAuth, orgActivity } = setup();
    const linkedUser = { id: 'user-1', email: assertion.email, firstName: 'Jane', lastName: 'Doe' };
    prisma.ssoIdentity.findUnique.mockResolvedValue({ id: 'identity-1', userId: 'user-1', user: linkedUser });

    const result = await service.handleAssertion(config, assertion);

    expect(prisma.ssoIdentity.update).toHaveBeenCalledWith({
      where: { id: 'identity-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(prisma.subscriberUser.create).not.toHaveBeenCalled();
    expect(subscriberAuth.issueAuthResult).toHaveBeenCalledWith(linkedUser);
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'SSO_LOGIN',
      'user-1',
      expect.objectContaining({ nameId: assertion.nameId }),
    );
    expect(result.accessToken).toBe('a');
  });

  it('brand-new email: creates a password-less SubscriberUser, an SsoIdentity, and a membership with config.defaultRole', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdentity.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.create.mockResolvedValue({ id: 'user-2', email: assertion.email });
    prisma.subscriberMembership.findUnique.mockResolvedValue(null);

    await service.handleAssertion(config, assertion);

    expect(prisma.subscriberUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: assertion.email,
        passwordHash: null,
        emailVerifiedAt: expect.any(Date),
      }),
    });
    expect(prisma.ssoIdentity.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', idpConfigId: config.id, nameId: assertion.nameId },
    });
    expect(prisma.subscriberMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        organizationId: 'org-1',
        role: SubscriberOrgRole.VALIDATOR,
      }),
    });
  });

  it('links to an existing SubscriberUser by email (no prior SsoIdentity) without creating a duplicate user', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdentity.findUnique.mockResolvedValue(null);
    const existingUser = { id: 'user-3', email: assertion.email };
    prisma.subscriberUser.findUnique.mockResolvedValue(existingUser);
    prisma.subscriberMembership.findUnique.mockResolvedValue(null);

    await service.handleAssertion(config, assertion);

    expect(prisma.subscriberUser.create).not.toHaveBeenCalled();
    expect(prisma.ssoIdentity.create).toHaveBeenCalledWith({
      data: { userId: 'user-3', idpConfigId: config.id, nameId: assertion.nameId },
    });
    expect(prisma.subscriberMembership.create).toHaveBeenCalled();
  });

  it('does not create a duplicate membership when one already exists for this org', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdentity.findUnique.mockResolvedValue(null);
    const existingUser = { id: 'user-4', email: assertion.email };
    prisma.subscriberUser.findUnique.mockResolvedValue(existingUser);
    prisma.subscriberMembership.findUnique.mockResolvedValue({ id: 'membership-1' });

    await service.handleAssertion(config, assertion);

    expect(prisma.subscriberMembership.create).not.toHaveBeenCalled();
  });

  it('never assigns SubscriberOrgRole.OWNER via JIT -- always uses config.defaultRole', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdentity.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.create.mockResolvedValue({ id: 'user-5', email: assertion.email });
    prisma.subscriberMembership.findUnique.mockResolvedValue(null);

    await service.handleAssertion(
      { ...config, defaultRole: SubscriberOrgRole.DATASET_MANAGER },
      assertion,
    );

    expect(prisma.subscriberMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: SubscriberOrgRole.DATASET_MANAGER }),
    });
  });
});

describe('SsoService.handleAcsPost', () => {
  it('rejects when validatePostResponseAsync throws (e.g. unsigned assertion)', async () => {
    const { service } = setup();
    jest.spyOn(service, 'buildSamlClient').mockReturnValue({
      validatePostResponseAsync: jest.fn().mockRejectedValue(new Error('invalid signature')),
    } as never);

    await expect(service.handleAcsPost(config, {})).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when loggedOut is true', async () => {
    const { service } = setup();
    jest.spyOn(service, 'buildSamlClient').mockReturnValue({
      validatePostResponseAsync: jest.fn().mockResolvedValue({ profile: null, loggedOut: true }),
    } as never);

    await expect(service.handleAcsPost(config, {})).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when profile is missing', async () => {
    const { service } = setup();
    jest.spyOn(service, 'buildSamlClient').mockReturnValue({
      validatePostResponseAsync: jest.fn().mockResolvedValue({ profile: null, loggedOut: false }),
    } as never);

    await expect(service.handleAcsPost(config, {})).rejects.toThrow(UnauthorizedException);
  });

  it('maps profile attributes and issues tokens on a valid assertion', async () => {
    const { service, prisma, subscriberAuth } = setup();
    prisma.ssoIdentity.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.create.mockResolvedValue({ id: 'user-6', email: 'jane@customer.com' });
    prisma.subscriberMembership.findUnique.mockResolvedValue(null);

    jest.spyOn(service, 'buildSamlClient').mockReturnValue({
      validatePostResponseAsync: jest.fn().mockResolvedValue({
        profile: {
          nameID: 'saml-subject-1',
          nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
          issuer: 'https://idp.example.com',
          email: 'jane@customer.com',
          firstName: 'Jane',
          lastName: 'Doe',
        },
        loggedOut: false,
      }),
    } as never);

    const result = await service.handleAcsPost(config, {});

    expect(prisma.ssoIdentity.create).toHaveBeenCalledWith({
      data: { userId: 'user-6', idpConfigId: config.id, nameId: 'saml-subject-1' },
    });
    expect(subscriberAuth.issueAuthResult).toHaveBeenCalled();
    expect(result.accessToken).toBe('a');
  });

  it('falls back to nameID for email and derives firstName from the email local-part when attributes are absent', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdentity.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.findUnique.mockResolvedValue(null);
    prisma.subscriberUser.create.mockResolvedValue({ id: 'user-7', email: 'bare@customer.com' });
    prisma.subscriberMembership.findUnique.mockResolvedValue(null);

    jest.spyOn(service, 'buildSamlClient').mockReturnValue({
      validatePostResponseAsync: jest.fn().mockResolvedValue({
        profile: {
          nameID: 'bare@customer.com',
          nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
          issuer: 'https://idp.example.com',
        },
        loggedOut: false,
      }),
    } as never);

    await service.handleAcsPost(config, {});

    expect(prisma.subscriberUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'bare@customer.com',
        firstName: 'bare',
        lastName: '',
      }),
    });
  });
});

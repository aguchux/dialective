import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SsoIdpConfigService } from './sso-idp-config.service';

function setup() {
  const prisma: any = {
    ssoIdpConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SsoIdpConfigService(prisma as never, orgActivity as never);
  return { service, prisma, orgActivity };
}

const dto = {
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'CERT',
};

describe('SsoIdpConfigService.create', () => {
  it('creates a config with a generated spEntityId when none exists yet', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(null);
    prisma.ssoIdpConfig.create.mockResolvedValue({ id: 'idp-1', ...dto, spEntityId: 'generated' });

    await service.create('org-1', 'admin-1', dto);

    expect(prisma.ssoIdpConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        idpEntityId: dto.idpEntityId,
        spEntityId: expect.any(String),
        createdByUserId: 'admin-1',
      }),
    });
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'SSO_CONFIGURED',
      'admin-1',
      expect.anything(),
    );
  });

  it('rejects a second config for an org that already has one', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.create('org-1', 'admin-1', dto)).rejects.toThrow(ConflictException);
    expect(prisma.ssoIdpConfig.create).not.toHaveBeenCalled();
  });

  it('rejects defaultRole=OWNER', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(null);

    await expect(
      service.create('org-1', 'admin-1', { ...dto, defaultRole: SubscriberOrgRole.OWNER }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ssoIdpConfig.create).not.toHaveBeenCalled();
  });
});

describe('SsoIdpConfigService.update', () => {
  it('rejects cross-org access with 404, not 403', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(null);

    await expect(service.update('org-1', 'admin-1', { idpEntityId: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects defaultRole=OWNER on update too', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue({ id: 'idp-1', organizationId: 'org-1' });

    await expect(
      service.update('org-1', 'admin-1', { defaultRole: SubscriberOrgRole.OWNER }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SsoIdpConfigService.remove', () => {
  it('rejects when no config exists', async () => {
    const { service, prisma } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue(null);

    await expect(service.remove('org-1', 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('deletes and records an activity event on success', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.ssoIdpConfig.findUnique.mockResolvedValue({
      id: 'idp-1',
      organizationId: 'org-1',
      idpEntityId: dto.idpEntityId,
    });

    await service.remove('org-1', 'admin-1');

    expect(prisma.ssoIdpConfig.delete).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'SSO_DISABLED',
      'admin-1',
      expect.anything(),
    );
  });
});

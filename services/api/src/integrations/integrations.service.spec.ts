import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { IntegrationsService } from './integrations.service';
import { INTEGRATION_REGISTRY } from './integration-registry';

describe('IntegrationsService', () => {
  const userId = 'user-1';
  const integration = {
    id: 'integration-1',
    slug: 'whatsapp-validator',
    name: 'WhatsApp Validator',
    description: "Peer-verify a member's WhatsApp number.",
    category: 'Verification',
    iconKey: 'MessageCircle',
    enabled: true,
    feeTokenAmount: new Prisma.Decimal(2),
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * The eligibility facts loadEligibilityFacts reads. Defaults to a member
   * who clears every bar, so a test only states the fact it is about.
   */
  const eligibleUser = {
    phoneVerifiedAt: new Date(),
    kycStatus: 'APPROVED',
    _count: { wordRecordings: 500 },
  };

  /** The user shape the admin queue selects, for update() mock returns. */
  const adminUser = {
    id: userId,
    email: 'a@b.c',
    firstName: null,
    lastName: null,
    phoneNumber: '+2348012345678',
    phoneVerifiedAt: new Date(),
    kycStatus: 'APPROVED',
    _count: { wordRecordings: 120 },
  };

  let prisma: any;
  let service: IntegrationsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(eligibleUser) },
      integration: {
        findMany: jest.fn().mockResolvedValue([integration]),
        findUnique: jest.fn().mockResolvedValue(integration),
        upsert: jest.fn().mockResolvedValue(integration),
        update: jest.fn().mockResolvedValue(integration),
      },
      integrationSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'PENDING' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new IntegrationsService(prisma);
  });

  describe('list', () => {
    it('only returns enabled integrations', async () => {
      await service.list(userId, {});
      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ enabled: true }) }),
      );
    });

    it('applies a case-insensitive search across name/description/category', async () => {
      await service.list(userId, { search: 'whatsapp' });
      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'whatsapp', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('marks an APPROVED subscription as subscribed', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        { integrationId: integration.id, status: 'APPROVED' },
      ]);
      const [result] = await service.list(userId, {});
      expect(result.subscribed).toBe(true);
      expect(result.subscriptionStatus).toBe('APPROVED');
    });

    it('does NOT mark a PENDING request as subscribed', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        { integrationId: integration.id, status: 'PENDING' },
      ]);
      const [result] = await service.list(userId, {});
      // Requesting access is not having it -- an admin has not decided yet.
      expect(result.subscribed).toBe(false);
      expect(result.subscriptionStatus).toBe('PENDING');
    });

    it('marks unsubscribed integrations', async () => {
      const [result] = await service.list(userId, {});
      expect(result.subscribed).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('rejects subscribing to a disabled/missing integration', async () => {
      prisma.integration.findUnique.mockResolvedValue({ ...integration, enabled: false });
      await expect(service.subscribe(userId, integration.id)).rejects.toThrow(NotFoundException);
    });

    it('creates a PENDING request rather than granting access', async () => {
      const result = await service.subscribe(userId, integration.id);
      expect(result.subscriptionStatus).toBe('PENDING');
      expect(result.subscribed).toBe(false);
    });

    it('is idempotent on a duplicate request, without resetting an approval', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'APPROVED',
      });
      const result = await service.subscribe(userId, integration.id);
      expect(result.subscribed).toBe(true);
      // A double-tap must never knock an approved member back to pending.
      expect(prisma.integrationSubscription.update).not.toHaveBeenCalled();
      expect(prisma.integrationSubscription.create).not.toHaveBeenCalled();
    });

    it('lets a rejected member request again, clearing the old decision', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'REJECTED',
      });
      await service.subscribe(userId, integration.id);
      expect(prisma.integrationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            reviewedAt: null,
            reviewNote: null,
          }),
        }),
      );
    });
  });

  /**
   * ID Review's bar: verified phone, approved KYC, 100 completed tasks.
   * WhatsApp Validator deliberately has none, which is why every test
   * above passes an unqualified member without noticing.
   */
  describe('eligibility -- who may request access', () => {
    const idReview = {
      ...integration,
      id: 'integration-2',
      slug: 'p2p-kyc-review',
      name: 'ID Review',
    };

    beforeEach(() => {
      prisma.integration.findUnique.mockResolvedValue(idReview);
      prisma.integration.findMany.mockResolvedValue([idReview]);
    });

    it('lets a member who clears every bar request access', async () => {
      const result = await service.subscribe(userId, idReview.id);
      expect(result.subscriptionStatus).toBe('PENDING');
      expect(prisma.integrationSubscription.create).toHaveBeenCalled();
    });

    it.each([
      ['an unverified phone', { phoneVerifiedAt: null }],
      ['unapproved KYC', { kycStatus: 'IN_REVIEW' }],
      ['too few tasks', { _count: { wordRecordings: 99 } }],
    ])('refuses a member with %s, without reaching the admin queue', async (_label, override) => {
      prisma.user.findUnique.mockResolvedValue({ ...eligibleUser, ...override });
      await expect(service.subscribe(userId, idReview.id)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.integrationSubscription.create).not.toHaveBeenCalled();
    });

    it('names every unmet requirement, so the member knows the whole bar', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phoneVerifiedAt: null,
        kycStatus: 'NOT_STARTED',
        _count: { wordRecordings: 3 },
      });
      await expect(service.subscribe(userId, idReview.id)).rejects.toThrow(
        /Verified phone number.*Approved KYC.*100 completed tasks/s,
      );
    });

    it('counts exactly the minimum as enough', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...eligibleUser,
        _count: { wordRecordings: 100 },
      });
      await expect(service.subscribe(userId, idReview.id)).resolves.toBeDefined();
    });

    it('does not re-gate a member who is already approved', async () => {
      // A rule that tightens later is the admin's to act on by revoking,
      // not something that silently strips access on the next page load.
      prisma.user.findUnique.mockResolvedValue({ ...eligibleUser, phoneVerifiedAt: null });
      prisma.integrationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'APPROVED',
      });
      const result = await service.subscribe(userId, idReview.id);
      expect(result.subscribed).toBe(true);
    });

    it('re-gates a member who was rejected and is trying again', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...eligibleUser, kycStatus: 'DECLINED' });
      prisma.integrationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'REJECTED',
      });
      await expect(service.subscribe(userId, idReview.id)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('shows the full bar on the marketplace card, met or not', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...eligibleUser, _count: { wordRecordings: 40 } });
      const [result] = await service.list(userId, {});
      expect(result.eligible).toBe(false);
      expect(result.eligibilityRequirements).toEqual([
        { label: 'Verified phone number', met: true },
        { label: 'Approved KYC', met: true },
        { label: '100 completed tasks (you have 40)', met: false },
      ]);
    });

    it('leaves an integration with no rule open to everyone', async () => {
      // A slug absent from the registry falls back to an empty rule. Both
      // shipped integrations now carry a bar, so this pins the fallback
      // itself rather than whichever one happens to be unrestricted.
      prisma.integration.findMany.mockResolvedValue([
        { ...integration, slug: 'unregistered-integration' },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        phoneVerifiedAt: null,
        kycStatus: 'NOT_STARTED',
        _count: { wordRecordings: 0 },
      });
      const [result] = await service.list(userId, {});
      expect(result.eligible).toBe(true);
      expect(result.eligibilityRequirements).toEqual([]);
    });
  });

  /**
   * WhatsApp Validator confirms someone else's number, so a validator
   * must have proven their own and be identified -- but no task bar:
   * relaying a code is not how value leaves the platform.
   */
  describe('eligibility -- WhatsApp Validator', () => {
    it('requires a verified mobile and approved KYC', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phoneVerifiedAt: null,
        kycStatus: 'NOT_STARTED',
        _count: { wordRecordings: 5000 },
      });
      await expect(service.subscribe(userId, integration.id)).rejects.toThrow(
        /Verified phone number.*Approved KYC/s,
      );
    });

    it('does NOT require a task history', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phoneVerifiedAt: new Date(),
        kycStatus: 'APPROVED',
        _count: { wordRecordings: 0 },
      });
      const [result] = await service.list(userId, {});
      expect(result.eligible).toBe(true);
      expect(result.eligibilityRequirements).toEqual([
        { label: 'Verified phone number', met: true },
        { label: 'Approved KYC', met: true },
      ]);
    });
  });

  describe('listSubscriptionsForAdmin -- the member facts an admin reviews', () => {
    it('returns the mobile, its verification state, KYC status and task count', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          status: 'PENDING',
          subscribedAt: new Date(),
          reviewedAt: null,
          reviewNote: null,
          certified: false,
          certifiedAt: null,
          integration: { id: integration.id, slug: 'p2p-kyc-review', name: 'ID Review' },
          user: adminUser,
        },
      ]);
      const [row] = await service.listSubscriptionsForAdmin();
      expect(row.user).toEqual(
        expect.objectContaining({
          email: 'a@b.c',
          phoneNumber: '+2348012345678',
          phoneVerified: true,
          kycStatus: 'APPROVED',
          taskCount: 120,
        }),
      );
    });

    it('reports an unverified number as unverified rather than omitting it', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          status: 'PENDING',
          subscribedAt: new Date(),
          reviewedAt: null,
          reviewNote: null,
          certified: false,
          certifiedAt: null,
          integration: { id: integration.id, slug: 'p2p-kyc-review', name: 'ID Review' },
          user: { ...adminUser, phoneVerifiedAt: null },
        },
      ]);
      const [row] = await service.listSubscriptionsForAdmin();
      expect(row.user.phoneNumber).toBe('+2348012345678');
      expect(row.user.phoneVerified).toBe(false);
    });
  });

  describe('isSubscribed -- the access gate', () => {
    it('counts only APPROVED rows', async () => {
      await service.isSubscribed(userId, 'whatsapp-validator');
      expect(prisma.integrationSubscription.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: 'APPROVED' }),
      });
    });
  });

  describe('listSubscriptionsForAdmin', () => {
    beforeEach(() => {
      prisma.integrationSubscription.findMany.mockResolvedValue([]);
    });

    it('scopes the queue to one integration when given a slug', async () => {
      await service.listSubscriptionsForAdmin(undefined, 'whatsapp-validator');
      expect(prisma.integrationSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { integration: { slug: 'whatsapp-validator' } },
        }),
      );
    });

    it('returns every integration when no slug is given', async () => {
      await service.listSubscriptionsForAdmin();
      expect(prisma.integrationSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('sorts pending ahead of decided rows', async () => {
      await service.listSubscriptionsForAdmin();
      expect(prisma.integrationSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ status: 'asc' }, { subscribedAt: 'desc' }],
        }),
      );
    });
  });

  describe('reviewSubscription', () => {
    it('approving is what grants access', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({ id: 'sub-1' });
      prisma.integrationSubscription.update.mockResolvedValue({
        id: 'sub-1',
        userId,
        status: 'APPROVED',
        subscribedAt: new Date(),
        reviewedAt: new Date(),
        reviewNote: null,
        integration: { id: integration.id, slug: 'whatsapp-validator', name: 'W' },
        user: adminUser,
      });
      const result = await service.reviewSubscription('admin-1', 'sub-1', 'approve');
      expect(result.status).toBe('APPROVED');
      expect(prisma.integrationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED', reviewedByAdminId: 'admin-1' }),
        }),
      );
    });

    it('rejecting keeps the row so the member can see why', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({ id: 'sub-1' });
      prisma.integrationSubscription.update.mockResolvedValue({
        id: 'sub-1',
        userId,
        status: 'REJECTED',
        subscribedAt: new Date(),
        reviewedAt: new Date(),
        reviewNote: 'Not enough completed trades',
        integration: { id: integration.id, slug: 'whatsapp-validator', name: 'W' },
        user: adminUser,
      });
      const result = await service.reviewSubscription(
        'admin-1',
        'sub-1',
        'reject',
        'Not enough completed trades',
      );
      expect(result.status).toBe('REJECTED');
      expect(result.reviewNote).toBe('Not enough completed trades');
      expect(prisma.integrationSubscription.deleteMany).not.toHaveBeenCalled();
    });

    it('throws for an unknown request', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue(null);
      await expect(
        service.reviewSubscription('admin-1', 'nope', 'approve'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requireEnabled', () => {
    it('throws when the integration is disabled', async () => {
      prisma.integration.findUnique.mockResolvedValue({ ...integration, enabled: false });
      await expect(service.requireEnabled('whatsapp-validator')).rejects.toThrow(NotFoundException);
    });

    it('returns the row when enabled', async () => {
      const result = await service.requireEnabled('whatsapp-validator');
      expect(result.feeTokenAmount.toString()).toBe('2');
    });
  });

  describe('syncRegistry', () => {
    it('upserts every registry entry by slug, never touching enabled/feeTokenAmount/sortOrder on update', async () => {
      await service.syncRegistry();
      expect(prisma.integration.upsert).toHaveBeenCalledTimes(INTEGRATION_REGISTRY.length);
      for (const definition of INTEGRATION_REGISTRY) {
        expect(prisma.integration.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { slug: definition.slug },
            create: expect.objectContaining({
              slug: definition.slug,
              name: definition.name,
              feeTokenAmount: definition.defaultFeeTokenAmount,
              sortOrder: definition.defaultSortOrder,
            }),
            update: {
              name: definition.name,
              description: definition.description,
              category: definition.category,
              iconKey: definition.iconKey,
            },
          }),
        );
      }
    });
  });

  describe('update (admin gate)', () => {
    it('only writes enabled/feeTokenAmount/sortOrder, never name/description/category/slug', async () => {
      await service.update(integration.id, { enabled: false, feeTokenAmount: 5, sortOrder: 2 });
      expect(prisma.integration.update).toHaveBeenCalledWith({
        where: { id: integration.id },
        data: { enabled: false, feeTokenAmount: 5, sortOrder: 2 },
      });
    });

    it('rejects updating a non-existent integration', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { enabled: true })).rejects.toThrow(NotFoundException);
    });
  });
});

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
    // The eligibility rule now lives on the row, admin-editable, rather
    // than in the code registry. This fixture carries WhatsApp
    // Validator's shipped rule: identity, no task bar.
    requirePhoneVerified: true,
    requireKycApproved: true,
    minCompletedTasks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * The eligibility facts loadEligibilityFacts reads. Defaults to a member
   * who clears every bar, so a test only states the fact it is about.
   */
  const eligibleUser = { phoneVerifiedAt: new Date(), kycStatus: 'APPROVED' };
  /** Settled tasks are three separate counts, summed. */
  const SETTLED_TASKS = 500;

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
      // Settled-task counts, summed by loadEligibilityFacts. Put on the
      // first so a test can set one number and mean "this many tasks".
      wordRecording: { count: jest.fn().mockResolvedValue(SETTLED_TASKS) },
      domainConversationRecording: { count: jest.fn().mockResolvedValue(0) },
      wordValidation: { count: jest.fn().mockResolvedValue(0) },
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
    // ID Review's shipped rule, as it sits on the row: identity plus 100
    // tasks. An admin can change any of it; these tests are about the
    // rule being applied, not about which values it happens to hold.
    const idReview = {
      ...integration,
      id: 'integration-2',
      slug: 'p2p-kyc-review',
      name: 'ID Review',
      minCompletedTasks: 100,
    };

    /** Sets the member's settled-task total across the three counts. */
    function setTasks(total: number) {
      prisma.wordRecording.count.mockResolvedValue(total);
    }

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
      ['an unverified phone', { phoneVerifiedAt: null }, 500],
      ['unapproved KYC', { kycStatus: 'IN_REVIEW' }, 500],
      ['too few tasks', {}, 99],
    ])(
      'refuses a member with %s, without reaching the admin queue',
      async (_label, override, tasks) => {
        prisma.user.findUnique.mockResolvedValue({ ...eligibleUser, ...override });
        setTasks(tasks);
        await expect(service.subscribe(userId, idReview.id)).rejects.toThrow(
          UnprocessableEntityException,
        );
        expect(prisma.integrationSubscription.create).not.toHaveBeenCalled();
      },
    );

    it('names every unmet requirement, so the member knows the whole bar', async () => {
      prisma.user.findUnique.mockResolvedValue({ phoneVerifiedAt: null, kycStatus: 'NOT_STARTED' });
      setTasks(3);
      await expect(service.subscribe(userId, idReview.id)).rejects.toThrow(
        /Verified phone number.*Approved KYC.*100 completed tasks/s,
      );
    });

    it('counts exactly the minimum as enough', async () => {
      setTasks(100);
      await expect(service.subscribe(userId, idReview.id)).resolves.toBeDefined();
    });

    it('sums the three task kinds rather than counting recordings alone', async () => {
      // 40 + 30 + 30 = exactly the 100 the rule asks for.
      setTasks(40);
      prisma.domainConversationRecording.count.mockResolvedValue(30);
      prisma.wordValidation.count.mockResolvedValue(30);
      await expect(service.subscribe(userId, idReview.id)).resolves.toBeDefined();
    });

    it('counts only SETTLED work, matching the withdrawal and P2P gates', async () => {
      await service.subscribe(userId, idReview.id).catch(() => undefined);
      for (const model of ['wordRecording', 'domainConversationRecording', 'wordValidation']) {
        expect(prisma[model].count).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ status: 'SETTLED' }) }),
        );
      }
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
      setTasks(40);
      const [result] = await service.list(userId, {});
      expect(result.eligible).toBe(false);
      expect(result.eligibilityRequirements).toEqual([
        { label: 'Verified phone number', met: true },
        { label: 'Approved KYC', met: true },
        { label: '100 completed tasks (you have 40)', met: false },
      ]);
    });

    it('leaves an integration whose rule an admin cleared open to everyone', async () => {
      prisma.integration.findMany.mockResolvedValue([
        {
          ...integration,
          requirePhoneVerified: false,
          requireKycApproved: false,
          minCompletedTasks: 0,
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({ phoneVerifiedAt: null, kycStatus: 'NOT_STARTED' });
      setTasks(0);
      const [result] = await service.list(userId, {});
      expect(result.eligible).toBe(true);
      expect(result.eligibilityRequirements).toEqual([]);
    });

    it('follows the admin-set rule on the row, not the code registry', async () => {
      // The registry only ever seeds a brand-new slug; once the row
      // exists, what the admin saved is what is enforced. Here ID Review
      // has been loosened to identity-only.
      prisma.integration.findUnique.mockResolvedValue({ ...idReview, minCompletedTasks: 0 });
      setTasks(0);
      await expect(service.subscribe(userId, idReview.id)).resolves.toBeDefined();
    });

    it('enforces a raised bar an admin has set beyond the registry default', async () => {
      prisma.integration.findUnique.mockResolvedValue({ ...idReview, minCompletedTasks: 750 });
      setTasks(500);
      await expect(service.subscribe(userId, idReview.id)).rejects.toThrow(
        '750 completed tasks (you have 500)',
      );
    });
  });

  /**
   * WhatsApp Validator confirms someone else's number, so a validator
   * must have proven their own and be identified -- but no task bar:
   * relaying a code is not how value leaves the platform.
   */
  describe('eligibility -- WhatsApp Validator', () => {
    it('requires a verified mobile and approved KYC', async () => {
      prisma.user.findUnique.mockResolvedValue({ phoneVerifiedAt: null, kycStatus: 'NOT_STARTED' });
      await expect(service.subscribe(userId, integration.id)).rejects.toThrow(
        /Verified phone number.*Approved KYC/s,
      );
    });

    it('does NOT require a task history', async () => {
      prisma.wordRecording.count.mockResolvedValue(0);
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

    it('seeds the eligibility rule on create but never overwrites it on update', async () => {
      await service.syncRegistry();
      for (const definition of INTEGRATION_REGISTRY) {
        const call = prisma.integration.upsert.mock.calls.find(
          ([arg]: [any]) => arg.where.slug === definition.slug,
        );
        expect(call[0].create).toMatchObject({
          requirePhoneVerified: definition.defaultEligibility.requirePhoneVerified ?? false,
          requireKycApproved: definition.defaultEligibility.requireKycApproved ?? false,
          minCompletedTasks: definition.defaultEligibility.minTasks ?? 0,
        });
        // The admin owns these once the row exists -- a deploy must not
        // reset a rule they deliberately changed.
        for (const field of [
          'requirePhoneVerified',
          'requireKycApproved',
          'minCompletedTasks',
        ]) {
          expect(call[0].update).not.toHaveProperty(field);
        }
      }
    });
  });

  describe('update (admin gate)', () => {
    it('only writes the gate fields, never name/description/category/slug', async () => {
      await service.update(integration.id, { enabled: false, feeTokenAmount: 5, sortOrder: 2 });
      const { data } = prisma.integration.update.mock.calls[0][0];
      expect(data).toMatchObject({ enabled: false, feeTokenAmount: 5, sortOrder: 2 });
      // Registry-owned metadata must never be writable from this path.
      for (const field of ['name', 'description', 'category', 'iconKey', 'slug']) {
        expect(data).not.toHaveProperty(field);
      }
    });

    it('writes the three eligibility fields an admin sets', async () => {
      await service.update(integration.id, {
        requirePhoneVerified: true,
        requireKycApproved: false,
        minCompletedTasks: 250,
      });
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requirePhoneVerified: true,
            requireKycApproved: false,
            minCompletedTasks: 250,
          }),
        }),
      );
    });

    it('accepts 0 tasks as "no task bar" rather than treating it as unset', async () => {
      await service.update(integration.id, { minCompletedTasks: 0 });
      expect(prisma.integration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ minCompletedTasks: 0 }) }),
      );
    });

    it('rejects updating a non-existent integration', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { enabled: true })).rejects.toThrow(NotFoundException);
    });
  });
});

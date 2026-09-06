import { CommunityProfilesService, deriveBadge, toAuthorSummary } from './community-profiles.service';

describe('deriveBadge', () => {
  it('returns VERIFIED_TRAINER for a KYC-approved trainer', () => {
    expect(deriveBadge({ role: 'TRAINER' as any, kycStatus: 'APPROVED' as any })).toBe(
      'VERIFIED_TRAINER',
    );
  });

  it('does not badge a trainer whose KYC is not approved', () => {
    expect(deriveBadge({ role: 'TRAINER' as any, kycStatus: 'IN_REVIEW' as any })).toBeNull();
  });

  it('returns DISTRIBUTOR regardless of KYC status', () => {
    expect(deriveBadge({ role: 'DISTRIBUTOR' as any, kycStatus: 'PENDING' as any })).toBe(
      'DISTRIBUTOR',
    );
  });

  it('returns null for an admin or unverified trainer', () => {
    expect(deriveBadge({ role: 'ADMIN' as any, kycStatus: 'APPROVED' as any })).toBeNull();
  });
});

describe('toAuthorSummary', () => {
  it('prefers the CommunityProfile displayName when present', () => {
    const summary = toAuthorSummary({
      id: 'user-1',
      firstName: 'Ada',
      lastName: 'Obi',
      role: 'TRAINER' as any,
      kycStatus: 'APPROVED' as any,
      communityProfile: { displayName: 'Ada O.' },
    });
    expect(summary).toEqual({ id: 'user-1', displayName: 'Ada O.', badge: 'VERIFIED_TRAINER' });
  });

  it('falls back to firstName/lastName when no CommunityProfile exists yet', () => {
    const summary = toAuthorSummary({
      id: 'user-2',
      firstName: 'Chidi',
      lastName: 'Eze',
      role: 'TRAINER' as any,
      kycStatus: 'PENDING' as any,
      communityProfile: null,
    });
    expect(summary).toEqual({ id: 'user-2', displayName: 'Chidi Eze', badge: null });
  });

  it('falls back to "Member" when both name fields are blank', () => {
    const summary = toAuthorSummary({
      id: 'user-3',
      firstName: null,
      lastName: null,
      role: 'ADMIN' as any,
      kycStatus: 'PENDING' as any,
      communityProfile: null,
    });
    expect(summary.displayName).toBe('Member');
  });
});

describe('CommunityProfilesService admin', () => {
  function setup() {
    const prisma = {
      communityProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      communityModeratorAction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CommunityProfilesService(prisma as never);
    return { service, prisma };
  }

  describe('listForAdmin', () => {
    it('filters by status and role when provided', async () => {
      const { service, prisma } = setup();

      await service.listForAdmin({ page: 1, pageSize: 20, status: 'SUSPENDED' as any, role: 'MODERATOR' as any });

      expect(prisma.communityProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'SUSPENDED', role: 'MODERATOR' } }),
      );
    });

    it('searches displayName and the joined user email/name', async () => {
      const { service, prisma } = setup();

      await service.listForAdmin({ page: 1, pageSize: 20, search: 'ada' });

      expect(prisma.communityProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { displayName: { contains: 'ada', mode: 'insensitive' } },
              { user: { email: { contains: 'ada', mode: 'insensitive' } } },
              { user: { firstName: { contains: 'ada', mode: 'insensitive' } } },
              { user: { lastName: { contains: 'ada', mode: 'insensitive' } } },
            ],
          },
        }),
      );
    });

    it('maps each row to include email and a derived badge', async () => {
      const { service, prisma } = setup();
      prisma.communityProfile.findMany.mockResolvedValue([
        {
          id: 'profile-1',
          displayName: 'Ada O.',
          user: { email: 'ada@example.com', role: 'TRAINER', kycStatus: 'APPROVED' },
        },
      ]);
      prisma.communityProfile.count.mockResolvedValue(1);

      const result = await service.listForAdmin({ page: 1, pageSize: 20 });

      expect(result.items[0]).toEqual({
        id: 'profile-1',
        displayName: 'Ada O.',
        email: 'ada@example.com',
        badge: 'VERIFIED_TRAINER',
      });
      expect(result.total).toBe(1);
    });
  });

  describe('getDetailForAdmin', () => {
    it('404s when the profile does not exist', async () => {
      const { service, prisma } = setup();
      prisma.communityProfile.findUnique.mockResolvedValue(null);

      await expect(service.getDetailForAdmin('profile-1')).rejects.toThrow(
        'Community profile not found',
      );
    });

    it('includes joined space memberships and moderation history scoped to this profile', async () => {
      const { service, prisma } = setup();
      prisma.communityProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        displayName: 'Ada O.',
        user: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Obi', role: 'TRAINER', kycStatus: 'APPROVED' },
        country: { name: 'Nigeria', code: 'NG' },
        spaceMemberships: [{ space: { id: 'space-1', name: 'General', slug: 'general' } }],
      });
      prisma.communityModeratorAction.findMany.mockResolvedValue([{ id: 'action-1' }]);

      const result = await service.getDetailForAdmin('profile-1');

      expect(prisma.communityModeratorAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { targetType: 'PROFILE', targetId: 'profile-1' } }),
      );
      expect(result.spaces).toEqual([{ id: 'space-1', name: 'General', slug: 'general' }]);
      expect(result.moderationHistory).toEqual([{ id: 'action-1' }]);
      expect(result.accountName).toBe('Ada Obi');
      expect(result.email).toBe('ada@example.com');
    });
  });
});

import { deriveBadge, toAuthorSummary } from './community-profiles.service';

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

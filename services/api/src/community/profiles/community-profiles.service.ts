import { Injectable, NotFoundException } from '@nestjs/common';
import { KycStatus, Prisma, Role } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCommunityProfileDto } from '../dto/update-community-profile.dto';
import { ListCommunityMembersAdminDto } from '../dto/list-community-members-admin.dto';

/**
 * A trainer's community "badge" is derived at read time from their linked
 * User record (kycStatus for Verified Trainer, role for Distributor), not
 * stored redundantly on CommunityProfile -- avoids the badge going stale if
 * the underlying account status changes after profile creation.
 */
export type CommunityBadge = 'VERIFIED_TRAINER' | 'DISTRIBUTOR' | null;

/**
 * Exported so posts/replies/notifications services can derive the same
 * badge for an `author`/`actor` summary without duplicating this logic --
 * see AUTHOR_SUMMARY_SELECT-shaped selects in those services.
 */
export function deriveBadge(user: { role: Role; kycStatus: KycStatus }): CommunityBadge {
  if (user.role === Role.TRAINER && user.kycStatus === KycStatus.APPROVED)
    return 'VERIFIED_TRAINER';
  if (user.role === Role.DISTRIBUTOR) return 'DISTRIBUTOR';
  return null;
}

/**
 * Shared Prisma `select` shape for resolving a user relation (author/actor)
 * into a {id, displayName, badge} summary -- reused by posts, replies, and
 * notifications so the join/derivation logic lives in exactly one place.
 * Falls back to firstName/lastName ("Member" if both are blank) when the
 * user has no CommunityProfile yet (shouldn't normally happen once
 * ensureProfile has run, but a defensive fallback costs nothing here).
 */
export const AUTHOR_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  kycStatus: true,
  communityProfile: { select: { displayName: true } },
} as const;

export interface AuthorSummarySource {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  kycStatus: KycStatus;
  communityProfile: { displayName: string } | null;
}

export function toAuthorSummary(user: AuthorSummarySource) {
  return {
    id: user.id,
    displayName:
      user.communityProfile?.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      'Member',
    badge: deriveBadge(user),
  };
}

@Injectable()
export class CommunityProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every authenticated Community route calls this first (see
   * CommunityAuthGuard/controllers) -- creates the profile on a user's
   * literal first visit, pre-filled from their main account, per
   * COMMUNITY-PLAN.md §4.3's "CommunityProfile is created/synced on first
   * visit" flow. Idempotent: a second call for an existing profile is a
   * plain read.
   */
  async ensureProfile(userId: string) {
    const existing = await this.prisma.communityProfile.findUnique({ where: { userId } });
    if (existing) return existing;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, originCountryId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
    return this.prisma.communityProfile.create({
      data: {
        userId,
        displayName,
        countryId: user.originCountryId,
      },
    });
  }

  async getMine(userId: string) {
    const profile = await this.ensureProfile(userId);
    return this.toDetail(profile.id);
  }

  async getByUserId(userId: string) {
    const profile = await this.prisma.communityProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Community profile not found');
    return this.toDetail(profile.id);
  }

  async updateMine(userId: string, dto: UpdateCommunityProfileDto) {
    await this.ensureProfile(userId);
    await this.prisma.communityProfile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio.trim() || null } : {}),
        ...(dto.countryId !== undefined ? { countryId: dto.countryId || null } : {}),
        ...(dto.languages !== undefined ? { languages: dto.languages } : {}),
        ...(dto.dialects !== undefined ? { dialects: dto.dialects } : {}),
      },
    });
    return this.getMine(userId);
  }

  private async toDetail(profileId: string) {
    const profile = await this.prisma.communityProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: {
        user: { select: { role: true, kycStatus: true } },
        country: { select: { name: true, code: true } },
      },
    });
    const { user, country, ...rest } = profile;
    return { ...rest, country, badge: deriveBadge(user) };
  }

  // --- admin: member tracking/management ---

  async listForAdmin(query: ListCommunityMembersAdminDto) {
    const { page, pageSize, search, status, role } = query;
    const where: Prisma.CommunityProfileWhereInput = {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' as const } },
              { user: { email: { contains: search, mode: 'insensitive' as const } } },
              { user: { firstName: { contains: search, mode: 'insensitive' as const } } },
              { user: { lastName: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.communityProfile.findMany({
        where,
        include: { user: { select: { email: true, role: true, kycStatus: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.communityProfile.count({ where }),
    ]);
    return {
      items: items.map(({ user, ...profile }) => ({
        ...profile,
        email: user.email,
        badge: deriveBadge(user),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getDetailForAdmin(id: string) {
    const profile = await this.prisma.communityProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true, role: true, kycStatus: true },
        },
        country: { select: { name: true, code: true } },
        spaceMemberships: { include: { space: { select: { id: true, name: true, slug: true } } } },
      },
    });
    if (!profile) throw new NotFoundException('Community profile not found');
    const { user, spaceMemberships, ...rest } = profile;
    const moderationHistory = await this.prisma.communityModeratorAction.findMany({
      where: { targetType: 'PROFILE', targetId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { moderator: { select: { firstName: true, lastName: true, email: true } } },
    });
    return {
      ...rest,
      email: user.email,
      accountName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      badge: deriveBadge(user),
      spaces: spaceMemberships.map((membership) => membership.space),
      moderationHistory,
    };
  }
}

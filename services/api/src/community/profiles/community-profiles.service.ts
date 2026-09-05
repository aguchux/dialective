import { Injectable, NotFoundException } from '@nestjs/common';
import { KycStatus, Role } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCommunityProfileDto } from '../dto/update-community-profile.dto';

/**
 * A trainer's community "badge" is derived at read time from their linked
 * User record (kycStatus for Verified Trainer, role for Distributor), not
 * stored redundantly on CommunityProfile -- avoids the badge going stale if
 * the underlying account status changes after profile creation.
 */
export type CommunityBadge = 'VERIFIED_TRAINER' | 'DISTRIBUTOR' | null;

function deriveBadge(user: { role: Role; kycStatus: KycStatus }): CommunityBadge {
  if (user.role === Role.TRAINER && user.kycStatus === KycStatus.APPROVED) return 'VERIFIED_TRAINER';
  if (user.role === Role.DISTRIBUTOR) return 'DISTRIBUTOR';
  return null;
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
}

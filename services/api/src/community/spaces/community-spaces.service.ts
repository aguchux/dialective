import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertCommunitySpaceDto } from '../dto/upsert-community-space.dto';

@Injectable()
export class CommunitySpacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId?: string) {
    const spaces = await this.prisma.communitySpace.findMany({
      where: { isArchived: false },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { posts: true } },
        ...(userId
          ? { memberships: { where: { profile: { userId } }, select: { id: true } } }
          : {}),
      },
    });
    return spaces.map((space) => {
      const { _count, memberships, ...rest } = space as typeof space & {
        memberships?: unknown[];
      };
      return { ...rest, postCount: _count.posts, joined: userId ? (memberships?.length ?? 0) > 0 : false };
    });
  }

  async getBySlug(slug: string) {
    const space = await this.prisma.communitySpace.findUnique({
      where: { slug },
      include: { _count: { select: { posts: true } } },
    });
    if (!space || space.isArchived) throw new NotFoundException('Space not found');
    const { _count, ...rest } = space;
    return { ...rest, postCount: _count.posts };
  }

  async join(profileId: string, spaceId: string) {
    const space = await this.prisma.communitySpace.findUnique({ where: { id: spaceId } });
    if (!space || space.isArchived) throw new NotFoundException('Space not found');
    await this.prisma.communitySpaceMembership.upsert({
      where: { spaceId_profileId: { spaceId, profileId } },
      create: { spaceId, profileId },
      update: {},
    });
  }

  async leave(profileId: string, spaceId: string) {
    await this.prisma.communitySpaceMembership.deleteMany({ where: { spaceId, profileId } });
  }

  // --- admin ---

  async createForAdmin(dto: UpsertCommunitySpaceDto) {
    const existing = await this.prisma.communitySpace.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('A space with this slug already exists');
    return this.prisma.communitySpace.create({ data: dto });
  }

  async updateForAdmin(id: string, dto: Partial<UpsertCommunitySpaceDto>) {
    const space = await this.prisma.communitySpace.findUnique({ where: { id } });
    if (!space) throw new NotFoundException('Space not found');
    if (dto.slug && dto.slug !== space.slug) {
      const clash = await this.prisma.communitySpace.findUnique({ where: { slug: dto.slug } });
      if (clash) throw new ConflictException('A space with this slug already exists');
    }
    return this.prisma.communitySpace.update({ where: { id }, data: dto });
  }

  async listForAdmin() {
    return this.prisma.communitySpace.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { posts: true, memberships: true } } },
    });
  }
}

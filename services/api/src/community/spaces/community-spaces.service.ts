import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
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

  /**
   * Persists a full drag-drop reorder in one round trip: orderedIds is the
   * complete new top-to-bottom order (index becomes sortOrder), not a patch
   * against a subset -- the admin UI always sends every space it has
   * loaded. A transaction keeps the list internally consistent even if one
   * update fails partway through, rather than leaving sortOrder values
   * interleaved between old and new positions.
   */
  async reorderForAdmin(orderedIds: string[]) {
    const existingIds = new Set(
      (await this.prisma.communitySpace.findMany({ select: { id: true } })).map((s) => s.id),
    );
    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      throw new UnprocessableEntityException('orderedIds must include every existing space exactly once');
    }
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.communitySpace.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.listForAdmin();
  }

  /**
   * CommunityPost.space is onDelete: Restrict -- a space with any posts
   * (including deleted/hidden ones, which are soft-deleted via status, not
   * removed) always fails at the DB level rather than silently cascading.
   * Archive (isArchived: true via updateForAdmin) is the intended way to
   * retire a space that still has content; delete is only for spaces that
   * never had any.
   */
  async deleteForAdmin(id: string) {
    try {
      await this.prisma.communitySpace.delete({ where: { id } });
      return { id, deleted: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundException('Space not found');
        if (err.code === 'P2003') {
          throw new UnprocessableEntityException(
            'This space still has posts -- archive it instead of deleting it',
          );
        }
      }
      throw err;
    }
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugifyBase } from '../community-slug.util';
import { CreateCommunityTagDto } from '../dto/create-community-tag.dto';

const MAX_TAGS_PER_POST = 5;

@Injectable()
export class CommunityTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.communityTag.findMany({
      where: { isHidden: false },
      orderBy: { name: 'asc' },
    });
  }

  async autocomplete(query: string) {
    return this.prisma.communityTag.findMany({
      where: { isHidden: false, name: { contains: query, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  /**
   * Finds-or-creates by exact (case-insensitive) name for each requested
   * tag, called from CommunityPostsService when a post is created/updated
   * -- a member typing a new tag name silently creates it (COMMUNITY-PLAN.md
   * §9: "user types tag name; existing tags autocomplete"), capped at
   * MAX_TAGS_PER_POST per post.
   */
  async resolveOrCreateMany(names: string[]): Promise<string[]> {
    const trimmed = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(
      0,
      MAX_TAGS_PER_POST,
    );
    const ids: string[] = [];
    for (const name of trimmed) {
      const existing = await this.prisma.communityTag.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const created = await this.prisma.communityTag.create({
        data: { name, slug: slugifyBase(name, 40) },
      });
      ids.push(created.id);
    }
    return ids;
  }

  // --- admin ---

  /**
   * Unlike list() (member-facing, hides isHidden tags on purpose), admin
   * management needs to see every tag including hidden ones -- otherwise an
   * admin who hides a tag has no way to find and unhide it again, since it
   * would disappear from this exact screen.
   */
  async listForAdmin() {
    return this.prisma.communityTag.findMany({ orderBy: { name: 'asc' } });
  }

  async createForAdmin(dto: CreateCommunityTagDto) {
    const existing = await this.prisma.communityTag.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('A tag with this name already exists');
    return this.prisma.communityTag.create({ data: { name: dto.name, slug: slugifyBase(dto.name, 40) } });
  }

  async renameForAdmin(id: string, name: string) {
    const tag = await this.prisma.communityTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return this.prisma.communityTag.update({
      where: { id },
      data: { name, slug: slugifyBase(name, 40) },
    });
  }

  /** Reassigns every post using `fromId` to `toId`, then deletes `fromId`. */
  async mergeForAdmin(fromId: string, toId: string) {
    if (fromId === toId) throw new ConflictException('Cannot merge a tag into itself');
    const [from, to] = await Promise.all([
      this.prisma.communityTag.findUnique({ where: { id: fromId } }),
      this.prisma.communityTag.findUnique({ where: { id: toId } }),
    ]);
    if (!from || !to) throw new NotFoundException('Tag not found');

    await this.prisma.$transaction(async (tx) => {
      const postLinks = await tx.communityPostTag.findMany({ where: { tagId: fromId } });
      for (const link of postLinks) {
        await tx.communityPostTag.upsert({
          where: { postId_tagId: { postId: link.postId, tagId: toId } },
          create: { postId: link.postId, tagId: toId },
          update: {},
        });
      }
      await tx.communityPostTag.deleteMany({ where: { tagId: fromId } });
      await tx.communityTag.delete({ where: { id: fromId } });
    });
  }

  async setHiddenForAdmin(id: string, isHidden: boolean) {
    const tag = await this.prisma.communityTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return this.prisma.communityTag.update({ where: { id }, data: { isHidden } });
  }

  async deleteUnusedForAdmin(id: string) {
    const usage = await this.prisma.communityPostTag.count({ where: { tagId: id } });
    if (usage > 0) throw new ConflictException('Cannot delete a tag that is still in use');
    await this.prisma.communityTag.delete({ where: { id } });
  }
}

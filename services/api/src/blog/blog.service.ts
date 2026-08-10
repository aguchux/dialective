import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BlogPostStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { ReorderBlogPostsDto } from './dto/reorder-blog-posts.dto';
import { calculateReadMinutes, deriveExcerpt, EditorDocument, validateEditorDocument } from './blog-content.util';

const authorSelect = { email: true } as const;

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished() {
    const posts = await this.prisma.blogPost.findMany({
      where: { status: BlogPostStatus.PUBLISHED },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
      select: {
        id: true, slug: true, title: true, tag: true, excerpt: true, content: true,
        coverImageUrl: true, coverImageAlt: true, publishedAt: true,
        createdAt: true, updatedAt: true,
      },
    });
    return posts.map(({ content, ...post }) => ({
      ...post,
      readMinutes: calculateReadMinutes(content as unknown as EditorDocument),
    }));
  }

  async getPublished(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: BlogPostStatus.PUBLISHED },
      select: {
        id: true, slug: true, title: true, tag: true, content: true, excerpt: true,
        coverImageUrl: true, coverImageAlt: true, publishedAt: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return { ...post, readMinutes: calculateReadMinutes(post.content as unknown as EditorDocument) };
  }

  listAdmin() {
    return this.prisma.blogPost.findMany({
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      include: { author: { select: authorSelect } },
    });
  }

  async getAdmin(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { author: { select: authorSelect } },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  async create(authorId: string, dto: CreateBlogPostDto) {
    const document = validateEditorDocument(dto.content);
    const slug = dto.slug ?? slugify(dto.title);
    await this.assertSlugAvailable(slug);
    const lastPost = await this.prisma.blogPost.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const status = dto.status ?? BlogPostStatus.DRAFT;
    const excerpt = deriveExcerpt(document);
    if (status === BlogPostStatus.PUBLISHED && !excerpt) {
      throw new BadRequestException('Published posts require a non-empty first paragraph');
    }

    return this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug,
        tag: cleanOptional(dto.tag),
        content: document as unknown as Prisma.InputJsonValue,
        excerpt,
        coverImageUrl: cleanOptional(dto.coverImageUrl),
        coverImageKey: cleanOptional(dto.coverImageKey),
        coverImageAlt: cleanOptional(dto.coverImageAlt),
        status,
        sortOrder: (lastPost?.sortOrder ?? -1) + 1,
        authorId,
        publishedAt: status === BlogPostStatus.PUBLISHED ? new Date() : null,
      },
      include: { author: { select: authorSelect } },
    });
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const current = await this.getAdmin(id);
    if (dto.slug && dto.slug !== current.slug) await this.assertSlugAvailable(dto.slug, id);
    const document = dto.content ? validateEditorDocument(dto.content) : undefined;
    const nextStatus = dto.status ?? current.status;
    const excerpt = document ? deriveExcerpt(document) : current.excerpt;
    if (nextStatus === BlogPostStatus.PUBLISHED && !excerpt) {
      throw new BadRequestException('Published posts require a non-empty first paragraph');
    }

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.tag !== undefined && { tag: cleanOptional(dto.tag) }),
        ...(document && {
          content: document as unknown as Prisma.InputJsonValue,
          excerpt,
        }),
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: cleanOptional(dto.coverImageUrl) }),
        ...(dto.coverImageKey !== undefined && { coverImageKey: cleanOptional(dto.coverImageKey) }),
        ...(dto.coverImageAlt !== undefined && { coverImageAlt: cleanOptional(dto.coverImageAlt) }),
        ...(dto.status !== undefined && {
          status: dto.status,
          publishedAt: nextStatus === BlogPostStatus.PUBLISHED ? current.publishedAt ?? new Date() : null,
        }),
      },
      include: { author: { select: authorSelect } },
    });
  }

  async reorder(dto: ReorderBlogPostsDto) {
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate blog post ids are not allowed');
    const count = await this.prisma.blogPost.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('One or more blog posts do not exist');
    await this.prisma.$transaction(dto.items.map((item) => this.prisma.blogPost.update({
      where: { id: item.id },
      data: { sortOrder: item.sortOrder },
    })));
    return { reordered: ids.length };
  }

  async remove(id: string) {
    await this.getAdmin(id);
    await this.prisma.blogPost.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertSlugAvailable(slug: string, excludingId?: string) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { slug, ...(excludingId && { id: { not: excludingId } }) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A blog post already uses this slug');
  }
}

function slugify(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 190);
  return slug || `post-${Date.now()}`;
}

function cleanOptional(value?: string): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

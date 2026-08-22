import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessTokenClaims } from '../auth/jwt.util';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { Role } from '@dialectiva/db';
import { StorageService } from '../storage/storage.service';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { BlogMediaKind, CreateBlogUploadDto } from './dto/create-blog-upload.dto';
import { ReorderBlogPostsDto } from './dto/reorder-blog-posts.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Controller('blog/posts')
export class BlogPublicController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list() {
    return this.blog.listPublished();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.blog.getPublished(slug);
  }
}

@Controller('blog/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BlogAdminController {
  constructor(
    private readonly blog: BlogService,
    private readonly storage: StorageService,
  ) {}

  @Get('posts')
  list() {
    return this.blog.listAdmin();
  }

  @Get('posts/:id')
  get(@Param('id') id: string) {
    return this.blog.getAdmin(id);
  }

  @Post('posts')
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: CreateBlogPostDto) {
    return this.blog.create(user.sub, dto);
  }

  @Patch('posts/reorder')
  reorder(@Body() dto: ReorderBlogPostsDto) {
    return this.blog.reorder(dto);
  }

  @Patch('posts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blog.update(id, dto);
  }

  @Delete('posts/:id')
  remove(@Param('id') id: string) {
    return this.blog.remove(id);
  }

  @Post('media/upload-url')
  async createMediaUpload(@Body() dto: CreateBlogUploadDto) {
    const bucket = process.env.SPACES_BLOG_MEDIA_BUCKET ?? 'dialectiva-blog-media';
    const extension = safeExtension(dto.fileName, dto.contentType);
    const folder = dto.kind === BlogMediaKind.VIDEO ? 'videos' : 'images';
    const key = `blog/${folder}/${randomUUID()}.${extension}`;
    const signed = await this.storage.createPresignedUploadUrl(bucket, key, dto.contentType, true);
    return { ...signed, bucket, publicUrl: this.storage.getPublicObjectUrl(bucket, key) };
  }
}

function safeExtension(fileName: string, contentType: string): string {
  const fallbacks: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
  };
  return fallbacks[contentType] ?? 'bin';
}

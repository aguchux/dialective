import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessTokenClaims } from '../auth/jwt.util';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { Role } from '@dialectiva/db';
import { StorageService } from '../storage/storage.service';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CourseMediaKind, CreateCourseUploadDto } from './dto/create-course-upload.dto';
import { ReorderCoursesDto } from './dto/reorder-courses.dto';
import { SaveCourseProgressDto } from './dto/save-course-progress.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Controller('courses')
export class CoursesPublicController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list() {
    return this.courses.listPublished();
  }

  @Get(':slug')
  getPreview(@Param('slug') slug: string) {
    return this.courses.getPublishedPreview(slug);
  }
}

// Any authenticated user (any role) -- no @Roles/@UseGuards(RolesGuard),
// same pattern as WalletController's trainer-facing endpoints.
@Controller('courses/study')
@UseGuards(JwtAuthGuard)
export class CoursesProtectedController {
  constructor(private readonly courses: CoursesService) {}

  @Get(':slug')
  get(@CurrentUser() user: AccessTokenClaims, @Param('slug') slug: string) {
    return this.courses.getForStudy(user.sub, slug);
  }

  @Put(':slug/progress')
  saveProgress(@CurrentUser() user: AccessTokenClaims, @Param('slug') slug: string, @Body() dto: SaveCourseProgressDto) {
    return this.courses.saveProgress(user.sub, slug, dto.lastSlideIndex, dto.totalSlides);
  }
}

@Controller('courses/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CoursesAdminController {
  constructor(private readonly courses: CoursesService, private readonly storage: StorageService) {}

  @Get('courses')
  list() {
    return this.courses.listAdmin();
  }

  @Get('courses/:id')
  get(@Param('id') id: string) {
    return this.courses.getAdmin(id);
  }

  @Post('courses')
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: CreateCourseDto) {
    return this.courses.create(user.sub, dto);
  }

  @Patch('courses/reorder')
  reorder(@Body() dto: ReorderCoursesDto) {
    return this.courses.reorder(dto);
  }

  @Patch('courses/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(id, dto);
  }

  @Delete('courses/:id')
  remove(@Param('id') id: string) {
    return this.courses.remove(id);
  }

  @Post('media/upload-url')
  async createMediaUpload(@Body() dto: CreateCourseUploadDto) {
    const bucket = process.env.SPACES_COURSE_MEDIA_BUCKET ?? 'dialectiva-course-media';
    const extension = safeExtension(dto.contentType);
    const folder = dto.kind === CourseMediaKind.AUDIO ? 'audio' : 'images';
    const key = `courses/${folder}/${randomUUID()}.${extension}`;
    const signed = await this.storage.createPresignedUploadUrl(bucket, key, dto.contentType, true);
    return { ...signed, bucket, publicUrl: this.storage.getPublicObjectUrl(bucket, key) };
  }
}

function safeExtension(contentType: string): string {
  const fallbacks: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'weba',
  };
  return fallbacks[contentType] ?? 'bin';
}

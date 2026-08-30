import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { creditTestimonyReward } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { CreateTestimonyUploadUrlDto } from './dto/create-testimony-upload-url.dto';
import { ListTestimoniesAdminDto } from './dto/list-testimonies-admin.dto';
import { ReviewTestimonyDto } from './dto/review-testimony.dto';

const TESTIMONY_BUCKET = process.env.SPACES_TESTIMONY_BUCKET ?? 'dialectiva-testimonials';
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

@Injectable()
export class TestimonialsService {
  private readonly logger = new Logger(TestimonialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly storage: StorageService,
  ) {}

  async getMine(userId: string) {
    return this.prisma.testimony.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUploadUrl(userId: string, dto: CreateTestimonyUploadUrlDto) {
    if (!(await this.settings.isTestimonyEnabled())) {
      throw new ForbiddenException('Testimonials are not currently open');
    }
    const extension = EXTENSION_BY_CONTENT_TYPE[dto.contentType];
    const key = `${userId}/${randomUUID()}.${extension}`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      TESTIMONY_BUCKET,
      key,
      dto.contentType,
      true, // publicRead -- an approved testimony's video is embedded directly on the public homepage carousel (see TestimonialsController.getPublic), no presigned-URL expiry is acceptable there
    );
    return { uploadUrl: url, key, bucket: TESTIMONY_BUCKET, expiresInSeconds };
  }

  /**
   * One active submission at a time: a trainer with a PENDING or APPROVED
   * testimony can't submit another (APPROVED already got them their
   * one-time reward and public slot; PENDING is still awaiting review). A
   * REJECTED testimony can be resubmitted -- see the query below, which
   * only blocks on PENDING/APPROVED.
   */
  async submit(userId: string, dto: CreateTestimonyDto) {
    if (!(await this.settings.isTestimonyEnabled())) {
      throw new ForbiddenException('Testimonials are not currently open');
    }

    const existing = await this.prisma.testimony.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existing) {
      throw new ConflictException(
        existing.status === 'APPROVED'
          ? 'You have already submitted a testimony'
          : 'Your previous testimony is still awaiting review',
      );
    }

    if (dto.kind === 'TEXT') {
      const maxLength = await this.settings.getTestimonyMaxTextLength();
      const text = dto.text?.trim();
      if (!text) throw new BadRequestException('Enter your testimony text');
      if (text.length > maxLength) {
        throw new BadRequestException(`Testimony text must be ${maxLength} characters or fewer`);
      }
      return this.prisma.testimony.create({
        data: { userId, kind: 'TEXT', text },
      });
    }

    if (!dto.bucket || !dto.videoKey || !dto.durationMs) {
      throw new BadRequestException('A recorded video is required');
    }
    const maxDurationMs = (await this.settings.getTestimonyMaxVideoSeconds()) * 1000;
    if (dto.durationMs > maxDurationMs) {
      throw new BadRequestException(
        `Video testimony must be ${maxDurationMs / 1000} seconds or shorter`,
      );
    }
    return this.prisma.testimony.create({
      data: {
        userId,
        kind: 'VIDEO',
        videoBucket: dto.bucket,
        videoKey: dto.videoKey,
        durationMs: dto.durationMs,
      },
    });
  }

  async listForAdmin(query: ListTestimoniesAdminDto) {
    const where = query.status ? { status: query.status } : {};
    const [total, items] = await Promise.all([
      this.prisma.testimony.count({ where }),
      this.prisma.testimony.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        videoUrl:
          item.videoBucket && item.videoKey
            ? this.storage.getPublicObjectUrl(item.videoBucket, item.videoKey)
            : null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async review(adminId: string, testimonyId: string, dto: ReviewTestimonyDto) {
    const testimony = await this.prisma.testimony.findUnique({ where: { id: testimonyId } });
    if (!testimony) throw new NotFoundException('Testimony not found');
    if (testimony.status !== 'PENDING') {
      throw new ConflictException('This testimony has already been reviewed');
    }

    const updated = await this.prisma.testimony.update({
      where: { id: testimonyId },
      data: {
        status: dto.status,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        rejectionReason: dto.status === 'REJECTED' ? dto.rejectionReason : null,
      },
    });

    if (dto.status === 'APPROVED') {
      // Best-effort: a reward-credit failure must never make the review
      // action itself fail -- the approval (and the testimony's new public
      // eligibility) is already recorded regardless. Same shape as
      // CoursesService.creditCompletionAndNotify.
      try {
        const rewardTokens = await this.settings.getTestimonyRewardTokens();
        const credited = await creditTestimonyReward(
          this.prisma,
          testimony.userId,
          testimony.id,
          rewardTokens,
        );
        if (credited) {
          await this.prisma.testimony.update({
            where: { id: testimonyId },
            data: { rewardCredited: true },
          });
        }
      } catch (err) {
        this.logger.error(
          `Failed to credit testimony reward for testimony=${testimonyId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return updated;
  }

  async getPublic() {
    const items = await this.prisma.testimony.findMany({
      where: { status: 'APPROVED' },
      orderBy: { reviewedAt: 'desc' },
      include: {
        user: {
          select: { firstName: true, dialect: { select: { name: true } } },
        },
      },
    });
    return items.map((item) => ({
      id: item.id,
      kind: item.kind,
      text: item.text,
      videoUrl:
        item.videoBucket && item.videoKey
          ? this.storage.getPublicObjectUrl(item.videoBucket, item.videoKey)
          : null,
      trainerFirstName: item.user.firstName,
      dialectName: item.user.dialect?.name ?? null,
    }));
  }
}

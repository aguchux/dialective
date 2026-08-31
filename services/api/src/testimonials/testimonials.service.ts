import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { creditTestimonyReward, KycStatus, Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { CreateTestimonyUploadUrlDto } from './dto/create-testimony-upload-url.dto';
import { ListTestimoniesAdminDto } from './dto/list-testimonies-admin.dto';
import { ListPublicTestimoniesDto } from './dto/list-public-testimonies.dto';
import { ReviewTestimonyDto } from './dto/review-testimony.dto';
import { UpdateTestimonyVisibilityDto } from './dto/update-testimony-visibility.dto';

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

  async listMine(userId: string) {
    return this.prisma.testimony.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUploadUrl(userId: string, dto: CreateTestimonyUploadUrlDto) {
    if (!(await this.settings.isTestimonyEnabled())) {
      throw new ForbiddenException('Testimonials are not currently open');
    }
    await this.requireDiditVerification(userId);
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
   * Trainers may submit testimonials at will -- no cap on how many they
   * have PENDING or APPROVED at once. Each submission is reviewed and
   * rewarded independently (creditTestimonyReward is keyed by the
   * individual testimony's id, so multiple approvals for the same trainer
   * each pay out rather than colliding on one ledger entry).
   */
  async submit(userId: string, dto: CreateTestimonyDto) {
    if (!(await this.settings.isTestimonyEnabled())) {
      throw new ForbiddenException('Testimonials are not currently open');
    }
    await this.requireDiditVerification(userId);

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
        const rewardTokens =
          testimony.kind === 'VIDEO'
            ? await this.settings.getTestimonyVideoRewardTokens()
            : await this.settings.getTestimonyTextRewardTokens();
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

  /**
   * Hides or re-shows an already-reviewed testimony on the public homepage.
   * Independent of status/reward -- an admin can pull a testimony from
   * public view (e.g. it turned out to be low quality, or the trainer asked
   * for it to come down) without reversing the approval or clawing back the
   * DL already credited.
   */
  async setVisibility(testimonyId: string, dto: UpdateTestimonyVisibilityDto) {
    const testimony = await this.prisma.testimony.findUnique({ where: { id: testimonyId } });
    if (!testimony) throw new NotFoundException('Testimony not found');
    if (testimony.status !== 'APPROVED') {
      throw new ConflictException('Only an approved testimony can be shown or hidden publicly');
    }
    return this.prisma.testimony.update({
      where: { id: testimonyId },
      data: { visible: dto.visible },
    });
  }

  async getPublic(query: ListPublicTestimoniesDto) {
    if (!(await this.settings.isTestimonyEnabled())) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1 };
    }

    const where = { status: 'APPROVED' as const, visible: true };
    const total = await this.prisma.testimony.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const items = await this.prisma.testimony.findMany({
      where,
      orderBy: { reviewedAt: 'desc' },
      skip: (page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        user: {
          select: { firstName: true, referralCode: true, dialect: { select: { name: true } } },
        },
      },
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        text: item.text,
        videoUrl:
          item.videoBucket && item.videoKey
            ? this.storage.getPublicObjectUrl(item.videoBucket, item.videoKey)
            : null,
        trainerFirstName: item.user.firstName,
        trainerProfileSlug: item.user.referralCode,
        dialectName: item.user.dialect?.name ?? null,
      })),
      page,
      pageSize: query.pageSize,
      total,
      totalPages,
    };
  }

  private async requireDiditVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, kycStatus: true },
    });
    if (!user || user.role !== Role.TRAINER || user.kycStatus !== KycStatus.APPROVED) {
      throw new ForbiddenException(
        'Complete and receive approval for your DIDIT identity verification before submitting a testimonial',
      );
    }
  }
}

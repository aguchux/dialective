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
import { UpdateTestimonyTextDto } from './dto/update-testimony-text.dto';

const TESTIMONY_BUCKET = process.env.SPACES_TESTIMONY_BUCKET ?? 'dialectiva-testimonials';
// Anti-flooding guard: caps how many testimonies one trainer can submit in a
// rolling 30-day window, regardless of status (pending/approved/rejected all
// count) -- a rejected or still-pending submission shouldn't let someone
// retry indefinitely to flood the review queue.
const MAX_TESTIMONIES_PER_ROLLING_MONTH = 2;
const ROLLING_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
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
   * Each submission is reviewed and rewarded independently
   * (creditTestimonyReward is keyed by the individual testimony's id, so
   * multiple approvals for the same trainer each pay out rather than
   * colliding on one ledger entry) -- but capped at
   * MAX_TESTIMONIES_PER_ROLLING_MONTH per trainer per rolling 30 days to
   * guard the review queue against one person flooding it.
   */
  async submit(userId: string, dto: CreateTestimonyDto) {
    if (!(await this.settings.isTestimonyEnabled())) {
      throw new ForbiddenException('Testimonials are not currently open');
    }
    await this.requireDiditVerification(userId);
    await this.enforceMonthlySubmissionCap(userId);

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
    const [total, items, totalApproved, approvedThisWeek, approvedThisMonth, lastApproval] =
      await Promise.all([
        this.prisma.testimony.count({ where }),
        this.prisma.testimony.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        }),
        this.prisma.testimony.count({ where: { status: 'APPROVED' } }),
        this.prisma.testimony.count({
          where: {
            status: 'APPROVED',
            reviewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.testimony.count({
          where: {
            status: 'APPROVED',
            reviewedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.testimony.findFirst({
          where: { status: 'APPROVED' },
          orderBy: { reviewedAt: 'desc' },
          select: {
            reviewedAt: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        }),
      ]);
    const userIds = [...new Set(items.map((item) => item.userId))];
    const approvedForUsers = userIds.length
      ? await this.prisma.testimony.findMany({
          where: { userId: { in: userIds }, status: 'APPROVED' },
          select: { userId: true, reviewedAt: true },
          orderBy: { reviewedAt: 'desc' },
        })
      : [];
    const approvalByUser = new Map<string, { count: number; lastAt: Date | null }>();
    for (const approval of approvedForUsers) {
      const current = approvalByUser.get(approval.userId);
      approvalByUser.set(approval.userId, {
        count: (current?.count ?? 0) + 1,
        lastAt: current?.lastAt ?? approval.reviewedAt,
      });
    }

    return {
      items: items.map((item) => ({
        ...item,
        userApprovedCount: approvalByUser.get(item.userId)?.count ?? 0,
        userLastApprovedAt: approvalByUser.get(item.userId)?.lastAt?.toISOString() ?? null,
        videoUrl:
          item.videoBucket && item.videoKey
            ? this.storage.getPublicObjectUrl(item.videoBucket, item.videoKey)
            : null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      analytics: {
        totalApproved,
        approvedThisWeek,
        approvedThisMonth,
        lastApprovalAt: lastApproval?.reviewedAt?.toISOString() ?? null,
        lastApprovalTrainer: lastApproval
          ? [lastApproval.user.firstName, lastApproval.user.lastName].filter(Boolean).join(' ') ||
            lastApproval.user.email
          : null,
      },
    };
  }

  async review(adminId: string, testimonyId: string, dto: ReviewTestimonyDto) {
    const updated = await this.prisma.$transaction(
      async (tx: any) => {
        const testimony = await tx.testimony.findUnique({ where: { id: testimonyId } });
        if (!testimony) throw new NotFoundException('Testimony not found');
        if (testimony.status !== 'PENDING')
          throw new ConflictException('This testimony has already been reviewed');
        if (dto.status === 'APPROVED') {
          const [weeklyLimit, monthlyLimit] = await Promise.all([
            this.settings.getTestimonyApprovalWeeklyLimit(),
            this.settings.getTestimonyApprovalMonthlyLimit(),
          ]);
          const [weeklyCount, monthlyCount] = await Promise.all([
            weeklyLimit > 0
              ? tx.testimony.count({
                  where: {
                    userId: testimony.userId,
                    status: 'APPROVED',
                    reviewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                  },
                })
              : 0,
            monthlyLimit > 0
              ? tx.testimony.count({
                  where: {
                    userId: testimony.userId,
                    status: 'APPROVED',
                    reviewedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                  },
                })
              : 0,
          ]);
          if (weeklyLimit > 0 && weeklyCount >= weeklyLimit)
            throw new ForbiddenException(
              `This trainer has reached the weekly testimony approval limit of ${weeklyLimit}.`,
            );
          if (monthlyLimit > 0 && monthlyCount >= monthlyLimit)
            throw new ForbiddenException(
              `This trainer has reached the monthly testimony approval limit of ${monthlyLimit}.`,
            );
        }
        const updatedTestimony = await tx.testimony.update({
          where: { id: testimonyId },
          data: {
            status: dto.status,
            reviewedAt: new Date(),
            reviewedByAdminId: adminId,
            rejectionReason: dto.status === 'REJECTED' ? dto.rejectionReason : null,
          },
        });
        return { testimony, updated: updatedTestimony };
      },
      { isolationLevel: 'Serializable' },
    );

    const testimony = updated.testimony;

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

    return updated.updated;
  }

  /**
   * An editorial correction is intentionally separate from approval: only a
   * pending TEXT testimony may be changed, the configured trainer-visible
   * length limit still applies, and the responsible admin is retained.
   */
  async updatePendingText(adminId: string, testimonyId: string, dto: UpdateTestimonyTextDto) {
    const testimony = await this.prisma.testimony.findUnique({ where: { id: testimonyId } });
    if (!testimony) throw new NotFoundException('Testimony not found');
    if (testimony.kind !== 'TEXT') {
      throw new BadRequestException('Only text testimonials can be edited');
    }
    if (testimony.status !== 'PENDING') {
      throw new ConflictException('Only pending testimonials can be edited');
    }

    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Enter the corrected testimony text');
    const maxLength = await this.settings.getTestimonyMaxTextLength();
    if (text.length > maxLength) {
      throw new BadRequestException(`Testimony text must be ${maxLength} characters or fewer`);
    }

    return this.prisma.testimony.update({
      where: { id: testimonyId },
      data: { text, adminEditedAt: new Date(), editedByAdminId: adminId },
    });
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

  private async enforceMonthlySubmissionCap(userId: string): Promise<void> {
    const since = new Date(Date.now() - ROLLING_MONTH_MS);
    const recentCount = await this.prisma.testimony.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (recentCount >= MAX_TESTIMONIES_PER_ROLLING_MONTH) {
      throw new ForbiddenException(
        `You can submit up to ${MAX_TESTIMONIES_PER_ROLLING_MONTH} testimonials per month. Please try again later.`,
      );
    }
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

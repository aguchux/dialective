import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCampaignShareDto } from './dto/create-campaign-share.dto';
import { CreateMarketingHeadlineDto } from './dto/create-marketing-headline.dto';
import { CreateMarketingPhotoDto } from './dto/create-marketing-photo.dto';
import {
  CreateMarketingUploadUrlDto,
  MarketingAdFormat,
} from './dto/create-marketing-upload-url.dto';
import { UpdateMarketingHeadlineDto } from './dto/update-marketing-headline.dto';
import { UpdateMarketingPhotoDto } from './dto/update-marketing-photo.dto';

const DEFAULT_MARKETING_BUCKET = 'dialectiva-marketing';
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listMaterials(format?: MarketingAdFormat) {
    const where = { active: true, ...(format ? { format } : {}) };
    const [photos, headlines] = await Promise.all([
      this.prisma.marketingAdPhoto.findMany({ where, orderBy: { sortOrder: 'asc' } }),
      this.prisma.marketingHeadline.findMany({ where, orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      photos: photos.map((photo) => ({
        id: photo.id,
        format: photo.format,
        url: this.storage.getPublicObjectUrl(photo.bucket, photo.key),
      })),
      headlines: headlines.map((headline) => ({
        id: headline.id,
        format: headline.format,
        title: headline.title,
        description: headline.description,
      })),
    };
  }

  async createUploadUrl(dto: CreateMarketingUploadUrlDto) {
    const extension = EXTENSION_BY_CONTENT_TYPE[dto.contentType];
    const key = `ads/${randomUUID()}.${extension}`;
    const bucket = this.getMarketingBucket();
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      bucket,
      key,
      dto.contentType,
      true, // publicRead -- the chosen photo becomes the OpenGraph image on a trainer's public /invite link
    );
    return { uploadUrl: url, key, bucket, expiresInSeconds };
  }

  createPhoto(dto: CreateMarketingPhotoDto) {
    return this.prisma.marketingAdPhoto.create({ data: dto });
  }

  async listPhotosAdmin(format?: MarketingAdFormat) {
    const photos = await this.prisma.marketingAdPhoto.findMany({
      where: format ? { format } : {},
      orderBy: [{ format: 'asc' }, { sortOrder: 'asc' }],
    });
    return photos.map((photo) => ({
      ...photo,
      url: this.storage.getPublicObjectUrl(photo.bucket, photo.key),
    }));
  }

  async updatePhoto(id: string, dto: UpdateMarketingPhotoDto) {
    await this.mustFindPhoto(id);
    return this.prisma.marketingAdPhoto.update({ where: { id }, data: dto });
  }

  async deletePhoto(id: string) {
    const photo = await this.mustFindPhoto(id);
    await this.prisma.marketingAdPhoto.delete({ where: { id } });
    try {
      await this.storage.deleteObject(photo.bucket, photo.key);
    } catch (err) {
      this.logger.error(
        `Failed to delete marketing photo object bucket=${photo.bucket} key=${photo.key}: ${err instanceof Error ? err.message : err}`,
      );
    }
    return photo;
  }

  createHeadline(dto: CreateMarketingHeadlineDto) {
    return this.prisma.marketingHeadline.create({ data: dto });
  }

  listHeadlinesAdmin(format?: MarketingAdFormat) {
    return this.prisma.marketingHeadline.findMany({
      where: format ? { format } : {},
      orderBy: [{ format: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async updateHeadline(id: string, dto: UpdateMarketingHeadlineDto) {
    await this.mustFindHeadline(id);
    return this.prisma.marketingHeadline.update({ where: { id }, data: dto });
  }

  async deleteHeadline(id: string) {
    await this.mustFindHeadline(id);
    return this.prisma.marketingHeadline.delete({ where: { id } });
  }

  private async mustFindPhoto(id: string) {
    const photo = await this.prisma.marketingAdPhoto.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException('Ad photo not found');
    return photo;
  }

  /**
   * Marketing can use a dedicated public bucket, but production deployments
   * that already share blog media storage must not silently sign against the
   * obsolete default bucket. The explicit marketing setting always wins.
   */
  private getMarketingBucket(): string {
    return (
      process.env.SPACES_MARKETING_BUCKET ??
      process.env.SPACES_BLOG_MEDIA_BUCKET ??
      DEFAULT_MARKETING_BUCKET
    );
  }

  private async mustFindHeadline(id: string) {
    const headline = await this.prisma.marketingHeadline.findUnique({ where: { id } });
    if (!headline) throw new NotFoundException('Headline not found');
    return headline;
  }

  /**
   * Idempotent on the (userId, photoId, headlineId) unique constraint --
   * reopening the share dialog for a pairing the trainer already shared
   * reuses the same share id/stats instead of fragmenting counts across
   * multiple rows for the same pairing.
   */
  async getOrCreateShare(userId: string, dto: CreateCampaignShareDto) {
    const [photo, headline] = await Promise.all([
      this.mustFindPhoto(dto.photoId),
      this.mustFindHeadline(dto.headlineId),
    ]);
    if (photo.format !== headline.format) {
      throw new BadRequestException('Photo and headline must be the same ad format');
    }

    const existing = await this.prisma.marketingCampaignShare.findUnique({
      where: {
        userId_photoId_headlineId: { userId, photoId: dto.photoId, headlineId: dto.headlineId },
      },
    });
    if (existing) return existing;

    return this.prisma.marketingCampaignShare.create({
      data: { userId, photoId: dto.photoId, headlineId: dto.headlineId },
    });
  }

  /**
   * Powers the invite page's generateMetadata -- called on every render of
   * /invite/[code]/[shareId], so a best-effort recordView is folded in here
   * rather than requiring a second round trip from the frontend.
   */
  async getShareForInvite(shareId: string) {
    const share = await this.prisma.marketingCampaignShare.findUnique({
      where: { id: shareId },
      include: { photo: true, headline: true },
    });
    if (!share) throw new NotFoundException('Campaign not found');

    try {
      await this.prisma.marketingCampaignShare.update({
        where: { id: shareId },
        data: { viewCount: { increment: 1 } },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record view for marketing campaign share=${shareId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return {
      title: share.headline.title,
      description: share.headline.description,
      photoUrl: this.storage.getPublicObjectUrl(share.photo.bucket, share.photo.key),
    };
  }

  /**
   * Best-effort attribution called from the registration flow -- a tracking
   * failure must never block account creation. Swallows a P2002 on
   * invitedUserId (a second registration attempt/race) as a no-op, same
   * idempotency posture as the reward-credit helpers in packages/db.
   */
  async recordRegistration(shareId: string, invitedUserId: string): Promise<void> {
    try {
      await this.prisma.marketingCampaignRegistration.create({
        data: { shareId, invitedUserId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      this.logger.error(
        `Failed to record marketing campaign registration share=${shareId} user=${invitedUserId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async listMyShares(userId: string) {
    const shares = await this.prisma.marketingCampaignShare.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        photo: true,
        headline: true,
        _count: { select: { registrations: true } },
      },
    });
    return shares.map((share) => ({
      id: share.id,
      format: share.photo.format,
      photoUrl: this.storage.getPublicObjectUrl(share.photo.bucket, share.photo.key),
      headlineTitle: share.headline.title,
      viewCount: share.viewCount,
      registeredCount: share._count.registrations,
      createdAt: share.createdAt,
    }));
  }
}

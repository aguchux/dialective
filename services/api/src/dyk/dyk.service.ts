import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DykNoticeDto, DykSettingsDto } from './dyk.dto';

@Injectable()
export class DykService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  private bucket() {
    return process.env.SPACES_MARKETING_BUCKET ?? process.env.SPACES_BLOG_MEDIA_BUCKET ?? 'dialectiva-marketing';
  }

  settings() {
    return this.prisma.dykSettings.upsert({ where: { id: 'default' }, update: {}, create: {} });
  }

  saveSettings(data: DykSettingsDto) {
    return this.prisma.dykSettings.upsert({ where: { id: 'default' }, update: data, create: data });
  }

  async upload(contentType: string) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
    const key = `dyk/${randomUUID()}.${extension}`;
    const bucket = this.bucket();
    const result = await this.storage.createPresignedUploadUrl(bucket, key, contentType, true);
    return { uploadUrl: result.url, key, bucket };
  }

  private present<T extends { imageBucket: string; imageKey: string }>(notice: T) {
    return { ...notice, imageUrl: this.storage.getPublicObjectUrl(notice.imageBucket, notice.imageKey) };
  }

  async listAdmin() {
    return (await this.prisma.dykNotice.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })).map(n => this.present(n));
  }

  async saveNotice(dto: DykNoticeDto, id?: string) {
    if (dto.imageBucket !== this.bucket()) throw new BadRequestException('Invalid image bucket');
    // Only app routes and the project's HTTPS channels can be advertised.
    const href = dto.href.trim();
    const internal = /^\/(?!\/)/.test(href) && !/[\\\s\x00-\x1f]/.test(href);
    let external = false;
    try {
      const url = new URL(href);
      external = url.protocol === 'https:' && !url.username && !url.password &&
        ['www.dialectlibrary.com', 'dialectlibrary.com', 'stream.dialectlibrary.com', 'community.dialectlibrary.com', 'wa.me', 'www.youtube.com'].includes(url.hostname);
    } catch { /* Internal routes are not absolute URLs. */ }
    if (!internal && !external) throw new BadRequestException('Choose an internal route or approved HTTPS channel');
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Content is required');
    const ctaLabel = dto.ctaLabel?.trim() || 'Try it Now';
    const wantsCourse = dto.stopConditions.includes('COURSE');
    if (wantsCourse && !await this.prisma.course.findUnique({ where: { id: dto.targetId || '' } })) {
      throw new BadRequestException('Choose an existing course ID');
    }
    const data = { ...dto, href, content, ctaLabel, targetId: wantsCourse ? dto.targetId : null };
    return this.present(id
      ? await this.prisma.dykNotice.update({ where: { id }, data })
      : await this.prisma.dykNotice.create({ data }));
  }

  deleteNotice(id: string) {
    return this.prisma.dykNotice.delete({ where: { id } });
  }

  /**
   * OR logic -- true the moment ANY one of the notice's stopConditions is
   * satisfied. CLICKED/VISITED read straight off the trainer's own state row
   * (set by click()/visit()); every other condition is a live DB check, same
   * as before this became an array.
   */
  private async adopted(
    tx: Prisma.TransactionClient,
    userId: string,
    notice: { stopConditions: string[]; targetId: string | null },
    state: { clickedAt: Date | null; visitedAt: Date | null } | undefined,
  ) {
    for (const condition of notice.stopConditions) {
      const met = await (async () => {
        switch (condition) {
          case 'CLICKED': return !!state?.clickedAt;
          case 'VISITED': return !!state?.visitedAt;
          case 'PHONE': return !!(await tx.user.findUnique({ where: { id: userId }, select: { phoneVerifiedAt: true } }))?.phoneVerifiedAt;
          case 'KYC': return (await tx.user.findUnique({ where: { id: userId }, select: { kycStatus: true } }))?.kycStatus === 'APPROVED';
          case 'PWA': return !!(await tx.user.findUnique({ where: { id: userId }, select: { pwaInstalledAt: true } }))?.pwaInstalledAt;
          case 'REFERRAL_SHARE': return !!await tx.marketingCampaignShare.findFirst({ where: { userId }, select: { id: true } });
          case 'TRAINING': return !!await tx.wordRecording.findFirst({ where: { userId }, select: { id: true } });
          case 'TESTIMONY': return !!await tx.testimony.findFirst({ where: { userId }, select: { id: true } });
          case 'QRAC': return !!await tx.qracAffirmationSubmission.findFirst({ where: { userId }, select: { id: true } });
          case 'COURSE': return !!await tx.courseProgress.findFirst({ where: { userId, courseId: notice.targetId ?? '', completedAt: { not: null } }, select: { id: true } });
          default: return false;
        }
      })();
      if (met) return true;
    }
    return false;
  }

  async feed(userId: string) {
    const settings = await this.settings();
    if (!settings.enabled) return { items: [], nextAt: null };
    const notices = await this.prisma.dykNotice.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { states: { where: { userId } } } });
    const latest = await this.prisma.dykUserState.findFirst({ where: { userId, lastShownAt: { not: null } }, orderBy: { lastShownAt: 'desc' } });
    const items = [];
    for (const { states, ...notice } of notices) {
      const state = states[0];
      if ((state?.displays ?? 0) >= settings.maxDisplays) continue;
      if (state?.lastShownAt && Date.now() - state.lastShownAt.getTime() < settings.intervalMinutes * 60000) continue;
      if (await this.adopted(this.prisma, userId, notice, state)) continue;
      items.push(this.present(notice));
    }
    return { items, nextAt: latest?.lastShownAt ? new Date(latest.lastShownAt.getTime() + settings.intervalMinutes * 60000).toISOString() : null };
  }

  async impression(userId: string, noticeId: string, navigation = false) {
    return this.prisma.$transaction(async tx => {
      // Serialize all tabs/devices for this user before checking display caps.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const settings = await tx.dykSettings.findUnique({ where: { id: 'default' } });
      const notice = await tx.dykNotice.findUnique({ where: { id: noticeId } });
      if (!settings?.enabled || !notice?.active) return { allowed: false };
      const state = await tx.dykUserState.findUnique({ where: { userId_noticeId: { userId, noticeId } } });
      if ((state?.displays ?? 0) >= settings.maxDisplays) return { allowed: false };
      const cutoff = Date.now() - settings.intervalMinutes * 60000;
      if (state?.lastShownAt && state.lastShownAt.getTime() > cutoff) return { allowed: false };
      if (!navigation) {
        const latest = await tx.dykUserState.findFirst({ where: { userId, lastShownAt: { gt: new Date(cutoff) } } });
        if (latest) return { allowed: false };
      }
      if (await this.adopted(tx, userId, notice, state ?? undefined)) return { allowed: false };
      await tx.dykUserState.upsert({
        where: { userId_noticeId: { userId, noticeId } },
        create: { userId, noticeId, displays: 1, lastShownAt: new Date() },
        update: { displays: { increment: 1 }, lastShownAt: new Date() },
      });
      return { allowed: true };
    });
  }

  async click(userId: string, noticeId: string) {
    const notice = await this.prisma.dykNotice.findUnique({ where: { id: noticeId } });
    if (!notice?.active) throw new NotFoundException('Notice is no longer available');
    // An external link leaves the app, so we can never observe real arrival
    // the way visit() confirms for an internal route -- the click itself is
    // the closest signal we have, so VISITED is set here too for those.
    const isInternal = notice.href.startsWith('/');
    await this.prisma.dykUserState.upsert({
      where: { userId_noticeId: { userId, noticeId } },
      create: { userId, noticeId, clickedAt: new Date(), ...(isInternal ? {} : { visitedAt: new Date() }) },
      update: { clickedAt: new Date(), ...(isInternal ? {} : { visitedAt: new Date() }) },
    });
    return { href: notice.href };
  }

  /**
   * Confirms actual arrival at an internal-route notice's destination --
   * called by the frontend once that page has loaded (see DykController's
   * doc comment). Silently no-ops on an unknown/inactive notice or a
   * mismatched href, rather than erroring, since this is a best-effort
   * tracking signal, not a user-facing action.
   */
  async visit(userId: string, noticeId: string, href: string) {
    const notice = await this.prisma.dykNotice.findUnique({ where: { id: noticeId } });
    if (!notice || notice.href !== href) return { recorded: false };
    await this.prisma.dykUserState.upsert({
      where: { userId_noticeId: { userId, noticeId } },
      create: { userId, noticeId, visitedAt: new Date() },
      update: { visitedAt: new Date() },
    });
    return { recorded: true };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const ROW_CACHE_TTL_MS = 5_000;

/**
 * Admin-editable Community-wide gates, same singleton-row/cache posture as
 * PlatformSettingsService -- upserts the id="default" row on read so no
 * seed/migration data-fill is ever needed, and a short TTL cache collapses
 * repeated reads within one request without needing explicit invalidation.
 */
@Injectable()
export class CommunitySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private cachedRow: Awaited<ReturnType<CommunitySettingsService['fetchRow']>> | null = null;
  private cachedAt = 0;

  private async fetchRow() {
    return this.prisma.communitySettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  private async getRow() {
    const now = Date.now();
    if (this.cachedRow && now - this.cachedAt < ROW_CACHE_TTL_MS) {
      return this.cachedRow;
    }
    const row = await this.fetchRow();
    this.cachedRow = row;
    this.cachedAt = now;
    return row;
  }

  async isPostingEnabled(): Promise<boolean> {
    return (await this.getRow()).postingEnabled;
  }

  async isRepliesEnabled(): Promise<boolean> {
    return (await this.getRow()).repliesEnabled;
  }

  async isAttachmentsEnabled(): Promise<boolean> {
    return (await this.getRow()).attachmentsEnabled;
  }

  async isReactionsEnabled(): Promise<boolean> {
    return (await this.getRow()).reactionsEnabled;
  }

  async getNewMemberPostingDelayMinutes(): Promise<number> {
    return (await this.getRow()).newMemberPostingDelayMinutes;
  }

  async isApprovalRequiredForNewMembers(): Promise<boolean> {
    return (await this.getRow()).requireApprovalForNewMembers;
  }

  async getForAdmin() {
    const row = await this.getRow();
    return {
      postingEnabled: row.postingEnabled,
      repliesEnabled: row.repliesEnabled,
      attachmentsEnabled: row.attachmentsEnabled,
      reactionsEnabled: row.reactionsEnabled,
      newMemberPostingDelayMinutes: row.newMemberPostingDelayMinutes,
      requireApprovalForNewMembers: row.requireApprovalForNewMembers,
      adsterraEnabled: row.adsterraEnabled,
      adsterraSiteId: row.adsterraSiteId,
      monetagEnabled: row.monetagEnabled,
      monetagZoneId: row.monetagZoneId,
    };
  }

  /**
   * Public, unauthenticated bundle for the Community app's own ad-script
   * injector. Each network only reports enabled=true once its ID is also
   * set -- an admin flipping the toggle on before saving the ID must never
   * ship a half-configured/empty embed, same posture as
   * PlatformSettingsService.getTawkToWidget.
   */
  async getPublicAdSettings(): Promise<{
    adsterra: { enabled: boolean; siteId: string | null };
    monetag: { enabled: boolean; zoneId: string | null };
  }> {
    const row = await this.getRow();
    const adsterraEnabled = row.adsterraEnabled && Boolean(row.adsterraSiteId);
    const monetagEnabled = row.monetagEnabled && Boolean(row.monetagZoneId);
    return {
      adsterra: { enabled: adsterraEnabled, siteId: adsterraEnabled ? row.adsterraSiteId : null },
      monetag: { enabled: monetagEnabled, zoneId: monetagEnabled ? row.monetagZoneId : null },
    };
  }

  async update(data: {
    postingEnabled?: boolean;
    repliesEnabled?: boolean;
    attachmentsEnabled?: boolean;
    reactionsEnabled?: boolean;
    newMemberPostingDelayMinutes?: number;
    requireApprovalForNewMembers?: boolean;
    adsterraEnabled?: boolean;
    adsterraSiteId?: string | null;
    monetagEnabled?: boolean;
    monetagZoneId?: string | null;
  }) {
    const row = await this.prisma.communitySettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    this.cachedRow = row;
    this.cachedAt = Date.now();
    return this.getForAdmin();
  }
}

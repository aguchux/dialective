import { Injectable, NotFoundException } from '@nestjs/common';
import { AsrTranscriptionRequestStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { ListAsrTranscriptionRequestsAdminDto } from './dto/list-asr-transcription-requests-admin.dto';

/**
 * Tracks a trainer's request to have ASR transcription enabled for their
 * dialect, once WordsService.nextAssignment blocks them for it (see
 * WordsService.assertAsrAvailable). Deliberately idempotent per
 * (user, dialect) -- clicking "Send request" repeatedly just returns the
 * same open row instead of piling up duplicates.
 *
 * Acknowledging/fulfilling a request here is TRACKING ONLY -- it does not
 * touch models/asr-registry.yaml and does not unlock anything. A dialect
 * only becomes usable once it has a real registry entry + checkpoint, the
 * same manual process used for Kinyarwanda.
 */
@Injectable()
export class AsrTranscriptionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async createOrGetMine(userId: string, dialectTag: string) {
    const dialect = await this.prisma.dialect.findUnique({ where: { tag: dialectTag } });
    if (!dialect) throw new NotFoundException('Dialect not found');

    const existing = await this.prisma.asrTranscriptionRequest.findUnique({
      where: { userId_dialectId: { userId, dialectId: dialect.id } },
    });
    if (existing) return existing;

    return this.prisma.asrTranscriptionRequest.create({
      data: { userId, dialectId: dialect.id },
    });
  }

  async getMine(userId: string, dialectTag: string) {
    const dialect = await this.prisma.dialect.findUnique({ where: { tag: dialectTag } });
    if (!dialect) throw new NotFoundException('Dialect not found');

    return this.prisma.asrTranscriptionRequest.findUnique({
      where: { userId_dialectId: { userId, dialectId: dialect.id } },
    });
  }

  async listForAdmin(query: ListAsrTranscriptionRequestsAdminDto) {
    return this.prisma.asrTranscriptionRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        dialect: { select: { id: true, tag: true, name: true } },
        acknowledgedByAdmin: { select: { id: true, email: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async setStatus(id: string, adminUserId: string, status: AsrTranscriptionRequestStatus) {
    const request = await this.prisma.asrTranscriptionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');

    return this.prisma.asrTranscriptionRequest.update({
      where: { id },
      data: {
        status,
        acknowledgedByAdminId: adminUserId,
        acknowledgedAt: new Date(),
      },
    });
  }

  /**
   * Admin escape hatch, global across every dialect: when set, no dialect
   * is blocked for missing ASR support, regardless of
   * models/asr-registry.yaml -- lets everyone record unscored/untranscribed
   * while checkpoints are still being sourced/trained. See
   * WordsService.assertAsrAvailable. Independent of request status --
   * toggling this does not touch any AsrTranscriptionRequest rows.
   */
  async getGateBypassStatus(): Promise<{ bypassed: boolean }> {
    return { bypassed: await this.settings.isAsrGateGloballyBypassed() };
  }

  async setGateBypass(bypassed: boolean): Promise<{ bypassed: boolean }> {
    await this.settings.update({ asrGateGloballyBypassed: bypassed });
    return { bypassed };
  }
}

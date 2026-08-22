import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAudioRetentionRuleDto } from './dto/create-audio-retention-rule.dto';
import { UpdateAudioRetentionRuleDto } from './dto/update-audio-retention-rule.dto';

/**
 * Admin CRUD for AudioRetentionRule -- the rules audio-retention-job reads
 * to decide which terminal Submission/WordRecording audio to purge. This
 * service never touches Spaces or the Submission/WordRecording tables
 * itself; it only manages the rule rows. See schema.prisma's
 * AudioRetentionRule doc comment for the most-specific-match resolution
 * logic the job applies.
 */
@Injectable()
export class DatasetStorageService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules() {
    const rules = await this.prisma.audioRetentionRule.findMany({
      orderBy: [{ createdAt: 'asc' }],
      include: { country: { select: { id: true, name: true, code: true } } },
    });
    return rules.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      countryId: rule.countryId,
      country: rule.country
        ? { id: rule.country.id, name: rule.country.name, code: rule.country.code }
        : null,
      dialectTag: rule.dialectTag,
      retentionDays: rule.retentionDays,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    }));
  }

  async createRule(dto: CreateAudioRetentionRuleDto) {
    return this.prisma.audioRetentionRule.create({
      data: {
        enabled: dto.enabled ?? true,
        countryId: dto.countryId ?? null,
        dialectTag: dto.dialectTag ?? null,
        retentionDays: dto.retentionDays,
      },
    });
  }

  async updateRule(id: string, dto: UpdateAudioRetentionRuleDto) {
    await this.getRuleOrThrow(id);
    return this.prisma.audioRetentionRule.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.countryId !== undefined ? { countryId: dto.countryId } : {}),
        ...(dto.dialectTag !== undefined ? { dialectTag: dto.dialectTag } : {}),
        ...(dto.retentionDays !== undefined ? { retentionDays: dto.retentionDays } : {}),
      },
    });
  }

  async deleteRule(id: string) {
    await this.getRuleOrThrow(id);
    await this.prisma.audioRetentionRule.delete({ where: { id } });
    return { id };
  }

  private async getRuleOrThrow(id: string) {
    const rule = await this.prisma.audioRetentionRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Retention rule not found');
    return rule;
  }
}

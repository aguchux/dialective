import { Injectable, NotFoundException } from '@nestjs/common';
import { CommunityReportStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommunityReportDto } from '../dto/create-community-report.dto';

@Injectable()
export class CommunityReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async file(reporterId: string, dto: CreateCommunityReportDto) {
    return this.prisma.communityReport.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        postId: dto.targetType === 'POST' ? dto.targetId : undefined,
        replyId: dto.targetType === 'REPLY' ? dto.targetId : undefined,
        reason: dto.reason,
        notes: dto.notes,
      },
    });
  }

  async listForAdmin(status?: CommunityReportStatus) {
    return this.prisma.communityReport.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { firstName: true, lastName: true, email: true } },
        assignedModerator: { select: { firstName: true, lastName: true } },
        post: { select: { id: true, title: true, slug: true } },
        reply: { select: { id: true, body: true } },
      },
    });
  }

  async assign(reportId: string, moderatorId: string) {
    const report = await this.prisma.communityReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    return this.prisma.communityReport.update({
      where: { id: reportId },
      data: { status: 'IN_REVIEW', assignedModeratorId: moderatorId },
    });
  }

  async resolve(reportId: string) {
    const report = await this.prisma.communityReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    return this.prisma.communityReport.update({
      where: { id: reportId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }

  async dismiss(reportId: string) {
    const report = await this.prisma.communityReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    return this.prisma.communityReport.update({
      where: { id: reportId },
      data: { status: 'DISMISSED', resolvedAt: new Date() },
    });
  }
}

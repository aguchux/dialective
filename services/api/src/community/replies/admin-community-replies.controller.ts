import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ListCommunityContentAdminDto } from '../dto/list-community-content-admin.dto';

@Controller('admin/community/replies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunityRepliesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: ListCommunityContentAdminDto) {
    const { page, pageSize, authorId, postId } = query;
    const where = {
      ...(authorId ? { authorId } : {}),
      ...(postId ? { postId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.communityReply.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: { select: { firstName: true, lastName: true, email: true } },
          post: { select: { id: true, title: true, slug: true } },
        },
      }),
      this.prisma.communityReply.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}

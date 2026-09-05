import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunityPostsService } from './community-posts.service';

@Controller('admin/community/posts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCommunityPostsController {
  constructor(
    private readonly posts: CommunityPostsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list() {
    return this.prisma.communityPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        author: { select: { firstName: true, lastName: true, email: true } },
        space: { select: { name: true, slug: true } },
      },
    });
  }

  @Patch(':id/pin')
  setPinned(@Param('id') id: string, @Body('isPinned') isPinned: boolean) {
    return this.posts.setPinned(id, isPinned);
  }

  @Patch(':id/lock')
  setLocked(@Param('id') id: string, @Body('isLocked') isLocked: boolean) {
    return this.posts.setLocked(id, isLocked);
  }
}

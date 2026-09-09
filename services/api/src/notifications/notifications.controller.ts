import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessTokenClaims } from '../auth/jwt.util';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateSystemUpdateDto } from './dto/create-system-update.dto';
import { UpdateSystemUpdateDto } from './dto/update-system-update.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenClaims, @Query('page') page?: string) {
    return this.notifications.listForUser(user.sub, page ? Number(page) : 1);
  }

  @Get('banner')
  listBanner() {
    return this.notifications.listBannerUpdates();
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AccessTokenClaims) {
    return this.notifications.markAllRead(user.sub);
  }
}

@Controller('notifications/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class NotificationsAdminController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('updates')
  listUpdates() {
    return this.notifications.listAdminUpdates();
  }

  @Post('updates')
  createUpdate(@CurrentUser() user: AccessTokenClaims, @Body() dto: CreateSystemUpdateDto) {
    return this.notifications.createManualUpdate(user.sub, dto);
  }

  @Patch('updates/:id')
  editUpdate(@Param('id') id: string, @Body() dto: UpdateSystemUpdateDto) {
    return this.notifications.updateUpdate(id, dto);
  }

  @Delete('updates/:id')
  deleteUpdate(@Param('id') id: string) {
    return this.notifications.deleteUpdate(id);
  }
}

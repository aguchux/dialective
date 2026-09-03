import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@dialectiva/db';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessTokenClaims } from '../auth/jwt.util';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { AdminSmsService } from './admin-sms.service';
import { CreateAdminSmsDto } from './dto/create-admin-sms.dto';
import { ListAdminSmsContactsDto } from './dto/list-admin-sms-contacts.dto';
import { ListAdminSmsMessagesDto } from './dto/list-admin-sms-messages.dto';

@Controller('admin/sms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSmsController {
  constructor(private readonly adminSms: AdminSmsService) {}

  @Get('contacts')
  listContacts(@Query() query: ListAdminSmsContactsDto) {
    return this.adminSms.listContacts(query);
  }

  @Get('contacts/:contactId/messages')
  listMessages(@Param('contactId') contactId: string, @Query() query: ListAdminSmsMessagesDto) {
    return this.adminSms.listMessages(contactId, query);
  }

  @Post('send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  send(@CurrentUser() admin: AccessTokenClaims, @Body() dto: CreateAdminSmsDto) {
    return this.adminSms.send(admin.sub, dto);
  }
}

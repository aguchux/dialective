import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WhatsAppValidatorService } from './whatsapp-validator.service';
import { ListAdminWhatsAppValidationsDto } from './dto/list-admin-whatsapp-validations.dto';
import { VerifyWhatsAppValidationDto } from './dto/whatsapp-validator.dto';

/**
 * Admin oversight over the peer WhatsApp Validator flow -- lets an admin
 * see every request platform-wide (who requested, who claimed, current
 * status) and step in when a peer verification gets stuck, mirroring the
 * override capabilities the old ManualPhoneVerificationRequest admin flow
 * had (verify with code, force-verify without one, reject), but layered on
 * top of the peer-driven request/claim lifecycle instead of replacing it.
 */
@Controller('admin/whatsapp-validator')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminWhatsAppValidatorController {
  constructor(private readonly whatsappValidator: WhatsAppValidatorService) {}

  @Get('requests')
  list(@Query() query: ListAdminWhatsAppValidationsDto) {
    return this.whatsappValidator.listAdmin(query);
  }

  @Post('requests/:id/verify')
  verify(@Param('id') id: string, @Body() body: VerifyWhatsAppValidationDto) {
    return this.whatsappValidator.adminVerify(id, body.code);
  }

  @Post('requests/:id/force-verify')
  forceVerify(@Param('id') id: string) {
    return this.whatsappValidator.adminForceVerify(id);
  }

  @Post('requests/:id/reject')
  reject(@Param('id') id: string) {
    return this.whatsappValidator.adminReject(id);
  }
}

import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { WhatsAppValidatorService } from './whatsapp-validator.service';
import { RequestWhatsAppValidationDto, VerifyWhatsAppValidationDto } from './dto/whatsapp-validator.dto';
import { ListPendingWhatsAppValidationDto } from './dto/list-pending-whatsapp-validation.dto';

@Controller('whatsapp-validator')
@UseGuards(JwtAuthGuard)
export class WhatsAppValidatorController {
  constructor(private readonly whatsappValidator: WhatsAppValidatorService) {}

  @Post('requests')
  requestVerification(@Req() req: AuthenticatedRequest, @Body() body: RequestWhatsAppValidationDto) {
    return this.whatsappValidator.requestVerification(req.user.sub, body.phoneNumber);
  }

  @Get('requests/mine')
  myRequest(@Req() req: AuthenticatedRequest) {
    return this.whatsappValidator.myRequest(req.user.sub);
  }

  @Post('requests/mine/regenerate')
  regenerateCode(@Req() req: AuthenticatedRequest) {
    return this.whatsappValidator.regenerateCode(req.user.sub);
  }

  @Get('pending')
  listPending(@Req() req: AuthenticatedRequest, @Query() query: ListPendingWhatsAppValidationDto) {
    return this.whatsappValidator.listPending(req.user.sub, query.page, query.pageSize);
  }

  @Get('my-claims')
  myClaims(@Req() req: AuthenticatedRequest) {
    return this.whatsappValidator.myClaims(req.user.sub);
  }

  @Post('requests/:id/claim')
  claim(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.whatsappValidator.claim(req.user.sub, id);
  }

  @Post('requests/:id/verify')
  verify(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: VerifyWhatsAppValidationDto,
  ) {
    return this.whatsappValidator.verify(req.user.sub, id, body.code);
  }

  @Post('requests/:id/reject')
  reject(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.whatsappValidator.reject(req.user.sub, id);
  }
}

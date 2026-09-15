import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { WhatsAppValidatorService } from './whatsapp-validator.service';
import { RequestWhatsAppValidationDto, VerifyWhatsAppValidationDto } from './dto/whatsapp-validator.dto';

@Controller('whatsapp-validator')
@UseGuards(JwtAuthGuard)
export class WhatsAppValidatorController {
  constructor(private readonly whatsappValidator: WhatsAppValidatorService) {}

  @Post('requests')
  requestVerification(@Req() req: AuthenticatedRequest, @Body() body: RequestWhatsAppValidationDto) {
    return this.whatsappValidator.requestVerification(req.user.sub, body.phoneNumber);
  }

  @Get('requests/mine')
  myRequests(@Req() req: AuthenticatedRequest) {
    return this.whatsappValidator.myRequests(req.user.sub);
  }

  @Post('next')
  claimNext(@Req() req: AuthenticatedRequest) {
    return this.whatsappValidator.claimNext(req.user.sub);
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

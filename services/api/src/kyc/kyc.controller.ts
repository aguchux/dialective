import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { KycStatus } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@dialectiva/db';
import { KycService } from './kyc.service';
import { AdminListKycDto } from './dto/admin-list-kyc.dto';

@Controller()
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('kyc/session')
  @UseGuards(JwtAuthGuard)
  createSession(@Req() req: AuthenticatedRequest) {
    const frontend = process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
    const callbackUrl = new URL('/dashboard?view=tokens&kyc=complete', frontend).toString();
    return this.kyc.createVerificationSession(req.user.sub, callbackUrl);
  }

  @Get('kyc/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.kyc.getMyStatus(req.user.sub);
  }

  /**
   * No JwtAuthGuard -- Didit can't send a JWT, trust comes from
   * verifyWebhookSignature instead (see didit.service.ts's doc comment on
   * the three header schemes it checks). Needs the raw request body
   * (main.ts's `rawBody: true`), same as wallet.controller.ts's Flutterwave
   * webhook handler, since two of Didit's three signature schemes are
   * computed over raw/re-sorted bytes rather than the parsed body.
   */
  @Post('kyc/webhooks/didit')
  async handleWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw request body');
    }
    const headers: Record<string, string | undefined> = {
      'x-signature-v2': req.headers['x-signature-v2'] as string | undefined,
      'x-signature': req.headers['x-signature'] as string | undefined,
      'x-signature-simple': req.headers['x-signature-simple'] as string | undefined,
      'x-timestamp': req.headers['x-timestamp'] as string | undefined,
    };
    const body = req.body as {
      session_id?: string;
      status?: string;
      webhook_type?: string;
      decision?: Record<string, unknown>;
    };
    return this.kyc.handleWebhook(body, rawBody, headers);
  }

  @Get('admin/kyc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminList(@Query() query: AdminListKycDto) {
    return this.kyc.adminList({
      status: query.status as KycStatus | undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  @Get('admin/kyc/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminGet(@Param('id') id: string) {
    return this.kyc.adminGet(id);
  }

  @Post('admin/kyc/:id/refresh')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminRefresh(@Param('id') id: string) {
    return this.kyc.refreshFromProvider(id);
  }
}

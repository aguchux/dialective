import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { SsoService } from './sso.service';

/**
 * The untrusted, public-facing SAML surface -- hit by an external IdP
 * pre-auth, so NOT behind SubscriberAuthGuard (unlike
 * sso-idp-config.controller.ts). Split precedent: oauth-token.controller.ts
 * vs oauth-clients.controller.ts.
 */
@Controller('voice-stream/sso')
export class SsoAcsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sso: SsoService,
  ) {}

  private async getActiveConfig(organizationId: string) {
    const config = await this.prisma.ssoIdpConfig.findUnique({ where: { organizationId } });
    if (!config || !config.active) {
      throw new NotFoundException('SSO is not configured for this organization');
    }
    return config;
  }

  @Get(':organizationId/metadata')
  @Header('Content-Type', 'application/xml')
  async metadata(@Param('organizationId') organizationId: string): Promise<string> {
    const config = await this.getActiveConfig(organizationId);
    return this.sso.generateMetadata(config);
  }

  /**
   * SP-initiated login. No dashboard exists yet to drive a browser redirect
   * from, so this returns the redirect URL as JSON rather than issuing an
   * HTTP 302 itself -- a real, working endpoint that nothing calls yet,
   * ready for whenever a dashboard exists to consume it.
   */
  @Get(':organizationId/login')
  async login(@Param('organizationId') organizationId: string): Promise<{ redirectUrl: string }> {
    const config = await this.getActiveConfig(organizationId);
    const redirectUrl = await this.sso.getLoginRedirectUrl(config);
    return { redirectUrl };
  }

  /**
   * Assertion Consumer Service. The org is resolved from a ?org= query
   * param on the ACS URL registered with each IdP at config-creation time
   * (SsoIdpConfigService), not a path param -- avoids parsing
   * attacker-controlled XML to read an Issuer before we know which cert to
   * validate against. Rate-limited: this is unauthenticated and
   * attacker-reachable (anyone can POST an arbitrary SAMLResponse body).
   */
  @Post('acs')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  async acs(
    @Query('org') organizationId: string | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!organizationId) {
      throw new UnauthorizedException('Missing organization');
    }
    const config = await this.getActiveConfig(organizationId);
    return this.sso.handleAcsPost(config, body);
  }
}

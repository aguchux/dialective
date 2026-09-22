import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../../auth/token.util';
import { signM2mToken } from './oauth-m2m-jwt.util';
import { OAuthTokenDto } from './dto/oauth-token.dto';

/**
 * The client_credentials grant endpoint -- under /stream/v1, the
 * machine-client namespace (doc section 63), not /voice-stream, the
 * dashboard namespace. Uses standard OAuth2 field names
 * (grant_type/client_id/client_secret, snake_case) for compatibility with
 * off-the-shelf OAuth2 client libraries.
 */
@Controller('stream/v1/oauth')
export class OAuthTokenController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('token')
  async issueToken(@Body() dto: OAuthTokenDto) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: dto.client_id },
    });
    if (!client || client.revokedAt) {
      throw new UnauthorizedException('Invalid client credentials');
    }
    if (hashToken(dto.client_secret) !== client.secretHash) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const { token, expiresInSeconds } = signM2mToken({
      sub: client.clientId,
      organizationId: client.organizationId,
      deckId: client.deckId,
      scopes: client.scopes,
      purposes: client.purposes,
    });

    return { access_token: token, token_type: 'Bearer', expires_in: expiresInSeconds };
  }
}

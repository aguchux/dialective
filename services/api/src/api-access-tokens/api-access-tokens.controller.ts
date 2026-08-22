import { BadRequestException, Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenClaims } from '../auth/jwt.util';
import { ApiAccessTokenKey, ApiAccessTokensService, KNOWN_API_ACCESS_TOKEN_KEYS } from './api-access-tokens.service';
import { SetApiAccessTokenDto } from './dto/set-api-access-token.dto';

function assertKnownKey(key: string): asserts key is ApiAccessTokenKey {
  if (!(KNOWN_API_ACCESS_TOKEN_KEYS as readonly string[]).includes(key)) {
    throw new BadRequestException(`Unknown API access token key: ${key}`);
  }
}

/** Admin Settings -> "API Access Tokens" tab -- see ApiAccessTokensService's doc comment for why this is a separate table/module from PlatformSettings. */
@Controller('admin/api-access-tokens')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ApiAccessTokensController {
  constructor(private readonly tokens: ApiAccessTokensService) {}

  @Get()
  list() {
    return this.tokens.list();
  }

  @Put(':key')
  async set(@Param('key') key: string, @Body() dto: SetApiAccessTokenDto, @CurrentUser() user: AccessTokenClaims) {
    assertKnownKey(key);
    return this.tokens.set(key, dto.value, user.sub);
  }

  @Delete(':key')
  async remove(@Param('key') key: string) {
    assertKnownKey(key);
    await this.tokens.remove(key);
    return { removed: true };
  }
}

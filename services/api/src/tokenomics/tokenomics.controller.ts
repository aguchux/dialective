import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TokenomicsService } from './tokenomics.service';
import { LockTokensDto } from './dto/lock-tokens.dto';
import { UnlockTokensDto } from './dto/unlock-tokens.dto';
import { BurnTokensDto } from './dto/burn-tokens.dto';
import { ValuationHistoryQueryDto } from './dto/valuation-history-query.dto';

@Controller()
export class TokenomicsController {
  constructor(private readonly tokenomics: TokenomicsService) {}

  @Get('tokenomics/status')
  @UseGuards(JwtAuthGuard)
  status() {
    return this.tokenomics.getStatus();
  }

  @Get('valuation/history')
  @UseGuards(JwtAuthGuard)
  valuationHistory(@Query() query: ValuationHistoryQueryDto) {
    return this.tokenomics.getValuationHistory({
      limit: query.limit,
      before: query.before ? new Date(query.before) : undefined,
    });
  }

  @Post('admin/tokenomics/valuation/recalculate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  recalculate() {
    return this.tokenomics.recalculateValuation();
  }

  @Post('tokens/lock')
  @UseGuards(JwtAuthGuard)
  lock(@Req() req: AuthenticatedRequest, @Body() dto: LockTokensDto) {
    return this.tokenomics.lock(req.user.sub, dto);
  }

  @Post('tokens/unlock')
  @UseGuards(JwtAuthGuard)
  unlock(@Req() req: AuthenticatedRequest, @Body() dto: UnlockTokensDto) {
    return this.tokenomics.unlock(req.user.sub, dto);
  }

  @Post('admin/tokens/burn')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  burn(@Body() dto: BurnTokensDto) {
    return this.tokenomics.burn(dto.accountCode, dto);
  }

  @Post('admin/tokenomics/pause')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  pause() {
    return this.tokenomics.setMintingPaused(true);
  }

  @Post('admin/tokenomics/resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resume() {
    return this.tokenomics.setMintingPaused(false);
  }
}

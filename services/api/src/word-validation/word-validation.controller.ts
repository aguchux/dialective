import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubmissionDailyLimitGuard } from '../common/guards/submission-daily-limit.guard';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';
import { WordValidationService } from './word-validation.service';
import { SubmitWordValidationDto } from './dto/submit-word-validation.dto';
import { ResolveMisplacedDialectDto } from './dto/resolve-misplaced-dialect.dto';

@Controller('word-validation')
@UseGuards(JwtAuthGuard)
export class WordValidationController {
  constructor(private readonly wordValidation: WordValidationService) {}

  @Get('sessions/:sessionId/next')
  nextItem(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.wordValidation.nextItem(req.user.sub, sessionId);
  }

  @Post('submit')
  @UseGuards(SubmissionRateLimitGuard, SubmissionDailyLimitGuard)
  @Throttle({ default: { limit: 300, ttl: 60 * 60 * 1000 } })
  submit(@Req() req: AuthenticatedRequest, @Body() body: SubmitWordValidationDto) {
    return this.wordValidation.submit(req.user.sub, body);
  }

  // --- Admin: misplaced-dialect queue --------------------------------------

  @Get('admin/misplaced-dialects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listMisplacedDialects(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.wordValidation.listMisplacedDialectRecordings(Number(page), Number(pageSize));
  }

  @Post('admin/misplaced-dialects/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resolveMisplacedDialect(@Param('id') id: string, @Body() body: ResolveMisplacedDialectDto) {
    return this.wordValidation.resolveMisplacedDialectRecording(id, body);
  }
}

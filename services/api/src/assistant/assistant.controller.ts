import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { AssistantService } from './assistant.service';
import { ChatAssistantDto } from './dto/chat-assistant.dto';
import {
  OptionalJwtAuthGuard,
  OptionallyAuthenticatedRequest,
} from '../auth/strategies/optional-jwt-auth.guard';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @UseGuards(OptionalJwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  chat(@Req() req: OptionallyAuthenticatedRequest, @Body() body: ChatAssistantDto) {
    return this.assistant.reply(req.user?.sub, body.message, body.history ?? [], req.ip);
  }

  @Get('thread')
  @UseGuards(OptionalJwtAuthGuard, UserThrottlerGuard)
  thread(@Req() req: OptionallyAuthenticatedRequest) {
    return this.assistant.getThread(req.user?.sub);
  }
}

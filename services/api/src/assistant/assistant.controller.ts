import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@dialectiva/db';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { AssistantService } from './assistant.service';
import { ChatAssistantDto } from './dto/chat-assistant.dto';
import { ListAdminConversationsDto } from './dto/list-admin-conversations.dto';
import { CreateGithubIssueDto } from './dto/create-github-issue.dto';
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

  @Get('admin/conversations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listAdminConversations(@Query() query: ListAdminConversationsDto) {
    return this.assistant.listAdminConversations(query);
  }

  @Get('admin/conversations/:conversationId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getAdminConversation(@Param('conversationId') conversationId: string) {
    return this.assistant.getAdminConversation(conversationId);
  }

  @Post('admin/messages/:messageId/github-issue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  createGithubIssue(@Param('messageId') messageId: string, @Body() body: CreateGithubIssueDto) {
    return this.assistant.createGithubIssue(messageId, body);
  }
}

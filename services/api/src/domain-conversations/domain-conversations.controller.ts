import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';
import { SetDisabledDto } from '../words/dto/set-disabled.dto';
import { DomainConversationsService } from './domain-conversations.service';
import { CreateDomainConversationUploadUrlDto } from './dto/create-domain-conversation-upload-url.dto';
import { CreateDomainConversationRecordingDto } from './dto/create-domain-conversation-recording.dto';
import { ListDomainConversationSubmissionsDto } from './dto/list-domain-conversation-submissions.dto';
import { ListDomainPromptsAdminDto } from './dto/list-domain-prompts-admin.dto';
import { CreateDomainPromptAdminDto } from './dto/create-domain-prompt-admin.dto';
import { UpdateDomainPromptAdminDto } from './dto/update-domain-prompt-admin.dto';

@Controller('domain-conversations')
@UseGuards(JwtAuthGuard)
export class DomainConversationsController {
  constructor(private readonly domainConversations: DomainConversationsService) {}

  @Get('mine')
  listMine(@Req() req: AuthenticatedRequest, @Query() query: ListDomainConversationSubmissionsDto) {
    return this.domainConversations.listMine(req.user.sub, query);
  }

  @Get('sessions/:sessionId/next')
  nextPrompt(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.domainConversations.nextPrompt(req.user.sub, sessionId);
  }

  @Post('recordings/upload-url')
  createUploadUrl(@Req() req: AuthenticatedRequest, @Body() body: CreateDomainConversationUploadUrlDto) {
    return this.domainConversations.createUploadUrl(req.user.sub, body);
  }

  @Post('recordings')
  @UseGuards(SubmissionRateLimitGuard)
  @Throttle({ default: { limit: 120, ttl: 60 * 60 * 1000 } })
  createRecording(@Req() req: AuthenticatedRequest, @Body() body: CreateDomainConversationRecordingDto) {
    return this.domainConversations.createRecording(req.user.sub, body);
  }

  // --- Admin: prompt pool management ---------------------------------------

  @Get('admin/prompts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listPromptsForAdmin(@Query() query: ListDomainPromptsAdminDto) {
    return this.domainConversations.listPromptsForAdmin(query);
  }

  @Get('admin/prompts/domains')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listDistinctDomains() {
    return this.domainConversations.listDistinctDomains();
  }

  @Post('admin/prompts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  createPrompt(@Body() dto: CreateDomainPromptAdminDto) {
    return this.domainConversations.createPrompt(dto);
  }

  @Patch('admin/prompts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updatePrompt(@Param('id') id: string, @Body() dto: UpdateDomainPromptAdminDto) {
    return this.domainConversations.updatePrompt(id, dto);
  }

  @Patch('admin/prompts/:id/disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  setPromptDisabled(@Param('id') id: string, @Body() dto: SetDisabledDto) {
    return this.domainConversations.setPromptDisabled(id, dto.disabled);
  }

  @Delete('admin/prompts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  deletePrompt(@Param('id') id: string) {
    return this.domainConversations.deletePrompt(id);
  }
}

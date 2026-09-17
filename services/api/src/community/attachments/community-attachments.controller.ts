import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CreateCommunityAttachmentUploadUrlDto } from '../dto/create-community-attachment-upload-url.dto';
import { CommunityAttachmentsService } from './community-attachments.service';

@Controller('community/attachments')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
export class CommunityAttachmentsController {
  constructor(private readonly attachments: CommunityAttachmentsService) {}

  @Post('upload-url')
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  createUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCommunityAttachmentUploadUrlDto,
  ) {
    return this.attachments.createUploadUrl(req.user.sub, dto);
  }
}

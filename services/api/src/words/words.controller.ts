import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateWordRecordingDto } from './dto/create-word-recording.dto';
import { CreateWordRecordingUploadUrlDto } from './dto/create-word-recording-upload-url.dto';
import { StartTrainingSessionDto } from './dto/start-training-session.dto';
import { WordsService } from './words.service';

@Controller('words')
@UseGuards(JwtAuthGuard)
export class WordsController {
  constructor(private readonly words: WordsService) {}

  @Post('sessions')
  startSession(@Req() req: AuthenticatedRequest, @Body() _body: StartTrainingSessionDto) {
    return this.words.startSession(req.user.sub);
  }

  @Post('sessions/:sessionId/end')
  endSession(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.words.endSession(req.user.sub, sessionId);
  }

  @Get('sessions/:sessionId/next')
  nextAssignment(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.words.nextAssignment(req.user.sub, sessionId);
  }

  @Post('recordings/upload-url')
  createUploadUrl(@Req() req: AuthenticatedRequest, @Body() body: CreateWordRecordingUploadUrlDto) {
    return this.words.createUploadUrl(req.user.sub, body);
  }

  @Post('recordings')
  createRecording(@Req() req: AuthenticatedRequest, @Body() body: CreateWordRecordingDto) {
    return this.words.createRecording(req.user.sub, body);
  }
}

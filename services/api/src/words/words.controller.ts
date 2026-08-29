import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma, Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ListSubmissionsDto } from '../submissions/dto/list-submissions.dto';
import { CreateWordRecordingDto } from './dto/create-word-recording.dto';
import { CreateWordRecordingUploadUrlDto } from './dto/create-word-recording-upload-url.dto';
import { GetSpellingSuggestionsDto } from './dto/get-spelling-suggestions.dto';
import { ListWordsAdminDto } from './dto/list-words-admin.dto';
import { StartTrainingSessionDto } from './dto/start-training-session.dto';
import { WordsService } from './words.service';

@Controller('words')
@UseGuards(JwtAuthGuard)
export class WordsController {
  constructor(
    private readonly words: WordsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('mine')
  listMine(@Req() req: AuthenticatedRequest, @Query() query: ListSubmissionsDto) {
    return this.words.listMine(req.user.sub, query);
  }

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
  @UseGuards(SubmissionRateLimitGuard)
  // Same admin-tunable limit as SubmissionsController.create -- see
  // SubmissionRateLimitGuard. This decorator's limit is only the
  // pre-DI-resolution fallback @nestjs/throttler needs at bootstrap.
  @Throttle({ default: { limit: 120, ttl: 60 * 60 * 1000 } })
  createRecording(@Req() req: AuthenticatedRequest, @Body() body: CreateWordRecordingDto) {
    return this.words.createRecording(req.user.sub, body);
  }

  @Get('spelling-suggestions')
  getSpellingSuggestions(@Query() query: GetSpellingSuggestionsDto) {
    return this.words.getSpellingSuggestions(query);
  }

  // --- Admin: generated word bank -----------------------------------------
  // Read/curate the Word table -- word-generator-job is the primary writer
  // now (see prisma/seed.ts, whose WORDS array is bootstrap-only going
  // forward), admins review/delete from here.

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listWordsForAdmin(@Query() query: ListWordsAdminDto) {
    const { page, pageSize, search, partOfSpeech } = query;
    const where = {
      ...(search ? { text: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(partOfSpeech ? { partOfSpeech } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.word.findMany({
        where,
        include: { translations: { orderBy: { dialectTag: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.word.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteWord(@Param('id') id: string) {
    try {
      await this.prisma.word.delete({ where: { id } });
      return { id, deleted: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundException('Word not found');
        if (err.code === 'P2003')
          throw new UnprocessableEntityException(
            'Word still has recordings or assignments referencing it',
          );
      }
      throw err;
    }
  }
}

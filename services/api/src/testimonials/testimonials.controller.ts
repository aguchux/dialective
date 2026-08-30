import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { CreateTestimonyUploadUrlDto } from './dto/create-testimony-upload-url.dto';
import { TestimonialsService } from './testimonials.service';

@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  getMine(@Req() req: AuthenticatedRequest) {
    return this.testimonials.getMine(req.user.sub);
  }

  @Post('upload-url')
  @UseGuards(JwtAuthGuard)
  createUploadUrl(@Req() req: AuthenticatedRequest, @Body() dto: CreateTestimonyUploadUrlDto) {
    return this.testimonials.createUploadUrl(req.user.sub, dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  submit(@Req() req: AuthenticatedRequest, @Body() dto: CreateTestimonyDto) {
    return this.testimonials.submit(req.user.sub, dto);
  }

  /**
   * Unauthenticated, powers the homepage carousel (LandingPage.tsx fetches
   * this server-side). No `id` param needed by the caller -- returns every
   * APPROVED testimony; the response is small (one row per trainer, ever,
   * per the one-testimony-per-trainer submission rule) so no pagination.
   */
  @Get('public')
  getPublic() {
    return this.testimonials.getPublic();
  }
}

import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { CreateTestimonyUploadUrlDto } from './dto/create-testimony-upload-url.dto';
import { ListPublicTestimoniesDto } from './dto/list-public-testimonies.dto';
import { TestimonialsService } from './testimonials.service';

@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: AuthenticatedRequest) {
    return this.testimonials.listMine(req.user.sub);
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

  // Ownership and the PENDING-only rule are both enforced in the service, not
  // here -- the id comes straight from the URL, so the guard alone would only
  // prove the caller is logged in, not that the testimony is theirs.
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteMine(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.testimonials.deleteMine(req.user.sub, id);
  }

  /**
   * Unauthenticated, powers the homepage carousel (LandingPage.tsx fetches
   * this server-side). No `id` param needed by the caller -- returns every
   * APPROVED, visible testimony. The landing page passes its admin-configured
   * limit; the public archive uses ordinary pagination.
   */
  @Get('public')
  getPublic(@Query() query: ListPublicTestimoniesDto) {
    return this.testimonials.getPublic(query);
  }
}

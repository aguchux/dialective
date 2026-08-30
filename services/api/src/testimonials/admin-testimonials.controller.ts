import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListTestimoniesAdminDto } from './dto/list-testimonies-admin.dto';
import { ReviewTestimonyDto } from './dto/review-testimony.dto';
import { UpdateTestimonyVisibilityDto } from './dto/update-testimony-visibility.dto';
import { TestimonialsService } from './testimonials.service';

@Controller('admin/testimonials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get()
  list(@Query() query: ListTestimoniesAdminDto) {
    return this.testimonials.listForAdmin(query);
  }

  @Patch(':id')
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReviewTestimonyDto,
  ) {
    return this.testimonials.review(req.user.sub, id, dto);
  }

  @Patch(':id/visibility')
  setVisibility(@Param('id') id: string, @Body() dto: UpdateTestimonyVisibilityDto) {
    return this.testimonials.setVisibility(id, dto);
  }
}

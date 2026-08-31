import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessTokenClaims } from '../auth/jwt.util';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqsService } from './faqs.service';

@Controller('faqs')
export class FaqsPublicController {
  constructor(private readonly faqs: FaqsService) {}

  @Get()
  list() {
    return this.faqs.listPublic();
  }
}

@Controller('admin/faqs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class FaqsAdminController {
  constructor(private readonly faqs: FaqsService) {}

  @Get()
  list() {
    return this.faqs.listAdmin();
  }

  @Post()
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: CreateFaqDto) {
    return this.faqs.create(user.sub, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.faqs.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.faqs.remove(id);
  }
}

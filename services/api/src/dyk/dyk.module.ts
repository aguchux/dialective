import { Body, Controller, Delete, Get, Module, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StorageModule } from '../storage/storage.module';
import { DykService } from './dyk.service';
import { DykImpressionDto, DykNoticeDto, DykSettingsDto, DykUploadDto, DykVisitDto } from './dyk.dto';

@Controller('admin/dyk')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminDykController {
  constructor(private readonly service: DykService) {}
  @Get('settings') settings() { return this.service.settings(); }
  @Put('settings') saveSettings(@Body() dto: DykSettingsDto) { return this.service.saveSettings(dto); }
  @Get() list() { return this.service.listAdmin(); }
  @Post('upload-url') upload(@Body() dto: DykUploadDto) { return this.service.upload(dto.contentType); }
  @Post() create(@Body() dto: DykNoticeDto) { return this.service.saveNotice(dto); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: DykNoticeDto) { return this.service.saveNotice(dto, id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.deleteNotice(id); }
}

@Controller('dyk')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TRAINER, Role.DISTRIBUTOR)
export class DykController {
  constructor(private readonly service: DykService) {}
  @Get() feed(@Req() req: AuthenticatedRequest) { return this.service.feed(req.user.sub); }
  @Post(':id/impression') impression(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: DykImpressionDto) { return this.service.impression(req.user.sub, id, dto.navigation); }
  @Post(':id/click') click(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.service.click(req.user.sub, id); }
  // Called by the frontend once an internal-route destination has actually
  // loaded, to confirm a VISITED stop condition (see DykService.visit).
  @Post(':id/visit') visit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: DykVisitDto) { return this.service.visit(req.user.sub, id, dto.href); }
}

@Module({ imports: [StorageModule], controllers: [AdminDykController, DykController], providers: [DykService] })
export class DykModule {}

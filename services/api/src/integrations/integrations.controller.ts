import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IntegrationsService } from './integrations.service';
import { ListIntegrationsDto, UpdateIntegrationDto } from './dto/integrations.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListIntegrationsDto) {
    return this.integrations.list(req.user.sub, query);
  }

  @Get('mine')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.integrations.listMine(req.user.sub);
  }

  @Post(':id/subscribe')
  subscribe(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.subscribe(req.user.sub, id);
  }

  @Delete(':id/subscribe')
  unsubscribe(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.unsubscribe(req.user.sub, id);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminList() {
    return this.integrations.listAllForAdmin();
  }

  /**
   * Gates an integration that already exists (created via
   * INTEGRATION_REGISTRY + IntegrationsService.syncRegistry, not this
   * endpoint) -- enabled/feeTokenAmount/sortOrder only, see
   * UpdateIntegrationDto. There is deliberately no create endpoint: an
   * integration is a real implemented feature, not an admin-typed catalog
   * row.
   */
  @Patch('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminUpdate(@Param('id') id: string, @Body() body: UpdateIntegrationDto) {
    return this.integrations.update(id, body);
  }
}

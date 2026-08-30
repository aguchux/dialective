import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SubscriptionPlansService } from './subscription-plans.service';
import { UpsertSubscriptionPlanDto } from './dto/upsert-subscription-plan.dto';

/** Admin Settings -> "Stripe & Subscriptions" tab. Trainer-side admin auth (JwtAuthGuard/Role.ADMIN) -- distinct from the subscriber-facing guards used elsewhere in voice-stream/billing. */
@Controller('admin/voice-stream/subscription-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SubscriptionPlansController {
  constructor(private readonly plans: SubscriptionPlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Put(':key')
  upsert(@Param('key') key: string, @Body() dto: UpsertSubscriptionPlanDto) {
    return this.plans.upsert({ ...dto, key });
  }

  @Delete(':key')
  async remove(@Param('key') key: string) {
    await this.plans.remove(key);
    return { removed: true };
  }
}

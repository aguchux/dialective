import { Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RabbitMqService } from './rabbitmq.service';

/**
 * Admin-only diagnostic for confirming RabbitMQ connectivity end-to-end.
 * Not a real workload -- see RabbitMqService's doc comment for why this
 * broker is otherwise idle by design.
 */
@Controller('admin/rabbitmq')
export class RabbitMqController {
  constructor(private readonly rabbitmq: RabbitMqService) {}

  @Post('smoke-test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  runSmokeTest() {
    return this.rabbitmq.smokeTest();
  }
}

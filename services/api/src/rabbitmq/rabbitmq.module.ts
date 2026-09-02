import { Module } from '@nestjs/common';
import { RabbitMqService } from './rabbitmq.service';
import { RabbitMqController } from './rabbitmq.controller';

@Module({
  controllers: [RabbitMqController],
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class RabbitMqModule {}

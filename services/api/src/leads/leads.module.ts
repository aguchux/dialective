import { Module } from '@nestjs/common';
import { SubscriberAuthModule } from '../voice-stream/subscriber-auth/subscriber-auth.module';
import { LeadsController } from './leads.controller';

@Module({
  imports: [SubscriberAuthModule],
  controllers: [LeadsController],
})
export class LeadsModule {}

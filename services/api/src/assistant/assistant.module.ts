import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { OptionalJwtAuthGuard } from '../auth/strategies/optional-jwt-auth.guard';

@Module({
  imports: [LlmModule],
  controllers: [AssistantController],
  providers: [AssistantService, OptionalJwtAuthGuard],
})
export class AssistantModule {}

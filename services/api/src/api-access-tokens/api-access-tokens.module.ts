import { Module } from '@nestjs/common';
import { ApiAccessTokensController } from './api-access-tokens.controller';
import { ApiAccessTokensService } from './api-access-tokens.service';

@Module({
  controllers: [ApiAccessTokensController],
  providers: [ApiAccessTokensService],
  exports: [ApiAccessTokensService],
})
export class ApiAccessTokensModule {}

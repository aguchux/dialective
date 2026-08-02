import { Global, Module } from '@nestjs/common';
import { AsrRegistryService } from './asr-registry.service';

@Global()
@Module({
  providers: [AsrRegistryService],
  exports: [AsrRegistryService],
})
export class AsrRegistryModule {}

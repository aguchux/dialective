import { Module } from '@nestjs/common';
import { DomainPromptGeneratorService } from './domain-prompt-generator.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DomainPromptGeneratorService],
})
export class AppModule {}

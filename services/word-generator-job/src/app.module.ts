import { Module } from '@nestjs/common';
import { WordGeneratorService } from './word-generator.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [WordGeneratorService],
})
export class AppModule {}

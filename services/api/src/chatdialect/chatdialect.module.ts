import { Module } from '@nestjs/common';
import { ChatDialectController } from './chatdialect.controller';

@Module({
  controllers: [ChatDialectController],
})
export class ChatDialectModule {}

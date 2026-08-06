import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { RedisStreamsModule } from "./redis-streams/redis-streams.module";
import { AsrRegistryModule } from "./asr-registry/asr-registry.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { PromptsModule } from "./prompts/prompts.module";
import { WordsModule } from "./words/words.module";
import { WalletModule } from "./wallet/wallet.module";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [PrismaModule, RedisStreamsModule, AsrRegistryModule, SubmissionsModule, PromptsModule, WordsModule, WalletModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}

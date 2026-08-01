import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { RedisStreamsModule } from "./redis-streams/redis-streams.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [PrismaModule, RedisStreamsModule, SubmissionsModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}

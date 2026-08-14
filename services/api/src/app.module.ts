import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health/health.controller";
import { RedisStreamsModule } from "./redis-streams/redis-streams.module";
import { AsrRegistryModule } from "./asr-registry/asr-registry.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { PromptsModule } from "./prompts/prompts.module";
import { WordsModule } from "./words/words.module";
import { WalletModule } from "./wallet/wallet.module";
import { GeoModule } from "./geo/geo.module";
import { LeadsModule } from "./leads/leads.module";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { SettingsModule } from "./settings/settings.module";
import { BlogModule } from "./blog/blog.module";
import { CoursesModule } from "./courses/courses.module";
import { PoolsModule } from "./pools/pools.module";
import { P2PModule } from "./p2p/p2p.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    RedisStreamsModule,
    AsrRegistryModule,
    SubmissionsModule,
    PromptsModule,
    WordsModule,
    WalletModule,
    GeoModule,
    LeadsModule,
    AuthModule,
    SettingsModule,
    BlogModule,
    CoursesModule,
    PoolsModule,
    P2PModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}

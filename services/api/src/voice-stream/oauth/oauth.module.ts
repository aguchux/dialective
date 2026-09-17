import { Module } from '@nestjs/common';
import { OrgActivityModule } from '../org-activity/org-activity.module';
import { StreamKeyAuthGuard } from '../stream-api/stream-key-auth.guard';
import { OAuthClientsController } from './oauth-clients.controller';
import { OAuthClientsService } from './oauth-clients.service';
import { OAuthTokenController } from './oauth-token.controller';
import { OAuthJwtAuthGuard } from './oauth-jwt-auth.guard';
import { EitherStreamCredentialGuard } from './either-stream-credential.guard';

/**
 * StreamKeyAuthGuard is provided here too (not imported from
 * StreamApiModule) to avoid a circular module dependency --
 * EitherStreamCredentialGuard needs both auth guards, and StreamApiModule
 * needs EitherStreamCredentialGuard. StreamKeyAuthGuard only depends on the
 * @Global() PrismaService, so a second instance here is cheap and stateless.
 */
@Module({
  imports: [OrgActivityModule],
  controllers: [OAuthClientsController, OAuthTokenController],
  providers: [
    OAuthClientsService,
    StreamKeyAuthGuard,
    OAuthJwtAuthGuard,
    EitherStreamCredentialGuard,
  ],
  exports: [EitherStreamCredentialGuard],
})
export class OAuthModule {}

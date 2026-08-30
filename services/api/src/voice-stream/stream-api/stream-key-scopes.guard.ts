import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StreamKeyScope } from '@dialectiva/db';
import { STREAM_KEY_SCOPES_KEY } from './require-scopes.decorator';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

/** Mirrors SubscriberRolesGuard's reflector-metadata pattern -- pair @RequireScopes(...) with @UseGuards(StreamKeyAuthGuard, StreamKeyScopesGuard) in that order. */
@Injectable()
export class StreamKeyScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<StreamKeyScope[] | undefined>(
      STREAM_KEY_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const hasAllScopes = requiredScopes.every((scope) => request.streamKey.scopes.includes(scope));
    if (!hasAllScopes) {
      throw new ForbiddenException('This Stream Key does not have the required scope');
    }
    return true;
  }
}

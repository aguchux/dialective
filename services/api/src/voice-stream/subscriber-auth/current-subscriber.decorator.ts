import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedSubscriberRequest } from './subscriber-auth.guard';

export const CurrentSubscriber = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedSubscriberRequest>();
  return request.user;
});

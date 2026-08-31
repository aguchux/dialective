import { ExecutionContext } from '@nestjs/common';
import { EitherStreamCredentialGuard } from './either-stream-credential.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function setup() {
  const streamKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) };
  const oauthGuard = { canActivate: jest.fn().mockReturnValue(true) };
  const guard = new EitherStreamCredentialGuard(streamKeyGuard as never, oauthGuard as never);
  return { guard, streamKeyGuard, oauthGuard };
}

describe('EitherStreamCredentialGuard', () => {
  it('dispatches to OAuthJwtAuthGuard for a JWT-shaped bearer token (3 dot-separated segments)', async () => {
    const { guard, streamKeyGuard, oauthGuard } = setup();

    await guard.canActivate(contextWith({ authorization: 'Bearer aaa.bbb.ccc' }));

    expect(oauthGuard.canActivate).toHaveBeenCalled();
    expect(streamKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('dispatches to StreamKeyAuthGuard for an opaque (non-JWT-shaped) bearer token', async () => {
    const { guard, streamKeyGuard, oauthGuard } = setup();

    await guard.canActivate(contextWith({ authorization: 'Bearer dlsk_live_abcdefgh12345678' }));

    expect(streamKeyGuard.canActivate).toHaveBeenCalled();
    expect(oauthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('dispatches to StreamKeyAuthGuard when there is no Authorization header (lets it produce the missing-token error)', async () => {
    const { guard, streamKeyGuard, oauthGuard } = setup();

    await guard.canActivate(contextWith({}));

    expect(streamKeyGuard.canActivate).toHaveBeenCalled();
    expect(oauthGuard.canActivate).not.toHaveBeenCalled();
  });
});

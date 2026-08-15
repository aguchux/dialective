import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthMaintenanceException } from '../auth-maintenance.exception';
import { signAccessToken } from '../jwt.util';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret';

function contextFor(token: string | null): ExecutionContext {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function tokenFor(role: Role) {
  return signAccessToken({ sub: 'user-1', email: 'a@b.com', role });
}

function setup(status: {
  enabled: boolean;
  until?: Date;
  message?: string | null;
  blockSessions?: boolean;
  excludeAdmin?: boolean;
  excludePartner?: boolean;
}) {
  const platformSettings = {
    getAuthMaintenanceStatus: jest.fn().mockResolvedValue({
      enabled: status.enabled,
      until: status.enabled ? status.until ?? new Date(Date.now() + 60_000) : null,
      message: status.message ?? null,
      blockLogin: false,
      blockSignup: false,
      blockSessions: status.blockSessions ?? false,
      excludeAdmin: status.excludeAdmin ?? true,
      excludePartner: status.excludePartner ?? false,
    }),
  };
  const guard = new JwtAuthGuard(platformSettings as never);
  return { guard };
}

describe('JwtAuthGuard', () => {
  it('rejects a request with no bearer token', async () => {
    const { guard } = setup({ enabled: false });
    await expect(guard.canActivate(contextFor(null))).rejects.toThrow(UnauthorizedException);
  });

  it('allows a valid token through when maintenance is disabled', async () => {
    const { guard } = setup({ enabled: false });
    await expect(guard.canActivate(contextFor(tokenFor(Role.TRAINER)))).resolves.toBe(true);
  });

  it('allows a valid token through when maintenance is enabled but blockSessions is off', async () => {
    const { guard } = setup({ enabled: true, blockSessions: false });
    await expect(guard.canActivate(contextFor(tokenFor(Role.TRAINER)))).resolves.toBe(true);
  });

  it('rejects a TRAINER session with AuthMaintenanceException when blockSessions is on', async () => {
    const { guard } = setup({ enabled: true, blockSessions: true });
    await expect(guard.canActivate(contextFor(tokenFor(Role.TRAINER)))).rejects.toThrow(AuthMaintenanceException);
  });

  it('exempts ADMIN sessions by default when blockSessions is on', async () => {
    const { guard } = setup({ enabled: true, blockSessions: true, excludeAdmin: true });
    await expect(guard.canActivate(contextFor(tokenFor(Role.ADMIN)))).resolves.toBe(true);
  });

  it('still blocks ADMIN sessions when excludeAdmin is off', async () => {
    const { guard } = setup({ enabled: true, blockSessions: true, excludeAdmin: false });
    await expect(guard.canActivate(contextFor(tokenFor(Role.ADMIN)))).rejects.toThrow(AuthMaintenanceException);
  });

  it('blocks PARTNER sessions by default (excludePartner defaults false)', async () => {
    const { guard } = setup({ enabled: true, blockSessions: true, excludePartner: false });
    await expect(guard.canActivate(contextFor(tokenFor(Role.PARTNER)))).rejects.toThrow(AuthMaintenanceException);
  });

  it('exempts PARTNER sessions when excludePartner is on', async () => {
    const { guard } = setup({ enabled: true, blockSessions: true, excludePartner: true });
    await expect(guard.canActivate(contextFor(tokenFor(Role.PARTNER)))).resolves.toBe(true);
  });
});

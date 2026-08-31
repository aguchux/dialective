import { ExecutionContext } from '@nestjs/common';
import { TierGateGuard, TierGatedRequest } from './tier-gate.guard';

function setup() {
  const prisma = { subscription: { findUnique: jest.fn() } };
  const guard = new TierGateGuard(prisma as any);
  return { prisma, guard };
}

function contextWith(request: Partial<TierGatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TierGateGuard', () => {
  it('attaches the plan minIsvcConfidence and always allows the request through', async () => {
    const { prisma, guard } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { minIsvcConfidence: 'HIGH' } });
    const request: Partial<TierGatedRequest> = { user: { organizationId: 'org-1' } as any };

    const result = await guard.canActivate(contextWith(request));

    expect(result).toBe(true);
    expect(request.planMinConfidence).toBe('HIGH');
  });

  it('leaves planMinConfidence undefined for a Standard plan (null floor)', async () => {
    const { prisma, guard } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ plan: { minIsvcConfidence: null } });
    const request: Partial<TierGatedRequest> = { user: { organizationId: 'org-1' } as any };

    await guard.canActivate(contextWith(request));

    expect(request.planMinConfidence).toBeUndefined();
  });

  it('leaves planMinConfidence undefined when there is no subscription at all', async () => {
    const { prisma, guard } = setup();
    prisma.subscription.findUnique.mockResolvedValue(null);
    const request: Partial<TierGatedRequest> = { user: { organizationId: 'org-1' } as any };

    const result = await guard.canActivate(contextWith(request));

    expect(result).toBe(true);
    expect(request.planMinConfidence).toBeUndefined();
  });
});

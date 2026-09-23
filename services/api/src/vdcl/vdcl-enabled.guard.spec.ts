import { ForbiddenException } from '@nestjs/common';
import { VdclEnabledGuard } from './vdcl-enabled.guard';

/**
 * The gate that keeps contributor licensing closed until publication.
 *
 * The standing constraint is that nothing may be issued to a real
 * contributor before legal review lands, so the cases that matter here are
 * the refusals -- an accidentally-open gate is the failure this guards
 * against, not an accidentally-closed one.
 */
describe('VdclEnabledGuard', () => {
  function guardWith(enabled: boolean) {
    const isVdclEnabled = jest.fn().mockResolvedValue(enabled);
    return {
      guard: new VdclEnabledGuard({ isVdclEnabled } as never),
      isVdclEnabled,
    };
  }

  it('lets contributors through when licensing is open', async () => {
    const { guard } = guardWith(true);
    await expect(guard.canActivate()).resolves.toBe(true);
  });

  it('refuses every contributor route while licensing is closed', async () => {
    const { guard } = guardWith(false);
    await expect(guard.canActivate()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('explains itself rather than looking like a bug', async () => {
    // A contributor hitting this should understand it is a setting, not a
    // failure -- otherwise it generates support load during the exact window
    // we are trying to keep quiet.
    const { guard } = guardWith(false);
    await expect(guard.canActivate()).rejects.toThrow(/not open yet/i);
  });

  it('asks the settings service on every call', async () => {
    // No memoisation in the guard: the freshness guarantee lives in
    // isVdclEnabled, and a guard-level cache would silently defeat it.
    const { guard, isVdclEnabled } = guardWith(true);

    await guard.canActivate();
    await guard.canActivate();

    expect(isVdclEnabled).toHaveBeenCalledTimes(2);
  });
});

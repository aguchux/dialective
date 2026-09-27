import { VdclVersionStatus } from '@dialectiva/db';
import { isEconomyEnabledForUser } from './training-economy.util';

function setup(overrides: {
  economy?: boolean;
  suppression?: boolean;
  agreement?: unknown;
} = {}) {
  const settings = {
    isTrainingEconomyEnabled: jest.fn().mockResolvedValue(overrides.economy ?? true),
    isVdclPayoutSuppressionEnabled: jest
      .fn()
      .mockResolvedValue(overrides.suppression ?? false),
  };
  const prisma = {
    vdclAgreement: {
      findUnique: jest.fn().mockResolvedValue(overrides.agreement ?? null),
    },
  };
  return { settings, prisma };
}

const ACTIVE = { withdrawnAt: null, activeVersion: { status: VdclVersionStatus.ACTIVE } };

describe('isEconomyEnabledForUser', () => {
  it('is on when both switches allow it', async () => {
    const { settings, prisma } = setup();
    await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(true);
  });

  it('is off platform-wide regardless of licence', async () => {
    const { settings, prisma } = setup({ economy: false, agreement: ACTIVE });
    await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(false);
  });

  it('does not look up a licence when the economy is already off', async () => {
    // Deciding not to charge needs no licence lookup, and the hot recording
    // path should not pay for one.
    const { settings, prisma } = setup({ economy: false });
    await isEconomyEnabledForUser(settings, prisma as never, 'u1');
    expect(prisma.vdclAgreement.findUnique).not.toHaveBeenCalled();
  });

  it('does not look up a licence while suppression is off', async () => {
    // The production default. Every trainer takes this path, so it must not
    // add a query per recording.
    const { settings, prisma } = setup({ suppression: false });
    await isEconomyEnabledForUser(settings, prisma as never, 'u1');
    expect(prisma.vdclAgreement.findUnique).not.toHaveBeenCalled();
  });

  it('turns the economy off for a contributor holding an ACTIVE licence', async () => {
    const { settings, prisma } = setup({ suppression: true, agreement: ACTIVE });
    await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(false);
  });

  it('leaves an unlicensed trainer inside the economy', async () => {
    // The property that makes the switch safe to turn on during partial
    // adoption: it touches only contributors who signed.
    const { settings, prisma } = setup({ suppression: true, agreement: null });
    await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(true);
  });

  it('puts a withdrawn contributor back inside the economy', async () => {
    // They are no longer licensing their voice for revenue share, so token
    // payouts are the only compensation left.
    const { settings, prisma } = setup({
      suppression: true,
      agreement: { withdrawnAt: new Date(), activeVersion: { status: VdclVersionStatus.ACTIVE } },
    });
    await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(true);
  });

  it('ignores a licence that is not ACTIVE', async () => {
    // A suspended or pending-countersignature licence grants nothing, so it
    // must not be treated as compensation either.
    for (const status of [
      VdclVersionStatus.SUSPENDED,
      VdclVersionStatus.PENDING_COUNTERSIGNATURE,
      VdclVersionStatus.WITHDRAWN,
    ]) {
      const { settings, prisma } = setup({
        suppression: true,
        agreement: { withdrawnAt: null, activeVersion: { status } },
      });
      await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(true);
    }
  });

  it('ignores an agreement with no active version', async () => {
    const { settings, prisma } = setup({
      suppression: true,
      agreement: { withdrawnAt: null, activeVersion: null },
    });
    await expect(isEconomyEnabledForUser(settings, prisma as never, 'u1')).resolves.toBe(true);
  });
});

import { VdclVersionStatus } from '@dialectiva/db';

/**
 * Whether a stake should be taken and a payout owed for THIS user's next
 * recording.
 *
 * Two independent switches fold into one answer here, deliberately, so every
 * call site keeps a single `economyEnabled` boolean rather than growing a
 * second branch:
 *
 *  - `trainingEconomyEnabled` is platform-wide. Off means nobody is charged
 *    and nobody is paid.
 *  - `vdclPayoutSuppressionEnabled` is per-contributor. On means trainers who
 *    hold an ACTIVE VDCL stop being charged and paid, because their voice is
 *    compensated through Stream revenue sharing instead. Trainers without a
 *    licence are untouched.
 *
 * Charge and payout are ONE decision and cannot be separated. computeTrainingPayout
 * returns the stake as part of the payout (spent + spent*score*cap), so
 * suppressing the payout alone would leave a contributor paying to record and
 * receiving nothing. This returning a single boolean is what makes that
 * mistake unexpressible.
 *
 * "Active" matches RightsService: an agreement that is not withdrawn, whose
 * activeVersion is ACTIVE. A withdrawn contributor goes back to being charged
 * and paid normally, which is the right default -- they are no longer
 * licensing their voice for revenue share.
 */
export interface EconomyGateSettings {
  isTrainingEconomyEnabled(): Promise<boolean>;
  isVdclPayoutSuppressionEnabled(): Promise<boolean>;
}

export interface EconomyGatePrisma {
  vdclAgreement: {
    findUnique(args: {
      where: { contributorId: string };
      select: { withdrawnAt: true; activeVersion: { select: { status: true } } };
    }): Promise<{
      withdrawnAt: Date | null;
      activeVersion: { status: VdclVersionStatus } | null;
    } | null>;
  };
}

export async function isEconomyEnabledForUser(
  settings: EconomyGateSettings,
  prisma: EconomyGatePrisma,
  userId: string,
): Promise<boolean> {
  const economyEnabled = await settings.isTrainingEconomyEnabled();
  // Platform-wide off already answers the question -- no need to look up a
  // licence to decide not to charge.
  if (!economyEnabled) return false;

  if (!(await settings.isVdclPayoutSuppressionEnabled())) return true;

  const agreement = await prisma.vdclAgreement.findUnique({
    where: { contributorId: userId },
    select: { withdrawnAt: true, activeVersion: { select: { status: true } } },
  });

  const licensed =
    agreement !== null &&
    agreement.withdrawnAt === null &&
    agreement.activeVersion?.status === VdclVersionStatus.ACTIVE;

  // Licensed contributors record outside the token economy; everyone else
  // stays inside it.
  return !licensed;
}

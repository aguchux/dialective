import { Injectable } from '@nestjs/common';
import { KycStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { VdclCompilationService } from '../compilation/vdcl-compilation.service';

/**
 * A readiness requirement the contributor has not met.
 *
 * Each carries what is wrong AND what to do about it. The plan is explicit
 * that an unmet requirement shows a checklist rather than letting someone
 * into an incomplete signing flow -- and a checklist that says "not ready"
 * without saying why is the same dead end with extra steps.
 */
export interface ReadinessBlocker {
  requirement: string;
  detail: string;
  /** Can the contributor fix this themselves, or does it need Dialect Library? */
  actionable: boolean;
}

export interface ReadinessResult {
  ready: boolean;
  blockers: ReadinessBlocker[];
  /** What a licence would cover today. Null when the dialect is unknown. */
  inventory: {
    eligibleCount: number;
    excludedCount: number;
    exclusionsByReason: Record<string, number>;
    totalDurationMs: string;
    transcriptCount: number;
    meanCompositeScore: number | null;
  } | null;
  dialectTag: string | null;
  existingAgreement: {
    id: string;
    licenceKey: string;
    withdrawnAt: Date | null;
    activeVersionId: string | null;
  } | null;
}

/** Below this, a licence is not worth the legal weight of signing one. */
const MIN_ELIGIBLE_RECORDINGS = 1;

/**
 * Stage 1 of the VDCL Maker: can this contributor sign at all?
 *
 * Every check here is a precondition for a document that will be legally
 * binding. The posture is that a contributor should never reach a signature
 * screen they are not entitled to complete -- discovering at the final step
 * that your KYC lapsed is a worse experience than being told up front, and
 * a half-finished signing flow leaves rows behind that mean nothing.
 *
 * KYC is checked live against User.kycStatus rather than trusted from a
 * previous version: identity can lapse, and a licence signed on stale
 * evidence is exactly the thing the DLKYC reference exists to prevent.
 */
@Injectable()
export class VdclReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compilation: VdclCompilationService,
  ) {}

  async check(contributorId: string): Promise<ReadinessResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: contributorId },
      select: {
        id: true,
        emailVerified: true,
        status: true,
        kycStatus: true,
        countryId: true,
        dialect: { select: { tag: true } },
      },
    });

    const blockers: ReadinessBlocker[] = [];
    if (!user) {
      return {
        ready: false,
        blockers: [
          {
            requirement: 'Contributor account',
            detail: 'This account could not be found.',
            actionable: false,
          },
        ],
        inventory: null,
        dialectTag: null,
        existingAgreement: null,
      };
    }

    if (!user.emailVerified) {
      blockers.push({
        requirement: 'Verified account',
        detail: 'Verify your email address before signing a licence.',
        actionable: true,
      });
    }

    if (user.status !== 'ACTIVE') {
      blockers.push({
        requirement: 'Account in good standing',
        detail: `This account is ${user.status}. Contact support before signing a licence.`,
        actionable: false,
      });
    }

    // A VDCL is a legal instrument naming a real person. Signing it against
    // an unverified identity would leave Dialect Library unable to say who
    // granted the rights it is licensing onward.
    if (user.kycStatus !== KycStatus.APPROVED) {
      blockers.push({
        requirement: 'Identity verification (DLKYC)',
        detail:
          user.kycStatus === KycStatus.NOT_STARTED
            ? 'Complete identity verification before signing a licence.'
            : `Identity verification is ${user.kycStatus.toLowerCase().replace(/_/g, ' ')}. It must be approved before signing.`,
        actionable:
          user.kycStatus !== KycStatus.IN_REVIEW && user.kycStatus !== KycStatus.IN_PROGRESS,
      });
    }

    const dialectTag = user.dialect?.tag ?? null;
    if (!dialectTag) {
      blockers.push({
        requirement: 'Active dialect profile',
        detail: 'Set the dialect you record in on your profile before signing a licence.',
        actionable: true,
      });
    }

    const existingAgreement = dialectTag
      ? await this.prisma.vdclAgreement.findUnique({
          where: { contributorId_dialectTag: { contributorId, dialectTag } },
          select: {
            id: true,
            licenceKey: true,
            withdrawnAt: true,
            activeVersionId: true,
          },
        })
      : null;

    if (existingAgreement?.withdrawnAt) {
      // Withdrawal is the contributor's own decision and it is not undone
      // by starting a new draft. Reinstating is a support conversation, so
      // it is not presented as something to click through here.
      blockers.push({
        requirement: 'No withdrawn licence for this dialect',
        detail:
          'You withdrew your licence for this dialect. Contact support if you want to license your recordings again.',
        actionable: false,
      });
    }

    const inventory = dialectTag
      ? await this.compilation.previewInventory({ contributorId, dialectTag })
      : null;

    if (inventory && inventory.eligibleCount < MIN_ELIGIBLE_RECORDINGS) {
      blockers.push({
        requirement: 'Eligible recordings',
        detail:
          inventory.excludedCount > 0
            ? 'None of your recordings are eligible yet. See the breakdown below for why.'
            : 'You have no completed recordings in this dialect yet.',
        actionable: true,
      });
    }

    return {
      ready: blockers.length === 0,
      blockers,
      inventory,
      dialectTag,
      existingAgreement,
    };
  }
}

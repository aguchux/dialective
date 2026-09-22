import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { buildLicenceKey } from './vdcl-keys';

/**
 * Purposes never offered in v1. See dto/compilation.dto.ts for why the enum
 * value exists at all.
 */
const NEVER_OFFERED = new Set<VdclPurpose>([VdclPurpose.VOICE_CLONING]);

/**
 * Creates the agreement and draft version that compilation then fills.
 *
 * Phase 0 shipped the rights check, Phase 2 the compiler -- but nothing
 * created the row they both read. This is that missing piece, kept separate
 * from the compiler because creating an agreement is a decision about a
 * PERSON and compiling one is a computation over their RECORDINGS.
 *
 * An agreement is unique per (contributor, dialect): a contributor working
 * in two dialects signs two licences, because the rights they are willing
 * to grant may differ by dialect and folding them into one document would
 * force a single answer.
 */
@Injectable()
export class VdclDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(params: {
    contributorId: string;
    dialectTag: string;
    countryId?: string;
    purposes: VdclPurpose[];
    wordingVersion: string;
    termsVersion?: string;
  }) {
    const refused = params.purposes.filter((p) => NEVER_OFFERED.has(p));
    if (refused.length > 0) {
      throw new BadRequestException(
        `These purposes are not offered: ${refused.join(', ')}`,
      );
    }
    // Deduplicate before writing -- the grant table is unique on
    // [versionId, purpose], so a repeated purpose would fail the insert with
    // a constraint error rather than a message anyone can act on.
    const purposes = [...new Set(params.purposes)];

    const contributor = await this.prisma.user.findUnique({
      where: { id: params.contributorId },
      select: { id: true, countryId: true },
    });
    if (!contributor) {
      throw new NotFoundException('Contributor not found');
    }

    const countryId = params.countryId ?? contributor.countryId ?? null;
    const country = countryId
      ? await this.prisma.country.findUnique({
          where: { id: countryId },
          select: { code: true },
        })
      : null;

    return this.prisma.$transaction(async (tx) => {
      const agreement = await tx.vdclAgreement.upsert({
        where: {
          contributorId_dialectTag: {
            contributorId: params.contributorId,
            dialectTag: params.dialectTag,
          },
        },
        create: {
          licenceKey: buildLicenceKey({
            countryCode: country?.code,
            dialectTag: params.dialectTag,
            contributorId: params.contributorId,
          }),
          contributorId: params.contributorId,
          dialectTag: params.dialectTag,
          countryId,
        },
        update: {},
      });

      if (agreement.withdrawnAt) {
        throw new BadRequestException(
          'This contributor has withdrawn their licence for this dialect. A new version cannot be drafted against a withdrawn agreement.',
        );
      }

      const open = await tx.vdclVersion.findFirst({
        where: {
          agreementId: agreement.id,
          status: {
            in: [
              VdclVersionStatus.DRAFT,
              VdclVersionStatus.PENDING_COMPILATION,
              VdclVersionStatus.PENDING_REVIEW,
              VdclVersionStatus.PENDING_COUNTERSIGNATURE,
            ],
          },
        },
        select: { id: true, version: true, status: true },
      });
      if (open) {
        // Two in-flight versions of one agreement would mean two different
        // answers to "what does this licence cover" racing to be signed.
        throw new BadRequestException(
          `Version ${open.version} of this agreement is already in flight (${open.status}). Finish or reject it first.`,
        );
      }

      const latest = await tx.vdclVersion.findFirst({
        where: { agreementId: agreement.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const version = await tx.vdclVersion.create({
        data: {
          agreementId: agreement.id,
          version: nextVersion,
          status: VdclVersionStatus.DRAFT,
          termsVersion: params.termsVersion ?? null,
          grants: {
            createMany: {
              data: purposes.map((purpose) => ({
                purpose,
                wordingVersion: params.wordingVersion,
              })),
            },
          },
        },
        include: { grants: true },
      });

      await tx.vdclAuditEvent.create({
        data: {
          agreementId: agreement.id,
          versionId: version.id,
          eventType: 'draft_created',
          detail: `version ${nextVersion} drafted with ${purposes.length} granted purposes`,
          metadata: { purposes, wordingVersion: params.wordingVersion },
        },
      });

      return { agreement, version };
    });
  }
}

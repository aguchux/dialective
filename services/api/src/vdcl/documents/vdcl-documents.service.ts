import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as QRCode from 'qrcode';
import { KycStatus, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { contributorShortId } from '../compilation/vdcl-keys';
import { issueVerificationToken, verificationUrl } from './verification-token.util';
import { VdclDocumentData, renderVdclPdf } from './vdcl-pdf.util';
import { renderVdclCertificatePng } from './vdcl-png.util';

/**
 * Documents share the one Spaces bucket every other feature uses, separated
 * by the `vdcl/` key prefix rather than by bucket. The fallback matches the
 * other buckets' default instead of naming a VDCL-specific bucket that does
 * not exist -- a plausible-looking default that silently fails on first
 * write is worse than an obvious one.
 *
 * Objects are written private; the prefix is not the access control, the
 * lack of a public-read ACL is.
 */
const DOCUMENTS_BUCKET =
  process.env.SPACES_VDCL_DOCUMENTS_BUCKET ?? 'golojan-do-s3-bucket';

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Issues the licence documents: the signed PDF, the PNG certificate, and
 * the QR verification token that both carry.
 *
 * Three rules shape this service:
 *
 * 1. **Documents are issued at countersignature, not before.** A PDF
 *    rendered from an unsigned version would be a licence-shaped object
 *    asserting rights nobody granted -- and PDFs get forwarded.
 *
 * 2. **The document hash is recorded.** `pdfHash`/`pngHash` let a
 *    regenerated document be proven byte-identical to the one originally
 *    issued, which is the only way to answer "is this the document we
 *    sent?" years later.
 *
 * 3. **Access is private.** Documents are stored non-public and served
 *    through short-lived presigned URLs to the contributor and authorised
 *    staff only. A subscriber gets the public verification view, never the
 *    contributor's licence.
 */
@Injectable()
export class VdclDocumentsService {
  private readonly logger = new Logger(VdclDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Render and store both documents for a countersigned version.
   *
   * Idempotent in effect: re-issuing overwrites at the same keys and
   * rewrites the hashes, which is what recovering from a failed render
   * needs. It refuses to run on a version that is not countersigned.
   */
  async issueDocuments(versionId: string) {
    const version = await this.loadForRender(versionId);

    if (!version.countersignedAt) {
      throw new BadRequestException(
        'Documents are issued at countersignature. This version has not been countersigned.',
      );
    }
    if (!version.manifest || !version.manifestHash) {
      throw new BadRequestException('This version has no compiled manifest to document.');
    }

    const { token, nonce } = issueVerificationToken({
      versionId: version.id,
      version: version.version,
      manifestHash: version.manifestHash,
    });
    const url = verificationUrl(token);

    // Error correction level M with a margin: these are printed and
    // photographed, so a QR that only scans from a clean screen is not
    // fit for purpose.
    const qrPng = await QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
    });

    const data = this.toDocumentData(version, url, qrPng);

    const [pdf, png] = await Promise.all([
      renderVdclPdf(data),
      renderVdclCertificatePng({ ...data, contributorName: null }),
    ]);

    const base = `vdcl/${version.agreement.licenceKey}/v${version.version}`;
    const [pdfObject, pngObject] = await Promise.all([
      this.storage.putObject({
        bucket: DOCUMENTS_BUCKET,
        key: `${base}/licence.pdf`,
        body: pdf,
        contentType: 'application/pdf',
      }),
      this.storage.putObject({
        bucket: DOCUMENTS_BUCKET,
        key: `${base}/certificate.png`,
        body: png,
        contentType: 'image/png',
      }),
    ]);

    const pdfHash = sha256(pdf);
    const pngHash = sha256(png);

    await this.prisma.$transaction([
      this.prisma.vdclVersion.update({
        where: { id: version.id },
        data: {
          pdfKey: pdfObject.key,
          pngKey: pngObject.key,
          pdfHash,
          pngHash,
        },
      }),
      this.prisma.vdclAuditEvent.create({
        data: {
          agreementId: version.agreementId,
          versionId: version.id,
          eventType: 'document_issued',
          detail: `licence PDF and certificate issued for version ${version.version}`,
          metadata: { pdfHash, pngHash, verificationNonce: nonce },
        },
      }),
    ]);

    return {
      versionId: version.id,
      pdfKey: pdfObject.key,
      pngKey: pngObject.key,
      pdfHash,
      pngHash,
      verificationUrl: url,
    };
  }

  /**
   * A short-lived download URL for one of the documents.
   *
   * `requesterId` is required and checked against the agreement's
   * contributor unless the caller is staff. Only the contributor and
   * authorised Dialect Library staff may download the full licence; a
   * subscriber wanting provenance gets the public verification view.
   */
  async getDownloadUrl(params: {
    versionId: string;
    kind: 'pdf' | 'png';
    requesterId: string;
    isStaff: boolean;
  }) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: params.versionId },
      select: {
        id: true,
        pdfKey: true,
        pngKey: true,
        pdfHash: true,
        pngHash: true,
        agreement: { select: { contributorId: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    if (!params.isStaff && version.agreement.contributorId !== params.requesterId) {
      // NotFound, not Forbidden -- someone probing ids should not learn
      // that a licence exists under another name.
      throw new NotFoundException('VDCL version not found');
    }

    const key = params.kind === 'pdf' ? version.pdfKey : version.pngKey;
    if (!key) {
      throw new NotFoundException(
        'This document has not been issued yet. Documents are issued once Dialect Library countersigns.',
      );
    }

    const { url, expiresInSeconds } = await this.storage.createPresignedDownloadUrl(
      DOCUMENTS_BUCKET,
      key,
    );

    // Downloads of a licence naming a real person are logged. The plan
    // requires every download to be recorded.
    await this.prisma.vdclAuditEvent
      .create({
        data: {
          versionId: version.id,
          actorId: params.requesterId,
          eventType: 'document_downloaded',
          detail: params.kind,
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to log VDCL document download: ${err instanceof Error ? err.message : err}`,
        );
      });

    return {
      url,
      expiresInSeconds,
      hash: params.kind === 'pdf' ? version.pdfHash : version.pngHash,
    };
  }

  /**
   * The machine-readable manifest, for internal verification.
   *
   * Contributor-and-staff only, same as the documents: it lists recording
   * ids, which are the contributor's own work and are not a subscriber's to
   * enumerate.
   */
  async getJsonManifest(params: {
    versionId: string;
    requesterId: string;
    isStaff: boolean;
  }) {
    const version = await this.loadForRender(params.versionId);
    if (!params.isStaff && version.agreement.contributorId !== params.requesterId) {
      throw new NotFoundException('VDCL version not found');
    }
    if (!version.manifest) {
      throw new NotFoundException('This version has no compiled manifest.');
    }

    const items = await this.prisma.vdclManifestItem.findMany({
      where: { manifestId: version.manifest.id },
      orderBy: { recordingId: 'asc' },
      select: {
        recordingId: true,
        durationMs: true,
        dialectTag: true,
        compositeScore: true,
        score: true,
        hasTranscript: true,
      },
    });

    return {
      licenceKey: version.agreement.licenceKey,
      version: version.version,
      status: version.status,
      manifestKey: version.manifest.manifestKey,
      manifestHash: version.manifestHash,
      pdfHash: version.pdfHash,
      pngHash: version.pngHash,
      dialectTags: version.manifest.dialectTags,
      purposes: version.grants.map((g) => g.purpose),
      signedAt: version.signedAt,
      countersignedAt: version.countersignedAt,
      recordingCount: version.manifest.recordingCount,
      totalDurationMs: version.manifest.totalDurationMs.toString(),
      transcriptCount: version.manifest.transcriptCount,
      excludedCount: version.manifest.excludedCount,
      meanCompositeScore: version.manifest.meanCompositeScore?.toString() ?? null,
      asrPipelineVersion: version.manifest.asrPipelineVersion,
      items: items.map((i) => ({
        ...i,
        compositeScore: i.compositeScore?.toString() ?? null,
        score: i.score?.toString() ?? null,
      })),
    };
  }

  private async loadForRender(versionId: string) {
    const version = await this.prisma.vdclVersion.findUnique({
      where: { id: versionId },
      include: {
        agreement: {
          select: {
            licenceKey: true,
            contributorId: true,
            withdrawnAt: true,
            country: { select: { name: true } },
            contributor: {
              select: {
                firstName: true,
                lastName: true,
                kycStatus: true,
              },
            },
          },
        },
        manifest: true,
        grants: { select: { purpose: true } },
      },
    });
    if (!version) {
      throw new NotFoundException('VDCL version not found');
    }
    return version;
  }

  private toDocumentData(
    version: Awaited<ReturnType<VdclDocumentsService['loadForRender']>>,
    url: string,
    qrPng: Buffer,
  ): VdclDocumentData {
    const contributor = version.agreement.contributor;
    const name = [contributor.firstName, contributor.lastName].filter(Boolean).join(' ');
    return {
      licenceKey: version.agreement.licenceKey,
      version: version.version,
      status: version.agreement.withdrawnAt
        ? VdclVersionStatus.WITHDRAWN
        : version.status,
      manifestKey: version.manifest!.manifestKey,
      manifestHash: version.manifestHash!,
      dialectTags: version.manifest!.dialectTags,
      countryName: version.agreement.country?.name ?? null,
      contributorLabel: `Contributor ${contributorShortId(
        version.agreement.contributorId,
      ).slice(0, 6)}`,
      contributorName: name || null,
      kycVerified: contributor.kycStatus === KycStatus.APPROVED,
      signedAt: version.signedAt,
      countersignedAt: version.countersignedAt,
      termsVersion: version.termsVersion,
      purposes: version.grants.map((g) => g.purpose),
      recordingCount: version.manifest!.recordingCount,
      totalDurationMs: version.manifest!.totalDurationMs.toString(),
      transcriptCount: version.manifest!.transcriptCount,
      excludedCount: version.manifest!.excludedCount,
      meanCompositeScore: version.manifest!.meanCompositeScore?.toString() ?? null,
      asrPipelineVersion: version.manifest!.asrPipelineVersion,
      verificationUrl: url,
      qrPng,
    };
  }
}

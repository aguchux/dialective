import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycEvidenceKind, KycStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { LlmNormalizerService } from '../llm/llm-normalizer.service';
import { LlmProviderKey } from '../llm/llm-provider.interface';
import { DiditDecision } from './didit.service';
import { FaceMatchService } from './face-match.service';
import { signKycHandoffToken, verifyKycHandoffToken } from './self-hosted-kyc-handoff.util';
import {
  BotFindings,
  evaluateSelfHostedKyc,
  KycEvaluationResult,
} from './self-hosted-kyc-decision';

const EVIDENCE_BUCKET = process.env.SPACES_KYC_EVIDENCE_BUCKET ?? 'dialectiva-kyc-evidence';
const EVIDENCE_CONTENT_TYPE = 'image/jpeg';
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

type EvidenceStage = 'document' | 'selfie';

// The DLKYC app captures via canvas.toBlob(..., 'image/jpeg', 0.9). Keep the
// upload contract JPEG-only until KycCaptureEvidence persists a verified MIME
// type and the evaluator has safe conversion support for additional formats.
const CAPTURED_IMAGE_CONTENT_TYPE = 'image/jpeg';

// Only TURN_RIGHT is offered -- TURN_LEFT was dropped after liveness scores
// dropped sharply across real trainers once pose-compliance checking went
// live. Root cause: the DLKYC capture UI never mirrors the preview
// (VerificationFlow.tsx has no scaleX(-1)), so "turn your head to the left"
// against a raw, unmirrored feed reads backwards to anyone used to a
// mirror-like selfie camera -- they turn the visually-intuitive way, fail
// checkPoseCompliance, and get capped at a 40 liveness score despite
// genuinely attempting the challenge. "Turn right" against an unmirrored
// feed doesn't fight the same mirror intuition (the nose visibly swings
// right either way you think about it), so standardizing on it removes the
// single largest source of false pose-compliance failures without weakening
// the liveness check itself.
export type SelfieChallengeType = 'TURN_RIGHT';
const CHALLENGES: { type: SelfieChallengeType; text: string }[] = [
  { type: 'TURN_RIGHT', text: 'Turn your head slightly to the right' },
];

/**
 * Self-hosted DLKYC counterpart to didit.service.ts -- runs entirely
 * in-process (no external hosted-verification API), backed by the standalone
 * kyc.dialectlibrary.com app for capture UI. A KycVerification row with
 * provider="self" is the single source of truth for session state across
 * the whole flow (document/selfie keys land on KycCaptureEvidence rows
 * linked to it), so there is no separate "session" table.
 */
@Injectable()
export class SelfHostedKycService {
  private readonly logger = new Logger(SelfHostedKycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
    private readonly llm: LlmNormalizerService,
    private readonly faceMatch: FaceMatchService,
  ) {}

  /** Called by kyc.service.ts's createVerificationSession for the "self" provider branch. */
  async createSession(
    userId: string,
    callbackUrl: string,
  ): Promise<{ sessionId: string; kycAppUrl: string }> {
    const enabled = await this.settings.isSelfHostedKycEnabled();
    if (!enabled) {
      throw new BadRequestException('Self-hosted identity verification is not enabled');
    }

    const sessionId = randomUUID();
    const verification = await this.prisma.kycVerification.create({
      data: {
        userId,
        provider: 'self',
        providerSessionId: sessionId,
        status: KycStatus.IN_PROGRESS,
      },
    });

    const token = signKycHandoffToken({
      sub: userId,
      verificationId: verification.id,
      callbackUrl,
    });
    const appBase = process.env.KYC_APP_URL ?? 'https://kyc.dialectlibrary.com';
    const kycAppUrl = new URL('/', appBase);
    kycAppUrl.searchParams.set('token', token);

    return { sessionId, kycAppUrl: kycAppUrl.toString() };
  }

  /** Called by the new kyc app immediately on load to exchange the handoff token for session context. */
  async resumeSession(token: string) {
    let claims;
    try {
      claims = verifyKycHandoffToken(token);
    } catch {
      throw new ForbiddenException('This verification link has expired. Please start again.');
    }

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: claims.verificationId },
    });
    if (!verification || verification.userId !== claims.sub) {
      throw new NotFoundException('Verification session not found');
    }
    if (verification.status !== KycStatus.IN_PROGRESS) {
      throw new ConflictException('This verification session is no longer active');
    }

    const documentTypes = await this.settings.getSelfHostedKycDocumentTypes();
    return {
      verificationId: verification.id,
      callbackUrl: claims.callbackUrl,
      documentTypes,
    };
  }

  async getChallenge(verificationId: string, userId: string): Promise<{ challenge: string }> {
    const verification = await this.getOwnedOpenVerification(verificationId, userId);
    const existing = CHALLENGES.find(
      (challenge) => challenge.type === verification.selfieChallengeType,
    );
    if (existing) return { challenge: existing.text };

    const chosen = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    await this.prisma.kycVerification.update({
      where: { id: verification.id },
      data: { selfieChallengeType: chosen.type },
    });
    return { challenge: chosen.text };
  }

  async createEvidenceUploadUrl(
    verificationId: string,
    userId: string,
    contentType: string,
    stage: EvidenceStage,
  ) {
    await this.getOwnedOpenVerification(verificationId, userId);
    if (contentType !== EVIDENCE_CONTENT_TYPE) {
      throw new BadRequestException('Only JPEG identity evidence is supported');
    }
    const key = `${this.evidenceKeyPrefix(userId, verificationId, stage)}${randomUUID()}.jpg`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      EVIDENCE_BUCKET,
      key,
      contentType,
    );
    return { uploadUrl: url, key, bucket: EVIDENCE_BUCKET, expiresInSeconds };
  }

  async submitDocument(
    verificationId: string,
    userId: string,
    body: { documentType: string; frontKey: string; backKey?: string },
  ) {
    const verification = await this.getOwnedOpenVerification(verificationId, userId);
    const allowedTypes = await this.settings.getSelfHostedKycDocumentTypes();
    if (!allowedTypes.includes(body.documentType)) {
      throw new BadRequestException('Unsupported document type');
    }
    const keys = [body.frontKey, ...(body.backKey ? [body.backKey] : [])];
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Document sides must be distinct uploads');
    }
    await this.validateEvidenceKeys(keys, userId, verificationId, 'document');
    const previous = await this.prisma.kycCaptureEvidence.findMany({
      where: {
        kycVerificationId: verification.id,
        kind: { in: [KycEvidenceKind.DOCUMENT_FRONT, KycEvidenceKind.DOCUMENT_BACK] },
      },
      select: { bucket: true, key: true },
    });

    await this.prisma.$transaction(async (tx) => {
      const active = await tx.kycVerification.updateMany({
        where: {
          id: verification.id,
          userId,
          provider: 'self',
          status: KycStatus.IN_PROGRESS,
        },
        data: { documentType: body.documentType },
      });
      if (!active.count) {
        throw new ConflictException('This verification session is no longer active');
      }
      await tx.kycCaptureEvidence.deleteMany({
        where: {
          kycVerificationId: verification.id,
          kind: { in: [KycEvidenceKind.DOCUMENT_FRONT, KycEvidenceKind.DOCUMENT_BACK] },
        },
      });
      await tx.kycCaptureEvidence.create({
        data: {
          kycVerificationId: verification.id,
          kind: KycEvidenceKind.DOCUMENT_FRONT,
          bucket: EVIDENCE_BUCKET,
          key: body.frontKey,
        },
      });
      if (body.backKey) {
        await tx.kycCaptureEvidence.create({
          data: {
            kycVerificationId: verification.id,
            kind: KycEvidenceKind.DOCUMENT_BACK,
            bucket: EVIDENCE_BUCKET,
            key: body.backKey,
          },
        });
      }
    });
    await this.deleteReplacedEvidence(previous, new Set(keys));
    return { ok: true };
  }

  async submitSelfie(
    verificationId: string,
    userId: string,
    body: { frameKeys: string[]; challenge: string },
  ) {
    const verification = await this.getOwnedOpenVerification(verificationId, userId);
    const assignedChallenge = CHALLENGES.find(
      (challenge) => challenge.type === verification.selfieChallengeType,
    );
    if (!assignedChallenge || assignedChallenge.text !== body.challenge) {
      throw new BadRequestException('Selfie challenge does not match this verification session');
    }
    if (new Set(body.frameKeys).size !== body.frameKeys.length) {
      throw new BadRequestException('Selfie frames must be distinct uploads');
    }
    await this.validateEvidenceKeys(body.frameKeys, userId, verificationId, 'selfie');
    const previous = await this.prisma.kycCaptureEvidence.findMany({
      where: { kycVerificationId: verification.id, kind: KycEvidenceKind.SELFIE_FRAME },
      select: { bucket: true, key: true },
    });

    await this.prisma.$transaction(async (tx) => {
      const active = await tx.kycVerification.updateMany({
        where: {
          id: verification.id,
          userId,
          provider: 'self',
          status: KycStatus.IN_PROGRESS,
          selfieChallengeType: verification.selfieChallengeType,
        },
        data: { updatedAt: new Date() },
      });
      if (!active.count) {
        throw new ConflictException('This verification session is no longer active');
      }
      await tx.kycCaptureEvidence.deleteMany({
        where: { kycVerificationId: verification.id, kind: KycEvidenceKind.SELFIE_FRAME },
      });
      await tx.kycCaptureEvidence.createMany({
        data: body.frameKeys.map((key) => ({
          kycVerificationId: verification.id,
          kind: KycEvidenceKind.SELFIE_FRAME,
          bucket: EVIDENCE_BUCKET,
          key,
        })),
      });
    });
    await this.deleteReplacedEvidence(previous, new Set(body.frameKeys));
    return { ok: true };
  }

  /**
   * Runs the deterministic + (optionally) bot evaluation and returns a
   * DiditDecision-shaped result so kyc.service.ts's applyDecision can stay
   * provider-agnostic and unchanged. Called by kyc.controller.ts's
   * POST /kyc/self/submit, which immediately hands the result to
   * KycService.applyDecision.
   */
  async evaluate(verificationId: string, userId: string): Promise<DiditDecision> {
    const verification = await this.getOwnedOpenVerification(verificationId, userId);
    const evidence = await this.prisma.kycCaptureEvidence.findMany({
      where: { kycVerificationId: verification.id },
    });
    const documentFront = evidence.find((e) => e.kind === KycEvidenceKind.DOCUMENT_FRONT);
    const selfieFrames = evidence.filter((e) => e.kind === KycEvidenceKind.SELFIE_FRAME);
    if (!documentFront || selfieFrames.length < 2) {
      throw new BadRequestException('Document and selfie capture must be completed first');
    }

    const { faceMatchScore, livenessScore, poseCompliant } = await this.runDeterministicChecks(
      documentFront,
      selfieFrames,
      verification.selfieChallengeType as 'TURN_LEFT' | 'TURN_RIGHT' | null,
    );

    const botEnabled = await this.settings.isSelfHostedKycBotEnabled();
    const botFindings = botEnabled
      ? await this.runBotChecks(verification.documentType, documentFront)
      : null;

    const autoApproveEnabled = await this.settings.isSelfHostedKycAutoApproveEnabled();
    const { minFaceMatchScore, minLivenessScore } =
      await this.settings.getSelfHostedKycApproveThresholds();
    const doNotAutoDeclineEnabled = await this.settings.isSelfHostedKycDoNotAutoDeclineEnabled();
    const result = evaluateSelfHostedKyc({
      faceMatchScore,
      livenessScore,
      botFindings,
      autoApproveEnabled,
      minFaceMatchScore,
      minLivenessScore,
      doNotAutoDeclineEnabled,
    });

    const decision = this.toDiditDecision(result, botFindings, poseCompliant);
    decision.raw = {
      ...(decision.raw as Record<string, unknown>),
      thresholds: { minFaceMatchScore, minLivenessScore },
      autoApproveEnabled,
      approvalSource: 'submission',
      evaluatedAt: new Date().toISOString(),
    };
    return decision;
  }

  /**
   * Runs FaceMatchService against the stored document-portrait image and
   * selfie frames. Missing faces produce a failed check. Processing errors
   * get two retries, then leave the stored evidence available for resubmission.
   */
  private async runDeterministicChecks(
    documentFront: { bucket: string; key: string },
    selfieFrames: { bucket: string; key: string }[],
    challengeType: 'TURN_LEFT' | 'TURN_RIGHT' | null,
    attempt = 0,
  ): Promise<{ faceMatchScore: number; livenessScore: number; poseCompliant: boolean | null }> {
    try {
      const [documentBuffer, selfieBuffers] = await Promise.all([
        this.downloadEvidence(documentFront),
        Promise.all(selfieFrames.map((frame) => this.downloadEvidence(frame))),
      ]);

      const documentFace = await this.faceMatch.detectSingleFace(documentBuffer);
      const { livenessScore, bestFrameIndex, poseCompliant } = await this.faceMatch.scoreLiveness(
        selfieBuffers,
        challengeType,
      );

      if (!documentFace) {
        this.logger.warn(`DLKYC evaluate: no face detected in document portrait`);
        return { faceMatchScore: 0, livenessScore, poseCompliant };
      }
      const bestSelfieFace = await this.faceMatch.detectSingleFace(selfieBuffers[bestFrameIndex]);
      if (!bestSelfieFace) {
        this.logger.warn(`DLKYC evaluate: no face detected in any selfie frame`);
        return { faceMatchScore: 0, livenessScore, poseCompliant };
      }

      const faceMatchScore = await this.faceMatch.compareDescriptors(
        documentFace.descriptor,
        bestSelfieFace.descriptor,
      );
      return { faceMatchScore, livenessScore, poseCompliant };
    } catch (err) {
      this.logger.error(`DLKYC face-match evaluation failed: ${String(err)}`);
      if (attempt < 2)
        return this.runDeterministicChecks(documentFront, selfieFrames, challengeType, attempt + 1);
      throw new ServiceUnavailableException(
        'Identity checks could not complete. Please retry submission; your evidence has been saved.',
      );
    }
  }

  private async downloadEvidence(evidence: { bucket: string; key: string }): Promise<Buffer> {
    return this.storage.getObjectBuffer(evidence.bucket, evidence.key);
  }

  private evidenceKeyPrefix(userId: string, verificationId: string, stage: EvidenceStage): string {
    return `self/${userId}/${verificationId}/${stage}/`;
  }

  private async validateEvidenceKeys(
    keys: string[],
    userId: string,
    verificationId: string,
    stage: EvidenceStage,
  ): Promise<void> {
    const prefix = this.evidenceKeyPrefix(userId, verificationId, stage);
    for (const key of keys) {
      if (!key.startsWith(prefix) || key.includes('..')) {
        throw new BadRequestException(
          'Evidence upload does not belong to this verification session',
        );
      }
      let metadata: { contentLength: number; contentType: string | null };
      try {
        metadata = await this.storage.getObjectMetadata(EVIDENCE_BUCKET, key);
      } catch {
        throw new BadRequestException('Evidence upload was not found. Please capture it again.');
      }
      if (
        metadata.contentType !== EVIDENCE_CONTENT_TYPE ||
        metadata.contentLength < 4 ||
        metadata.contentLength > MAX_EVIDENCE_BYTES
      ) {
        throw new BadRequestException('Evidence must be a JPEG image no larger than 8 MB');
      }
      const buffer = await this.storage.getObjectBuffer(EVIDENCE_BUCKET, key);
      if (
        buffer.length !== metadata.contentLength ||
        buffer[0] !== 0xff ||
        buffer[1] !== 0xd8 ||
        buffer[buffer.length - 2] !== 0xff ||
        buffer[buffer.length - 1] !== 0xd9
      ) {
        throw new BadRequestException('Evidence is not a valid JPEG image');
      }
    }
  }

  private async deleteReplacedEvidence(
    previous: { bucket: string; key: string }[],
    retainedKeys: Set<string>,
  ): Promise<void> {
    await Promise.all(
      previous
        .filter((evidence) => !retainedKeys.has(evidence.key))
        .map(async (evidence) => {
          try {
            await this.storage.deleteObject(evidence.bucket, evidence.key);
          } catch (error) {
            this.logger.warn(
              `DLKYC could not delete replaced evidence key=${evidence.key}: ${String(error)}`,
            );
          }
        }),
    );
  }

  private async runBotChecks(
    documentType: string | null,
    documentFront: { bucket: string; key: string },
  ): Promise<BotFindings> {
    const order = (await this.settings.getSelfHostedKycBotProviderOrder()) as LlmProviderKey[];

    let extractedFields: BotFindings['extractedFields'] = null;
    try {
      const documentBuffer = await this.downloadEvidence(documentFront);
      const text = await this.llm.describeImage(
        documentBuffer.toString('base64'),
        CAPTURED_IMAGE_CONTENT_TYPE,
        buildOcrPrompt(documentType),
        order,
      );
      extractedFields = parseOcrResponse(text);
    } catch (err) {
      // OCR is reviewer-facing only (see BotFindings.extractedFields doc
      // comment) -- a failure here must never abort the rest of
      // evaluate(), just leave the fields null for the admin to read off
      // the stored image themselves.
      this.logger.warn(`DLKYC document OCR failed, leaving fields blank: ${String(err)}`);
    }

    const prompt = buildBotPrompt(documentType);
    try {
      const text = await this.llm.normalize(prompt, order);
      return { ...parseBotResponse(text), extractedFields };
    } catch (err) {
      this.logger.warn(`DLKYC bot check failed, treating as no findings: ${String(err)}`);
      return { plausibilityScore: null, flags: [], summary: null, extractedFields };
    }
  }

  private toDiditDecision(
    result: KycEvaluationResult,
    botFindings: BotFindings | null,
    poseCompliant: boolean | null,
  ): DiditDecision {
    const statusByBand: Record<string, string> = {
      APPROVE: 'Approved',
      REVIEW: 'In Review',
      DECLINE: 'Declined',
    };
    return {
      status: statusByBand[result.band],
      idVerifications: [],
      faceMatchScore: result.faceMatchScore,
      faceMatchStatus: null,
      livenessScore: result.livenessScore,
      livenessStatus: null,
      declineReason: result.declineReason,
      raw: { provider: 'self', band: result.band, botFindings, poseCompliant },
    };
  }

  private async getOwnedOpenVerification(verificationId: string, userId: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });
    if (!verification || verification.userId !== userId || verification.provider !== 'self') {
      throw new NotFoundException('Verification session not found');
    }
    if (verification.status !== KycStatus.IN_PROGRESS) {
      throw new ConflictException('This verification session is no longer active');
    }
    return verification;
  }
}

function buildBotPrompt(documentType: string | null): string {
  return [
    'You are assisting a human reviewer of an identity-verification submission.',
    'You are NOT authorized to approve or reject the submission -- you only',
    'surface observations for a human to consider.',
    `Declared document type: ${documentType ?? 'unknown'}.`,
    'Respond with strict JSON only, no prose, matching this shape:',
    '{"plausibilityScore": <0-100 integer>, "flags": [<short strings>], "summary": "<one sentence>"}',
    'flags should list any concrete inconsistency you would want a human to check; return an empty array if none.',
  ].join(' ');
}

function parseBotResponse(text: string): Omit<BotFindings, 'extractedFields'> {
  try {
    const parsed = JSON.parse(text) as {
      plausibilityScore?: unknown;
      flags?: unknown;
      summary?: unknown;
    };
    const plausibilityScore =
      typeof parsed.plausibilityScore === 'number' ? parsed.plausibilityScore : null;
    const flags = Array.isArray(parsed.flags)
      ? parsed.flags.filter((f): f is string => typeof f === 'string')
      : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary : null;
    return { plausibilityScore, flags, summary };
  } catch {
    return { plausibilityScore: null, flags: [], summary: null };
  }
}

function buildOcrPrompt(documentType: string | null): string {
  return [
    'You are reading an identity document image to assist a human reviewer.',
    'You are NOT authorized to approve, reject, or verify the document --',
    'only to transcribe what is printed on it as accurately as possible.',
    `Declared document type: ${documentType ?? 'unknown'}.`,
    'Respond with strict JSON only, no prose, matching this shape:',
    '{"fullName": <string or null>, "dateOfBirth": <string or null, as printed>, "documentNumber": <string or null>}',
    'Use null for any field you cannot read confidently -- never guess or invent a value.',
  ].join(' ');
}

function parseOcrResponse(text: string): BotFindings['extractedFields'] {
  try {
    const parsed = JSON.parse(text) as {
      fullName?: unknown;
      dateOfBirth?: unknown;
      documentNumber?: unknown;
    };
    return {
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : null,
      dateOfBirth: typeof parsed.dateOfBirth === 'string' ? parsed.dateOfBirth : null,
      documentNumber: typeof parsed.documentNumber === 'string' ? parsed.documentNumber : null,
    };
  } catch {
    return null;
  }
}

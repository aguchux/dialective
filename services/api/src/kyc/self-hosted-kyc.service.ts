import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KycEvidenceKind, KycStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { LlmNormalizerService } from '../llm/llm-normalizer.service';
import { LlmProviderKey } from '../llm/llm-provider.interface';
import { DiditDecision } from './didit.service';
import { signKycHandoffToken, verifyKycHandoffToken } from './self-hosted-kyc-handoff.util';
import {
  BotFindings,
  evaluateSelfHostedKyc,
  KycEvaluationResult,
} from './self-hosted-kyc-decision';

const EVIDENCE_BUCKET = process.env.SPACES_KYC_EVIDENCE_BUCKET ?? 'dialectiva-kyc-evidence';

const CHALLENGES = [
  'Turn your head to the left',
  'Turn your head to the right',
  'Blink slowly, twice',
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

  getChallenge(): { challenge: string } {
    return { challenge: CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)] };
  }

  async createEvidenceUploadUrl(verificationId: string, userId: string, contentType: string) {
    await this.getOwnedOpenVerification(verificationId, userId);
    const key = `self/${userId}/${verificationId}/${randomUUID()}`;
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

    await this.prisma.$transaction([
      this.prisma.kycVerification.update({
        where: { id: verification.id },
        data: { documentType: body.documentType },
      }),
      this.prisma.kycCaptureEvidence.create({
        data: {
          kycVerificationId: verification.id,
          kind: KycEvidenceKind.DOCUMENT_FRONT,
          bucket: EVIDENCE_BUCKET,
          key: body.frontKey,
        },
      }),
      ...(body.backKey
        ? [
            this.prisma.kycCaptureEvidence.create({
              data: {
                kycVerificationId: verification.id,
                kind: KycEvidenceKind.DOCUMENT_BACK,
                bucket: EVIDENCE_BUCKET,
                key: body.backKey,
              },
            }),
          ]
        : []),
    ]);
    return { ok: true };
  }

  async submitSelfie(
    verificationId: string,
    userId: string,
    body: { frameKeys: string[]; challenge: string },
  ) {
    const verification = await this.getOwnedOpenVerification(verificationId, userId);

    await this.prisma.kycCaptureEvidence.createMany({
      data: body.frameKeys.map((key) => ({
        kycVerificationId: verification.id,
        kind: KycEvidenceKind.SELFIE_FRAME,
        bucket: EVIDENCE_BUCKET,
        key,
      })),
    });
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
    const hasDocument = evidence.some((e) => e.kind === KycEvidenceKind.DOCUMENT_FRONT);
    const selfieFrames = evidence.filter((e) => e.kind === KycEvidenceKind.SELFIE_FRAME);
    if (!hasDocument || selfieFrames.length < 2) {
      throw new BadRequestException('Document and selfie capture must be completed first');
    }

    const { faceMatchScore, livenessScore } = await this.runDeterministicChecks();

    const botEnabled = await this.settings.isSelfHostedKycBotEnabled();
    const botFindings = botEnabled ? await this.runBotChecks(verification.documentType) : null;

    const autoApproveEnabled = await this.settings.isSelfHostedKycAutoApproveEnabled();
    const result = evaluateSelfHostedKyc({
      faceMatchScore,
      livenessScore,
      botFindings,
      autoApproveEnabled,
    });

    return this.toDiditDecision(result, botFindings);
  }

  /**
   * PLACEHOLDER: no self-hosted face-descriptor/liveness model is wired in
   * yet (see this service's tracking follow-up -- adding one means new
   * native build dependencies, e.g. @vladmandic/face-api + canvas, in the
   * services/api Docker image, deliberately deferred out of this first
   * build). Always returns mid-range "uncertain" scores, which
   * self-hosted-kyc-decision.ts's thresholds route to REVIEW regardless of
   * autoApproveEnabled -- i.e. auto-approval can never fire until this is
   * replaced with a real model. Safe default, not a silent gap.
   */
  private async runDeterministicChecks(): Promise<{
    faceMatchScore: number;
    livenessScore: number;
  }> {
    return { faceMatchScore: 60, livenessScore: 60 };
  }

  private async runBotChecks(documentType: string | null): Promise<BotFindings> {
    const order = (await this.settings.getSelfHostedKycBotProviderOrder()) as LlmProviderKey[];
    const prompt = buildBotPrompt(documentType);
    try {
      const text = await this.llm.normalize(prompt, order);
      return parseBotResponse(text);
    } catch (err) {
      this.logger.warn(`DLKYC bot check failed, treating as no findings: ${String(err)}`);
      return { plausibilityScore: null, flags: [], summary: null };
    }
  }

  private toDiditDecision(result: KycEvaluationResult, botFindings: BotFindings | null): DiditDecision {
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
      raw: { provider: 'self', band: result.band, botFindings },
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

function parseBotResponse(text: string): BotFindings {
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

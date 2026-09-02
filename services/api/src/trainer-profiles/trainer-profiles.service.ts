import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, SubmissionStatus, UserStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { trainerRatingValue } from '../common/trainer-rating.util';

@Injectable()
export class TrainerProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Public, deliberately minimal trainer identity and contribution evidence.
   * It never returns contact, wallet, payment, referral-chain, raw-score, or
   * individual recording data. Referral codes are already public sharing IDs
   * and make durable profile URLs without exposing database user IDs.
   */
  async getPublicProfile(referralCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { referralCode },
      select: {
        id: true,
        referralCode: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        role: true,
        status: true,
        trainerRating: true,
        kycStatus: true,
        country: { select: { name: true } },
        dialect: { select: { name: true } },
        dialectVariant: { select: { name: true } },
      },
    });

    if (!user || user.role !== Role.TRAINER || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Trainer profile not found');
    }

    const scoredWhere = {
      userId: user.id,
      status: { in: [SubmissionStatus.SCORED, SubmissionStatus.SETTLED] },
      score: { not: null },
    };
    const [submissionScores, recordingScores, testimonials] = await Promise.all([
      this.prisma.submission.aggregate({
        where: scoredWhere,
        _count: { _all: true },
        _avg: { score: true },
      }),
      this.prisma.wordRecording.aggregate({
        where: scoredWhere,
        _count: { _all: true },
        _avg: { score: true },
      }),
      this.prisma.testimony.findMany({
        where: { userId: user.id, status: 'APPROVED', visible: true },
        orderBy: { reviewedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          kind: true,
          text: true,
          videoBucket: true,
          videoKey: true,
          reviewedAt: true,
        },
      }),
    ]);

    const submissionCount = submissionScores._count._all;
    const recordingCount = recordingScores._count._all;
    const scoredContributions = submissionCount + recordingCount;
    const averageScore = scoredContributions
      ? Number(
          (
            ((submissionScores._avg.score?.toNumber() ?? 0) * submissionCount +
              (recordingScores._avg.score?.toNumber() ?? 0) * recordingCount) /
            scoredContributions
          ).toFixed(2),
        )
      : null;

    return {
      referralCode: user.referralCode,
      firstName: user.firstName,
      lastInitial: user.lastName ? `${user.lastName.charAt(0).toUpperCase()}.` : null,
      memberSince: user.createdAt,
      countryName: user.country?.name ?? null,
      dialectName: user.dialect?.name ?? null,
      dialectVariantName: user.dialectVariant?.name ?? null,
      identityVerified: user.kycStatus === 'APPROVED',
      trainerRating: user.trainerRating,
      trainerRatingValue: trainerRatingValue(user.trainerRating),
      scoredContributions,
      averageScore,
      testimonials: testimonials.map((testimony) => ({
        id: testimony.id,
        kind: testimony.kind,
        text: testimony.text,
        reviewedAt: testimony.reviewedAt,
        videoUrl:
          testimony.videoBucket && testimony.videoKey
            ? this.storage.getPublicObjectUrl(testimony.videoBucket, testimony.videoKey)
            : null,
      })),
    };
  }
}

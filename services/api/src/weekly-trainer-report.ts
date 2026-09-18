import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { KycStatus, Role, UserStatus } from '@dialectiva/db';
import { AppModule } from './app.module';
import { PlatformSettingsService } from './settings/platform-settings.service';
import { TrainerReportService } from './wallet/trainer-report.service';
import { MailService } from './mail/mail.service';
import { PrismaService } from './prisma/prisma.service';

const BATCH_SIZE = 100;

/**
 * Lifetime recordings a trainer needs before the weekly report is worth
 * sending them. The report previously went to every active trainer, so the
 * bulk of it was a summary of zeroes mailed to people who had not recorded
 * anything.
 */
const MIN_RECORDINGS = 1000;

/**
 * One-shot entrypoint for the weekly-trainer-report k8s CronJob (Monday
 * 08:00 UTC). Emails every active trainer a summary of the trailing 7 days
 * (recordings, avg score, earnings, a daily bar chart) via
 * TrainerReportService.buildReport -- the same aggregation
 * GET wallet/report uses for a trainer's own on-demand, date-filtered
 * lifetime report.
 *
 * Gated by PlatformSettings.weeklyTrainerReportEnabled, checked once here
 * (not per-recipient) -- an admin who turns this off should stop the whole
 * run, not silently skip individual sends. Iterates trainers via cursor
 * pagination (bounded memory regardless of trainer count) with a
 * per-recipient try/catch, so one trainer's bad email/Resend hiccup never
 * aborts the run for everyone after them.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const settings = app.get(PlatformSettingsService);
  const trainerReport = app.get(TrainerReportService);
  const mail = app.get(MailService);
  const prisma = app.get(PrismaService);

  try {
    if (!(await settings.isWeeklyTrainerReportEnabled())) {
      // eslint-disable-next-line no-console
      console.log('weekly trainer report disabled; skipping run');
      await app.close();
      process.exit(0);
    }

    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    let cursor: string | undefined;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (;;) {
      const trainers = await prisma.user.findMany({
        where: {
          role: Role.TRAINER,
          status: UserStatus.ACTIVE,
          // Narrowed from "every active trainer" (5,991 recipients) to
          // established, verified contributors. The report went to everyone
          // regardless of whether they had done anything, so most of that
          // volume was a summary of zeroes. Recipients must be phone- and
          // KYC-verified and have at least MIN_RECORDINGS recordings.
          phoneVerifiedAt: { not: null },
          kycStatus: KycStatus.APPROVED,
          emailNotificationsEnabled: true,
        },
        select: { id: true, email: true, firstName: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (trainers.length === 0) break;

      for (const trainer of trainers) {
        try {
          // Lifetime recording count, checked per trainer rather than in the
          // query above -- Prisma cannot express "relation count >= N" in a
          // where clause, and the count is cheap against an indexed userId
          // on an audience already narrowed to verified trainers.
          const recordingCount = await prisma.wordRecording.count({
            where: { userId: trainer.id },
          });
          if (recordingCount < MIN_RECORDINGS) {
            skipped += 1;
            continue;
          }
          const report = await trainerReport.buildReport(trainer.id, from, to);
          await mail.sendWeeklyTrainerReportEmail({
            trainerEmail: trainer.email,
            trainerFirstName: trainer.firstName,
            recordings: report.totals.recordings,
            avgScore: report.totals.avgScore,
            totalEarningsTokens: report.totals.totalEarningsTokens,
            daily: report.daily.map((day) => ({ date: day.date, recordings: day.recordings })),
          });
          sent += 1;
        } catch (err) {
          failed += 1;
          // eslint-disable-next-line no-console
          console.error('weekly trainer report failed for user', trainer.id, err);
        }
      }
      cursor = trainers[trainers.length - 1].id;
    }

    // eslint-disable-next-line no-console
    console.log('weekly trainer report run complete', { sent, failed, skipped });
    await app.close();
    process.exit(0);
  } catch (err) {
    await app.close();
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

bootstrap();

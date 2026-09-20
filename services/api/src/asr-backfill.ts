import 'reflect-metadata';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@dialectiva/db';
import { buildRedisConnectionOptions } from './common/redis-connection.util';
import { AsrRegistryService } from './asr-registry/asr-registry.service';

/**
 * Re-publishes already-recorded audio to ASR for dialects an admin has
 * ticked on the admin ASR Transcription page (Dialect.asrBackfillEnabled).
 *
 * Why this exists: a dialect only ever transcribes recordings submitted
 * AFTER it was added to models/asr-registry.yaml. Nothing re-sends the
 * history, so mapping a dialect leaves everything recorded before that
 * moment permanently blank -- 56k recordings across the 13 dialects mapped
 * on 2026-09-20, 43.6k of them Nigerian Pidgin alone.
 *
 * Two deliberate choices:
 *
 * 1. Publishes straight to asr-jobs-<engine>, NOT to quality-gate-jobs the
 *    way a live submission does. These recordings were already gated when
 *    first submitted and carry their liveness/noise/expression scores;
 *    re-running the gate would burn CPU recomputing them and risk
 *    overwriting a score with one derived from a re-encoded object. The
 *    payload here matches exactly what quality-gate-worker forwards for a
 *    word_recording (see its worker.py asr_stream branch) so the ASR
 *    workers cannot tell the difference.
 *
 * 2. Capped per run rather than draining a whole dialect at once. Live
 *    submissions share asr-jobs-whisper and its 5-replica KEDA ceiling, so
 *    an unbounded push would park tens of thousands of jobs ahead of
 *    traffic that a trainer is waiting on. A cap plus a frequent schedule
 *    trades total wall-clock for never starving the live path.
 *
 * Backfilling a SETTLED recording is safe: whisper-worker/vosk-worker's
 * update_word_recording_result writes transcript/asrMatchScore/word-detail
 * only and never touches status or score (see whisper-worker/db.py's
 * UPDATE_WORD_RECORDING_ASR_SQL), so no payout can move as a result of
 * this job.
 *
 * Deliberately does NOT boot AppModule, unlike the other standalone
 * scripts in this directory. AppModule calls ScheduleModule.forRoot(), so
 * every @Cron in the API (KycService's recheck sweeps, and others) starts
 * running in-process the moment the context is created -- which was
 * observed firing real KYC recheck sweeps from inside a backfill pod, and
 * kept the process alive indefinitely so the job never completed. That is
 * tolerable-ish for an hourly script; at this job's 5-minute cadence it
 * would mean duplicate scheduled work against production all day. This
 * needs Prisma, Redis and a YAML file, so it constructs those three
 * directly and nothing else.
 */

/**
 * Jobs published per dialect per run. 500 x every-5-minutes is ~6k/hour of
 * headroom-permitting backlog, against a measured live throughput of
 * ~140 transcripts/hour -- so a ticked dialect drains in days while live
 * traffic keeps its share of the workers rather than queueing behind the
 * backlog.
 */
const BATCH_PER_DIALECT = 500;

async function bootstrap() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const redis = new Redis(buildRedisConnectionOptions());
  const asrRegistry = new AsrRegistryService();

  const shutdown = async () => {
    await prisma.$disconnect().catch(() => undefined);
    redis.disconnect();
  };

  try {
    const enabled = await prisma.dialect.findMany({
      where: { asrBackfillEnabled: true },
      select: { id: true, tag: true, name: true },
    });

    if (enabled.length === 0) {
      // eslint-disable-next-line no-console
      console.log('asr backfill: no dialects ticked, nothing to do');
      await shutdown();
      process.exit(0);
    }

    const summary: {
      tag: string;
      published: number;
      remaining: number;
      completed: boolean;
      skipped?: string;
    }[] = [];

    for (const dialect of enabled) {
      const route = asrRegistry.resolve(dialect.tag);
      if (!route) {
        // Ticked but unmapped: there is no engine to send this to. Leave
        // the tick alone -- the admin may have ticked it in anticipation
        // of a checkpoint landing, and silently unticking would hide that.
        summary.push({
          tag: dialect.tag,
          published: 0,
          remaining: 0,
          completed: false,
          skipped: 'no ASR registry entry for this dialect',
        });
        continue;
      }

      // Only rows whose audio still exists. audio-retention-job nulls
      // audioKey/stamps audioDeletedAt on purged objects, and those are
      // unrecoverable -- excluding them here is what lets "remaining
      // reaches 0" mean genuinely done rather than permanently stuck.
      const pending = {
        dialectTag: dialect.tag,
        transcript: null,
        audioKey: { not: null },
        audioBucket: { not: null },
        audioDeletedAt: null,
        // asrMatchScore is char-similarity against the trainer's typed
        // text, so a blank one would score a flat 0 -- which reads as
        // "ASR got it wrong" rather than "there was nothing to compare
        // against". The column is non-nullable and no blank row exists in
        // the dialects being backfilled first, but excluding them keeps
        // that true for any dialect ticked later.
        translationText: { not: '' },
      };

      const batch = await prisma.wordRecording.findMany({
        where: pending,
        // Oldest first: the further back a recording is, the likelier it
        // is already settled and the likelier its audio is next in line
        // for a retention purge.
        orderBy: { createdAt: 'asc' },
        take: BATCH_PER_DIALECT,
        select: {
          id: true,
          audioBucket: true,
          audioKey: true,
          translationText: true,
        },
      });

      for (const recording of batch) {
        await redis.xadd(route.stream, '*', ...Object.entries({
          word_recording_id: recording.id,
          dialect_tag: dialect.tag,
          // The dialect text the trainer typed for this recording, which
          // is what asrMatchScore compares the transcript against. Stored
          // on the row itself, so unlike the live path this needs no
          // assignment/direction lookup -- a DIALECT_TO_ENGLISH row's
          // translationText is already its dialect text.
          expected_text: recording.translationText,
          bucket: recording.audioBucket!,
          audio_key: recording.audioKey!,
        }).flat());
      }

      const remaining = await prisma.wordRecording.count({ where: pending });
      // remaining counts rows not yet TRANSCRIBED, which still includes
      // everything just published -- those clear as the workers process
      // them. Done means this run found nothing left to publish.
      const completed = batch.length === 0;

      if (completed) {
        await prisma.dialect.update({
          where: { id: dialect.id },
          data: { asrBackfillEnabled: false },
        });
      }

      summary.push({ tag: dialect.tag, published: batch.length, remaining, completed });
    }

    // eslint-disable-next-line no-console
    console.log('asr backfill complete', JSON.stringify(summary));
    await shutdown();
    // The Redis/Prisma handles keep the event loop alive even after
    // disconnect in some paths, so exit explicitly rather than relying on
    // it draining -- the CronJob would otherwise hang.
    process.exit(0);
  } catch (err) {
    await shutdown();
    // eslint-disable-next-line no-console
    console.error('asr backfill failed', err);
    process.exit(1);
  }
}

void bootstrap();

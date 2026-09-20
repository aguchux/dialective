import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { RedisStreamsService } from './redis-streams/redis-streams.service';
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
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const streams = app.get(RedisStreamsService);
  const asrRegistry = app.get(AsrRegistryService);

  try {
    const enabled = await prisma.dialect.findMany({
      where: { asrBackfillEnabled: true },
      select: { id: true, tag: true, name: true },
    });

    if (enabled.length === 0) {
      // eslint-disable-next-line no-console
      console.log('asr backfill: no dialects ticked, nothing to do');
      await app.close();
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
        await streams.publish(route.stream, {
          word_recording_id: recording.id,
          dialect_tag: dialect.tag,
          // The dialect text the trainer typed for this recording, which
          // is what asrMatchScore compares the transcript against. Stored
          // on the row itself, so unlike the live path this needs no
          // assignment/direction lookup -- a DIALECT_TO_ENGLISH row's
          // translationText is already its dialect text.
          expected_text: recording.translationText ?? '',
          bucket: recording.audioBucket!,
          audio_key: recording.audioKey!,
        });
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
    await app.close();
    // createApplicationContext keeps the Redis/Prisma handles open, so the
    // process never exits on its own -- the CronJob would hang forever.
    process.exit(0);
  } catch (err) {
    await app.close();
    // eslint-disable-next-line no-console
    console.error('asr backfill failed', err);
    process.exit(1);
  }
}

void bootstrap();

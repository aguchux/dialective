import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { RedisStreamsService, StreamMessage } from '../redis-streams/redis-streams.service';
import { MIN_QUORUM } from '../config';

const CONSENSUS_STREAM = process.env.CONSENSUS_STREAM ?? 'consensus-jobs';
const CONSUMER_GROUP = process.env.CONSUMER_GROUP ?? 'consensus-scorers';
const CONSUMER_NAME = process.env.HOSTNAME ?? 'consensus-scorer-1';

// Cluster members that are eligible to be counted/scored -- SCORED is
// included alongside TRANSCRIBED so a later-arriving message for an
// already-scored cluster still sees the true cluster size, and so a
// re-score pass (see scoreCluster) recomputes every member's agreement
// against the full, current cluster rather than a stale subset.
const SCORABLE_STATUSES = ['TRANSCRIBED', 'SCORED'] as const;

/**
 * Consumes consensus-jobs and scores a (prompt_id, dialect_tag) cluster once
 * MIN_QUORUM submissions exist. Never computes/exposes a score before quorum
 * is met (AGENTS.md "Consensus scoring"). Scoring compares ASR transcripts
 * within a cluster via a word-level Levenshtein agreement ratio -- trainers
 * dictate a fixed prompt, so transcripts should converge on nearly the same
 * token sequence, making edit-distance the right-fidelity comparison (not an
 * oversimplification the way it would be for an open-ended paraphrase task).
 */
@Injectable()
export class ConsensusService implements OnModuleInit {
  private readonly logger = new Logger(ConsensusService.name);

  constructor(
    private readonly streams: RedisStreamsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.streams
      .consume(CONSENSUS_STREAM, CONSUMER_GROUP, CONSUMER_NAME, (msg) => this.handle(msg))
      .catch((err) => this.logger.error(`Consumer loop crashed: ${err.message}`));
  }

  private async handle(message: StreamMessage): Promise<void> {
    const { prompt_id, dialect_tag } = message.data;
    this.logger.log(`Received consensus job for prompt=${prompt_id} dialect=${dialect_tag}`);

    const clusterSize = await this.countClusterSubmissions(prompt_id, dialect_tag);
    if (clusterSize < MIN_QUORUM) {
      this.logger.log(
        `Cluster prompt=${prompt_id} dialect=${dialect_tag} below quorum (${clusterSize}/${MIN_QUORUM}); skipping`,
      );
      return;
    }

    await this.scoreCluster(prompt_id, dialect_tag);
  }

  private async countClusterSubmissions(promptId: string, dialectTag: string): Promise<number> {
    return this.prisma.submission.count({
      where: { promptId, dialectTag, status: { in: [...SCORABLE_STATUSES] } },
    });
  }

  /**
   * Scores every currently-scorable submission in the cluster in one pass
   * (not just the message that triggered this run) -- this correctly
   * retro-scores earlier arrivals that were persisted before quorum was
   * first reached.
   */
  private async scoreCluster(promptId: string, dialectTag: string): Promise<void> {
    const cluster = await this.prisma.submission.findMany({
      where: { promptId, dialectTag, status: { in: [...SCORABLE_STATUSES] } },
      select: { id: true, transcript: true },
    });

    const normalized = cluster.map((submission) => ({
      id: submission.id,
      tokens: normalizeTranscript(submission.transcript ?? ''),
    }));

    const scores = normalized.map((submission) => {
      const others = normalized.filter((other) => other.id !== submission.id);
      const similarities = others.map((other) => tokenSimilarity(submission.tokens, other.tokens));
      const agreement = similarities.length > 0 ? mean(similarities) * 100 : 0;
      return { id: submission.id, score: agreement };
    });

    const scoreValues = scores.map((s) => s.score);
    const clusterMean = mean(scoreValues);
    const clusterStdDev = stdDev(scoreValues, clusterMean);

    // Flagged for human QA review, never auto-rejected -- dialect variation
    // is expected and must not be penalized as if it were fraud (AGENTS.md
    // "Consensus scoring"). isOutlier never affects the score or payout.
    const updates = scores.map(({ id, score }) => {
      const isOutlier = clusterStdDev > 0 && Math.abs(score - clusterMean) > 2 * clusterStdDev;
      return this.prisma.submission.update({
        where: { id },
        data: {
          score: new Prisma.Decimal(score.toFixed(2)),
          isOutlier,
          status: 'SCORED',
          scoredAt: new Date(),
        },
      });
    });

    await this.prisma.$transaction(updates);
    this.logger.log(
      `Scored cluster prompt=${promptId} dialect=${dialectTag} size=${cluster.length} meanScore=${clusterMean.toFixed(2)}`,
    );
  }
}

/**
 * Lowercase, strip punctuation, collapse whitespace, split into word
 * tokens. Diacritics are deliberately preserved -- Igbo/Yoruba tonal
 * diacritics are phonemically meaningful, not noise to normalize away.
 */
function normalizeTranscript(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[.,!?;:"'()[\]{}]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** 1 - (word-level edit distance / longer token count), in [0, 1]. */
function tokenSimilarity(a: string[], b: string[]): number {
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dist[i][0] = i;
  for (let j = 0; j < cols; j += 1) dist[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }

  return dist[rows - 1][cols - 1];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[], meanValue: number): number {
  if (values.length === 0) return 0;
  const variance = mean(values.map((v) => (v - meanValue) ** 2));
  return Math.sqrt(variance);
}

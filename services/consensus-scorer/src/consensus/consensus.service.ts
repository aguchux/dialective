import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisStreamsService, StreamMessage } from '../redis-streams/redis-streams.service';
import { MIN_QUORUM } from '../config';

const CONSENSUS_STREAM = process.env.CONSENSUS_STREAM ?? 'consensus-jobs';
const CONSUMER_GROUP = process.env.CONSUMER_GROUP ?? 'consensus-scorers';
const CONSUMER_NAME = process.env.HOSTNAME ?? 'consensus-scorer-1';

/**
 * Consumes consensus-jobs and scores a (prompt_id, dialect_tag) cluster once
 * MIN_QUORUM submissions exist. Never computes/exposes a score before quorum
 * is met (AGENTS.md "Consensus scoring").
 */
@Injectable()
export class ConsensusService implements OnModuleInit {
  private readonly logger = new Logger(ConsensusService.name);

  constructor(private readonly streams: RedisStreamsService) {}

  onModuleInit() {
    this.streams
      .consume(CONSENSUS_STREAM, CONSUMER_GROUP, CONSUMER_NAME, (msg) => this.handle(msg))
      .catch((err) => this.logger.error(`Consumer loop crashed: ${err.message}`));
  }

  private async handle(message: StreamMessage): Promise<void> {
    const { submission_id, prompt_id, dialect_tag } = message.data;
    this.logger.log(`Received consensus job for prompt=${prompt_id} dialect=${dialect_tag}`);

    const clusterSize = await this.countClusterSubmissions(prompt_id, dialect_tag);
    if (clusterSize < MIN_QUORUM) {
      this.logger.log(
        `Cluster prompt=${prompt_id} dialect=${dialect_tag} below quorum (${clusterSize}/${MIN_QUORUM}); skipping`,
      );
      return;
    }

    // TODO: fetch cluster transcripts from Postgres, compute pairwise
    // similarity, write score back. Left unimplemented until the Postgres
    // schema (Project Plan step 2) exists.
    this.logger.log(`Would score submission=${submission_id} now that quorum is met`);
  }

  private async countClusterSubmissions(promptId: string, dialectTag: string): Promise<number> {
    // TODO: query Postgres for submission count in this (prompt_id, dialect_tag)
    // cluster. Stubbed until the DB layer exists.
    void promptId;
    void dialectTag;
    return 0;
  }
}

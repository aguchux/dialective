import { Injectable, Logger } from '@nestjs/common';

/**
 * Reads finalized scores from Postgres, computes payouts against the
 * client-funded Reward Pool (never funded by other trainers' token
 * purchases — see business plan §4-5), and writes wallet ledger entries.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  async run(): Promise<void> {
    this.logger.log('Settlement run starting');

    // TODO: query Postgres for scored-but-unsettled submissions, compute
    // stake-back + Reward-Pool-capped bonus per submission, write ledger
    // entries. Left unimplemented until the Postgres schema (Project Plan
    // step 2) exists.

    this.logger.log('Settlement run complete');
  }
}

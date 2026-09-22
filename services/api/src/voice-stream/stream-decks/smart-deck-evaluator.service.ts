import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StreamDeckType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamsService, StreamMessage } from '../../redis-streams/redis-streams.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { StreamDeckVersioningService } from './stream-deck-versioning.service';
import { DeckCoverageService } from '../../vdcl/rights/deck-coverage.service';

const SMART_DECK_STREAM = process.env.SMART_DECK_STREAM ?? 'smart-deck-jobs';
const CONSUMER_GROUP = process.env.SMART_DECK_CONSUMER_GROUP ?? 'smart-deck-evaluators';
const CONSUMER_NAME = process.env.HOSTNAME ?? 'api-smart-deck-1';

/**
 * In-process consumer (lives inside `api`, not a standalone service like
 * isvc-scorer) -- Smart Deck evaluation needs CatalogueService/eligibleWhere
 * directly, and duplicating that eligibility logic into a separate
 * deployable would be pure waste (isvc-scorer avoided the same duplication
 * by only ever touching SubscriberValidation/IsvcAggregation, never
 * WordRecording eligibility). Consumes `smart-deck-jobs`, published by:
 * - audio-retention-job after purging a WordRecording (trigger=recording_eligible)
 * - isvc-scorer after a material ISVC change (trigger=isvc_changed)
 * StreamDecksService also calls evaluateRule directly (synchronously, no
 * async job) for a manual rule create/update, since that's a single-deck,
 * single-request action that should show its effect immediately.
 */
@Injectable()
export class SmartDeckEvaluatorService implements OnModuleInit {
  private readonly logger = new Logger(SmartDeckEvaluatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: RedisStreamsService,
    private readonly catalogue: CatalogueService,
    private readonly versioning: StreamDeckVersioningService,
    private readonly deckCoverage: DeckCoverageService,
  ) {}

  onModuleInit() {
    this.streams
      .consume(SMART_DECK_STREAM, CONSUMER_GROUP, CONSUMER_NAME, (msg) => this.handle(msg))
      .catch((err) => this.logger.error(`Consumer loop crashed: ${err.message}`));
  }

  private async handle(message: StreamMessage): Promise<void> {
    const { trigger, recording_id: recordingId, deck_id: deckId } = message.data;
    if (trigger === 'rule_updated' && deckId) {
      await this.evaluateRule(deckId);
      return;
    }
    if ((trigger === 'recording_eligible' || trigger === 'isvc_changed') && recordingId) {
      await this.evaluateAllRulesFor(recordingId);
      return;
    }
    this.logger.warn(
      `Received smart-deck job with unrecognized shape: ${JSON.stringify(message.data)}`,
    );
  }

  /**
   * Re-evaluates one Smart Deck's rule against the current eligible
   * recording set, diffs against current membership, applies the
   * add/remove delta, then writes a new version if anything materially
   * changed.
   */
  async evaluateRule(deckId: string): Promise<void> {
    const deck = await this.prisma.streamDeck.findUnique({
      where: { id: deckId },
      include: { rule: true },
    });
    if (!deck || deck.type !== StreamDeckType.SMART || !deck.rule) {
      return;
    }

    const matchingIds = new Set(await this.catalogue.matchingRecordingIdsForRule(deck.rule));
    const currentItems = await this.prisma.streamDeckItem.findMany({ where: { deckId } });
    const currentIds = new Set(currentItems.map((item) => item.recordingId));

    const toAdd = [...matchingIds].filter((id) => !currentIds.has(id));
    const toRemove = currentItems.filter((item) => !matchingIds.has(item.recordingId));

    if (toAdd.length === 0 && toRemove.length === 0) {
      return;
    }

    await this.prisma.$transaction([
      ...(toAdd.length > 0
        ? [
            this.prisma.streamDeckItem.createMany({
              data: toAdd.map((recordingId) => ({
                deckId,
                recordingId,
                addedByUserId: deck.createdByUserId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
      ...(toRemove.length > 0
        ? [
            this.prisma.streamDeckItem.deleteMany({
              where: { id: { in: toRemove.map((item) => item.id) } },
            }),
          ]
        : []),
    ]);

    await this.versioning.writeNewVersionIfMaterial(deckId, 'smart_rule_match');

    // A Smart Deck refills itself by rule, with no interactive caller to
    // report licence coverage back to -- so unlike addItem and
    // copyToOwnDeck, there is nobody to hand a coverage figure. Without
    // this, a rule-driven deck would be the one path that quietly
    // accumulates unlicensed recordings, laundering around the guardrail
    // the manual paths enforce.
    //
    // The rule is NOT narrowed to licensed recordings: a contributor who
    // has not signed yet is a legitimate pending state, and silently
    // dropping their work would make a Smart Deck's membership disagree
    // with its own rule. The shortfall is logged instead, and the deck's
    // coverage endpoint reports it on demand.
    if (toAdd.length > 0) {
      void this.logCoverageShortfall(deck.organizationId, deckId, toAdd);
    }
  }

  /** Best-effort: a coverage lookup must never fail a rule evaluation. */
  private async logCoverageShortfall(
    organizationId: string,
    deckId: string,
    addedRecordingIds: string[],
  ): Promise<void> {
    try {
      const [keys, clients] = await Promise.all([
        this.prisma.streamApiKey.findMany({
          where: { organizationId, revokedAt: null },
          select: { purposes: true },
        }),
        this.prisma.oAuthClient.findMany({
          where: { organizationId, revokedAt: null },
          select: { purposes: true },
        }),
      ]);
      const purposes = [...new Set([...keys, ...clients].flatMap((r) => r.purposes))];
      const coverage = await this.deckCoverage.forRecordings(addedRecordingIds, purposes);
      if (coverage.breakdown.licensed < addedRecordingIds.length) {
        this.logger.warn(
          `Smart Deck ${deckId} added ${addedRecordingIds.length} recordings, ` +
            `${coverage.breakdown.licensed} licensed for this org's declared purposes ` +
            `(pending=${coverage.breakdown.pending} withdrawn=${coverage.breakdown.withdrawn} ` +
            `suspended=${coverage.breakdown.suspended} purposeNotGranted=${coverage.breakdown.purposeNotGranted})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Coverage check failed for Smart Deck ${deckId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * A single recording's eligibility/ISVC changed -- find every Smart Deck
   * whose rule could plausibly match it (cheap country/dialect prefilter)
   * and re-evaluate just those, rather than every Smart Deck in the system.
   */
  async evaluateAllRulesFor(recordingId: string): Promise<void> {
    const recording = await this.catalogue.getEligibleRecording(recordingId);
    // A purged/ineligible recording can still be relevant (it may need
    // removing from a Smart Deck it no longer matches), so fall back to
    // evaluating every Smart Deck's rule that has no country/dialect
    // constraint narrow enough to safely rule out -- fetch the raw
    // WordRecording's dialectTag directly for the prefilter in that case.
    const dialectTag =
      recording?.dialectVariant?.dialect.tag ??
      recording?.dialectTag ??
      (
        await this.prisma.wordRecording.findUnique({
          where: { id: recordingId },
          select: { dialectTag: true },
        })
      )?.dialectTag;
    const countryCode = recording?.dialectVariant?.dialect.country.code;

    const candidateDecks = await this.prisma.streamDeck.findMany({
      where: {
        type: StreamDeckType.SMART,
        rule: {
          is: {
            OR: [{ dialectTag: null }, ...(dialectTag ? [{ dialectTag }] : [])],
          },
        },
      },
      select: { id: true, rule: { select: { countryCode: true, dialectTag: true } } },
    });

    const toEvaluate = candidateDecks.filter((deck) => {
      if (!deck.rule?.countryCode) return true;
      return !countryCode || deck.rule.countryCode === countryCode;
    });

    for (const deck of toEvaluate) {
      await this.evaluateRule(deck.id);
    }
  }
}

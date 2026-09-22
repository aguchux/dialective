import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookEventService } from '../../voice-stream/webhooks/webhook-event.service';

/**
 * Tells organizations when a deck they hold loses licence coverage.
 *
 * A deck's coverage decays on its own. Nobody touches the deck; a
 * contributor withdraws, or Dialect Library suspends a licence, and a deck
 * that was fully streamable on Monday is not on Friday. Without a signal, an
 * org discovers this as clips silently vanishing from their manifest or as
 * 403s appearing partway through a training run -- which is a poor
 * experience for something they are paying for, and makes the platform look
 * unreliable when it is in fact honouring a contributor's decision.
 *
 * This is deliberately a NOTIFICATION, not a gate. The rights check has
 * already stopped serving the audio by the time this runs; withdrawal takes
 * effect immediately and is never deferred to suit a subscription. The
 * notification exists so the org can react, not so they can object.
 */
@Injectable()
export class CoverageNotifierService {
  private readonly logger = new Logger(CoverageNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  /**
   * Fan a licence change out to every deck holding the affected recordings.
   *
   * One contributor's withdrawal can touch many decks across many
   * organizations, since their recordings may have been copied into private
   * decks by anyone who licensed them. Each affected org gets one event per
   * deck, carrying how many items changed -- enough to act on without
   * exposing which contributor withdrew, which is not the subscriber's
   * business.
   */
  async notifyCoverageChange(params: {
    recordingIds: string[];
    reason: 'withdrawn' | 'suspended' | 'reinstated';
    agreementId?: string;
  }): Promise<void> {
    if (params.recordingIds.length === 0) return;

    try {
      const affected = await this.prisma.streamDeckItem.findMany({
        where: { recordingId: { in: params.recordingIds } },
        select: {
          recordingId: true,
          deck: { select: { id: true, deckKey: true, organizationId: true } },
        },
      });
      if (affected.length === 0) return;

      const byDeck = new Map<
        string,
        { deckKey: string; organizationId: string; recordingIds: Set<string> }
      >();
      for (const item of affected) {
        const entry = byDeck.get(item.deck.id) ?? {
          deckKey: item.deck.deckKey,
          organizationId: item.deck.organizationId,
          recordingIds: new Set<string>(),
        };
        entry.recordingIds.add(item.recordingId);
        byDeck.set(item.deck.id, entry);
      }

      for (const [deckId, entry] of byDeck) {
        void this.webhookEvents.emit(
          entry.organizationId,
          WebhookEventType.DECK_COVERAGE_CHANGED,
          {
            organization_id: entry.organizationId,
            deck_id: deckId,
            deck_key: entry.deckKey,
            reason: params.reason,
            affected_items: entry.recordingIds.size,
          },
        );
      }

      // One audit row per licence change, not per deck -- the change is a
      // single contributor act; the deck fan-out is its consequence.
      await this.prisma.vdclAuditEvent.create({
        data: {
          agreementId: params.agreementId ?? null,
          eventType: 'coverage_changed',
          detail: `${params.reason}: ${params.recordingIds.length} recordings across ${byDeck.size} decks`,
          metadata: {
            reason: params.reason,
            deckCount: byDeck.size,
            recordingCount: params.recordingIds.length,
          },
        },
      });
    } catch (err) {
      // Never throw: a notification failure must not roll back the
      // withdrawal itself, which has already taken effect and is the thing
      // that actually matters to the contributor.
      this.logger.error(
        `Failed to notify coverage change (${params.reason}): ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /**
   * Convenience wrapper: resolve an agreement's covered recordings, then
   * notify. Used by the withdrawal/suspension paths, which know the
   * agreement but not which clips it froze.
   */
  async notifyForAgreement(
    agreementId: string,
    reason: 'withdrawn' | 'suspended' | 'reinstated',
  ): Promise<void> {
    const items = await this.prisma.vdclManifestItem.findMany({
      where: { manifest: { vdclVersion: { agreementId } } },
      select: { recordingId: true },
    });
    await this.notifyCoverageChange({
      recordingIds: [...new Set(items.map((i) => i.recordingId))],
      reason,
      agreementId,
    });
  }
}

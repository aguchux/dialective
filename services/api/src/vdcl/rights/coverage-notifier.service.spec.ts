import { WebhookEventType } from '@dialectiva/db';
import { CoverageNotifierService } from './coverage-notifier.service';

/**
 * A deck's coverage decays without anyone touching it: a contributor
 * withdraws and every deck holding their recordings loses items. These tests
 * pin down that each affected org is told, once per deck, without learning
 * which contributor withdrew.
 */
describe('CoverageNotifierService', () => {
  function makeService(deckItems: unknown[] = [], manifestItems: unknown[] = []) {
    const prisma = {
      streamDeckItem: { findMany: jest.fn().mockResolvedValue(deckItems) },
      vdclManifestItem: { findMany: jest.fn().mockResolvedValue(manifestItems) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new CoverageNotifierService(prisma as never, webhookEvents as never),
      prisma,
      webhookEvents,
    };
  }

  function deckItem(recordingId: string, deckId: string, organizationId: string) {
    return {
      recordingId,
      deck: { id: deckId, deckKey: `DLSD-${deckId}`, organizationId },
    };
  }

  it('notifies every organization whose deck holds the withdrawn recordings', async () => {
    // One contributor's withdrawal can touch decks across several orgs,
    // since their clips may have been copied into many private decks.
    const { service, webhookEvents } = makeService([
      deckItem('rec-1', 'deck-a', 'org-1'),
      deckItem('rec-2', 'deck-a', 'org-1'),
      deckItem('rec-1', 'deck-b', 'org-2'),
    ]);

    await service.notifyCoverageChange({
      recordingIds: ['rec-1', 'rec-2'],
      reason: 'withdrawn',
    });

    expect(webhookEvents.emit).toHaveBeenCalledTimes(2);
    expect(webhookEvents.emit).toHaveBeenCalledWith(
      'org-1',
      WebhookEventType.DECK_COVERAGE_CHANGED,
      expect.objectContaining({ deck_id: 'deck-a', affected_items: 2, reason: 'withdrawn' }),
    );
    expect(webhookEvents.emit).toHaveBeenCalledWith(
      'org-2',
      WebhookEventType.DECK_COVERAGE_CHANGED,
      expect.objectContaining({ deck_id: 'deck-b', affected_items: 1 }),
    );
  });

  it('never names the contributor in the subscriber-facing payload', async () => {
    // Which contributor withdrew is not the subscriber's business.
    const { service, webhookEvents } = makeService([deckItem('rec-1', 'deck-a', 'org-1')]);

    await service.notifyCoverageChange({
      recordingIds: ['rec-1'],
      reason: 'withdrawn',
      agreementId: 'agreement-secret',
    });

    const payload = webhookEvents.emit.mock.calls[0][2];
    expect(JSON.stringify(payload)).not.toContain('agreement-secret');
  });

  it('emits nothing when no deck holds the affected recordings', async () => {
    const { service, webhookEvents, prisma } = makeService([]);
    await service.notifyCoverageChange({ recordingIds: ['rec-1'], reason: 'withdrawn' });
    expect(webhookEvents.emit).not.toHaveBeenCalled();
    expect(prisma.vdclAuditEvent.create).not.toHaveBeenCalled();
  });

  it('does nothing for an empty recording list', async () => {
    const { service, prisma } = makeService();
    await service.notifyCoverageChange({ recordingIds: [], reason: 'withdrawn' });
    expect(prisma.streamDeckItem.findMany).not.toHaveBeenCalled();
  });

  it('writes one audit row per licence change, not per deck', async () => {
    const { service, prisma } = makeService([
      deckItem('rec-1', 'deck-a', 'org-1'),
      deckItem('rec-1', 'deck-b', 'org-2'),
    ]);

    await service.notifyCoverageChange({
      recordingIds: ['rec-1'],
      reason: 'suspended',
      agreementId: 'a1',
    });

    expect(prisma.vdclAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('never throws when notification fails -- the withdrawal already took effect', async () => {
    // A notification failure must not roll back the contributor's
    // withdrawal, which is the thing that actually matters.
    const { service, prisma } = makeService([deckItem('rec-1', 'deck-a', 'org-1')]);
    prisma.streamDeckItem.findMany.mockRejectedValue(new Error('db down'));

    await expect(
      service.notifyCoverageChange({ recordingIds: ['rec-1'], reason: 'withdrawn' }),
    ).resolves.toBeUndefined();
  });

  describe('notifyForAgreement', () => {
    it('resolves the agreement to its covered recordings, de-duplicated', async () => {
      const { service, prisma } = makeService(
        [deckItem('rec-1', 'deck-a', 'org-1')],
        // The same recording can appear in several versions of one agreement.
        [{ recordingId: 'rec-1' }, { recordingId: 'rec-1' }, { recordingId: 'rec-2' }],
      );

      await service.notifyForAgreement('a1', 'withdrawn');

      expect(prisma.streamDeckItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recordingId: { in: ['rec-1', 'rec-2'] } },
        }),
      );
    });
  });
});

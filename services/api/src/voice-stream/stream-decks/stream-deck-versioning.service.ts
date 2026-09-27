import { Injectable } from '@nestjs/common';
import { Prisma, StreamRecordKind, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { WebhookEventService } from '../webhooks/webhook-event.service';

interface SnapshotItem {
  recordKind: StreamRecordKind;
  recordingId: string;
  durationMs: number | null;
  dialectTag: string;
  subdialectTag: string | null;
  dlCanonicalScore: string | null;
  isvs: string | null;
  isvcVersion: number | null;
}

/**
 * Append-only Stream Deck version snapshots -- direct port of
 * services/isvc-scorer/src/isvc/isvc.service.ts's writeNewVersionIfMaterial
 * pattern (fetch current pointer, full-field-equality check, no-op if
 * unchanged, otherwise create a new versioned row + transactionally repoint
 * the "current" pointer), keyed by deckId instead of recordingId. Doc
 * section 11: version changes should reflect additions, removals, and
 * (per this codebase's confirmed Phase 4a scope) Smart Deck rule matches
 * and eligibility-purge-driven removals -- NOT licensing/deprecation/
 * withdrawal, which have no underlying concept anywhere in this schema.
 */
@Injectable()
export class StreamDeckVersioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  /**
   * Resolves current StreamDeckItem membership into the denormalized field
   * set a version snapshot freezes (doc section 12: recording membership,
   * metadata, DL Canonical Scores, ISVC version references). Ineligible
   * (purged) items are dropped, same posture as
   * StreamManifestService.listEligibleItems.
   */
  private async snapshotCurrentMembership(deckId: string): Promise<SnapshotItem[]> {
    const items = await this.prisma.streamDeckItem.findMany({ where: { deckId } });
    if (items.length === 0) return [];

    const recordings = await Promise.all(
      items.map(async (item) => {
        const recording = await this.catalogue.getEligibleRecording(
          item.recordKind,
          item.recordingId,
        );
        // Kind travels WITH the resolved record: the record itself does not
        // carry it, and the snapshot needs it to distinguish two same-id
        // records of different kinds.
        return recording ? { recordKind: item.recordKind, recording } : null;
      }),
    );
    const eligible = recordings.filter((r): r is NonNullable<typeof r> => r !== null);

    // ISVC exists for word recordings only, so the lookup is scoped to those
    // ids -- querying with a domain-conversation id would simply miss, but
    // filtering makes the intent explicit rather than incidental.
    const isvcCurrents = await this.prisma.isvcCurrent.findMany({
      where: {
        recordingId: {
          in: eligible
            .filter((r) => r.recordKind === StreamRecordKind.WORD_RECORDING)
            .map((r) => r.recording.id),
        },
      },
      include: { aggregation: true },
    });
    const isvcByRecordingId = new Map(isvcCurrents.map((c) => [c.recordingId, c.aggregation]));

    return eligible
      .map(({ recordKind, recording }) => {
        const isvc = isvcByRecordingId.get(recording.id);
        return {
          recordKind,
          recordingId: recording.id,
          durationMs: recording.durationMs,
          dialectTag: recording.dialectVariant?.dialect.tag ?? recording.dialectTag,
          subdialectTag: recording.dialectVariant?.tag ?? null,
          dlCanonicalScore: recording.compositeScore?.toFixed(2) ?? null,
          isvs: isvc ? Number(isvc.isvs).toFixed(2) : null,
          isvcVersion: isvc?.version ?? null,
        };
      })
      // Sorted by (kind, id) so the comparison below lines up the same records
      // on both sides even when two kinds share an id.
      .sort(
        (a, b) =>
          a.recordKind.localeCompare(b.recordKind) || a.recordingId.localeCompare(b.recordingId),
      );
  }

  private snapshotsEqual(a: SnapshotItem[], b: SnapshotItem[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (
        x.recordKind !== y.recordKind ||
        x.recordingId !== y.recordingId ||
        x.durationMs !== y.durationMs ||
        x.dialectTag !== y.dialectTag ||
        x.subdialectTag !== y.subdialectTag ||
        x.dlCanonicalScore !== y.dlCanonicalScore ||
        x.isvs !== y.isvs ||
        x.isvcVersion !== y.isvcVersion
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Computes the fresh membership snapshot and, only if it materially
   * differs from the current version (membership set OR any denormalized
   * field on a still-member recording), creates a new version and
   * transactionally repoints the current-version pointer. No-op (no write
   * at all) when unchanged -- avoids version-spam on a no-op re-evaluation,
   * same posture as isvc-scorer's materiality check.
   */
  async writeNewVersionIfMaterial(deckId: string, reason: string): Promise<void> {
    const fresh = await this.snapshotCurrentMembership(deckId);

    const current = await this.prisma.streamDeckCurrentVersion.findUnique({
      where: { deckId },
      include: { version: { include: { items: true } } },
    });

    if (current) {
      const currentItems: SnapshotItem[] = current.version.items
        .map((item) => ({
          recordKind: item.recordKind,
          recordingId: item.recordingId,
          durationMs: item.durationMs,
          dialectTag: item.dialectTag,
          subdialectTag: item.subdialectTag,
          dlCanonicalScore: item.dlCanonicalScore?.toFixed(2) ?? null,
          isvs: item.isvs ? Number(item.isvs).toFixed(2) : null,
          isvcVersion: item.isvcVersion,
        }))
        // Same (kind, id) ordering as the fresh snapshot, or the comparison
        // would pair up different records and report a spurious change.
        .sort(
          (a, b) =>
            a.recordKind.localeCompare(b.recordKind) || a.recordingId.localeCompare(b.recordingId),
        );

      if (this.snapshotsEqual(fresh, currentItems)) {
        return;
      }
    }

    const nextVersion = (current?.version.version ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      const version = await tx.streamDeckVersion.create({
        data: {
          deckId,
          version: nextVersion,
          itemCount: fresh.length,
          createdReason: reason,
          items: {
            create: fresh.map((item) => ({
              recordKind: item.recordKind,
              recordingId: item.recordingId,
              durationMs: item.durationMs,
              dialectTag: item.dialectTag,
              subdialectTag: item.subdialectTag,
              dlCanonicalScore:
                item.dlCanonicalScore !== null ? new Prisma.Decimal(item.dlCanonicalScore) : null,
              isvs: item.isvs !== null ? new Prisma.Decimal(item.isvs) : null,
              isvcVersion: item.isvcVersion,
            })),
          },
        },
      });
      await tx.streamDeckCurrentVersion.upsert({
        where: { deckId },
        update: { versionId: version.id },
        create: { deckId, versionId: version.id },
      });
      return version;
    });

    const deck = await this.prisma.streamDeck.findUnique({
      where: { id: deckId },
      select: { organizationId: true, deckKey: true },
    });
    if (deck) {
      void this.webhookEvents.emit(deck.organizationId, WebhookEventType.DECK_VERSION_CREATED, {
        organization_id: deck.organizationId,
        deck_id: deckId,
        deck_key: deck.deckKey,
        version: nextVersion,
        reason,
      });
    }
  }
}

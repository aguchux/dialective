import { Injectable } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';

interface SnapshotItem {
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
      items.map((item) => this.catalogue.getEligibleRecording(item.recordingId)),
    );
    const eligible = recordings.filter((r): r is NonNullable<typeof r> => r !== null);

    const isvcCurrents = await this.prisma.isvcCurrent.findMany({
      where: { recordingId: { in: eligible.map((r) => r.id) } },
      include: { aggregation: true },
    });
    const isvcByRecordingId = new Map(isvcCurrents.map((c) => [c.recordingId, c.aggregation]));

    return eligible
      .map((recording) => {
        const isvc = isvcByRecordingId.get(recording.id);
        return {
          recordingId: recording.id,
          durationMs: recording.durationMs,
          dialectTag: recording.dialectVariant?.dialect.tag ?? recording.dialectTag,
          subdialectTag: recording.dialectVariant?.tag ?? null,
          dlCanonicalScore: recording.compositeScore?.toFixed(2) ?? null,
          isvs: isvc ? Number(isvc.isvs).toFixed(2) : null,
          isvcVersion: isvc?.version ?? null,
        };
      })
      .sort((a, b) => a.recordingId.localeCompare(b.recordingId));
  }

  private snapshotsEqual(a: SnapshotItem[], b: SnapshotItem[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (
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
          recordingId: item.recordingId,
          durationMs: item.durationMs,
          dialectTag: item.dialectTag,
          subdialectTag: item.subdialectTag,
          dlCanonicalScore: item.dlCanonicalScore?.toFixed(2) ?? null,
          isvs: item.isvs ? Number(item.isvs).toFixed(2) : null,
          isvcVersion: item.isvcVersion,
        }))
        .sort((a, b) => a.recordingId.localeCompare(b.recordingId));

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
    });
  }
}

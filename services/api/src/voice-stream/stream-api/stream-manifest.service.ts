import { Injectable, NotFoundException } from '@nestjs/common';
import { IsvcConfidence } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';

interface AuthenticatedStreamKey {
  id: string;
  organizationId: string;
  deckId: string | null;
}

/**
 * Deck/item/manifest resolution for machine clients (doc sections 29-30).
 * Every method takes the authenticated StreamKey (not a raw organizationId
 * from the URL) as StreamDecksService's methods do with organizationId --
 * ownership is always re-derived from the credential, never trusted from
 * request params. A deck-scoped key additionally can't read a *different*
 * deck than the one it was minted for, even within the same organization.
 */
@Injectable()
export class StreamManifestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
  ) {}

  private assertKeyCanAccessDeck(streamKey: AuthenticatedStreamKey, deckId: string): void {
    if (streamKey.deckId && streamKey.deckId !== deckId) {
      throw new NotFoundException('Stream Deck not found');
    }
  }

  /** Phase 5 tier gating -- resolves the streamKey's organization's plan floor, if any. Null plan/subscription (shouldn't happen past StreamKeySubscriptionGuard, but defensive) means no floor. */
  private async planMinConfidence(organizationId: string): Promise<IsvcConfidence | undefined> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { plan: { select: { minIsvcConfidence: true } } },
    });
    return subscription?.plan.minIsvcConfidence ?? undefined;
  }

  async listDecks(streamKey: AuthenticatedStreamKey) {
    return this.prisma.streamDeck.findMany({
      where: {
        organizationId: streamKey.organizationId,
        ...(streamKey.deckId ? { id: streamKey.deckId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeck(streamKey: AuthenticatedStreamKey, deckId: string) {
    this.assertKeyCanAccessDeck(streamKey, deckId);
    const deck = await this.prisma.streamDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.organizationId !== streamKey.organizationId) {
      throw new NotFoundException('Stream Deck not found');
    }
    return deck;
  }

  /**
   * Eligible items only -- StreamDeckItem.recordingId has no FK to
   * WordRecording (a recording can be purged after being added to a deck),
   * so ineligible items are silently excluded here rather than surfaced as
   * errors, matching the loose-coupling this table was designed around.
   */
  async listEligibleItems(streamKey: AuthenticatedStreamKey, deckId: string) {
    await this.getDeck(streamKey, deckId);
    const items = await this.prisma.streamDeckItem.findMany({
      where: { deckId },
      orderBy: { addedAt: 'desc' },
    });
    const minConfidence = await this.planMinConfidence(streamKey.organizationId);
    const recordings = await Promise.all(
      items.map((item) => this.catalogue.getEligibleRecording(item.recordingId, minConfidence)),
    );
    return items
      .map((item, i) => ({ item, recording: recordings[i] }))
      .filter(
        (
          row,
        ): row is {
          item: (typeof items)[number];
          recording: NonNullable<(typeof recordings)[number]>;
        } => row.recording !== null,
      );
  }

  async getEligibleItemMetadata(
    streamKey: AuthenticatedStreamKey,
    deckId: string,
    recordingId: string,
  ) {
    await this.getDeck(streamKey, deckId);
    const membership = await this.prisma.streamDeckItem.findUnique({
      where: { deckId_recordingId: { deckId, recordingId } },
    });
    if (!membership) {
      throw new NotFoundException('Recording not found in this Stream Deck');
    }
    const minConfidence = await this.planMinConfidence(streamKey.organizationId);
    const recording = await this.catalogue.getEligibleRecording(recordingId, minConfidence);
    if (!recording) {
      throw new NotFoundException('Recording not found or not available for Voice Stream');
    }
    return recording;
  }

  /**
   * Doc section 30's manifest shape, now including `version`. Without a
   * `version` param, returns live current membership (recomputed from
   * WordRecording/IsvcCurrent every call) plus the current version number
   * for reference. With `version`, returns the frozen
   * StreamDeckVersionItem snapshot from that exact version -- no live
   * eligibility re-check, since the snapshot already captured eligibility
   * at that point in time (doc section 12's reproducibility guarantee).
   */
  async getManifest(streamKey: AuthenticatedStreamKey, deckId: string, version?: number) {
    const deck = await this.getDeck(streamKey, deckId);

    if (version !== undefined) {
      return this.getPinnedManifest(deck, version);
    }

    const eligible = await this.listEligibleItems(streamKey, deckId);
    const isvcByRecordingId = await this.currentIsvcByRecordingId(
      eligible.map(({ recording }) => recording.id),
    );
    const totalDurationMs = eligible.reduce(
      (sum, { recording }) => sum + (recording.durationMs ?? 0),
      0,
    );
    const current = await this.prisma.streamDeckCurrentVersion.findUnique({
      where: { deckId },
      select: { version: { select: { version: true } } },
    });

    return {
      deck_id: deck.deckKey,
      version: current?.version.version ?? 0,
      items: eligible.length,
      audio_hours: Number((totalDurationMs / 1000 / 60 / 60).toFixed(2)),
      records: eligible.map(({ recording }) => {
        const isvc = isvcByRecordingId.get(recording.id);
        return {
          id: recording.id,
          duration_ms: recording.durationMs,
          language: recording.dialectVariant?.dialect.tag ?? recording.dialectTag,
          dialect: recording.dialectVariant?.dialect.tag ?? recording.dialectTag,
          subdialect: recording.dialectVariant?.tag ?? null,
          dl_score: recording.compositeScore,
          isvs: isvc?.isvs ?? null,
          isvc_version: isvc?.version ?? null,
          audio_endpoint: `/stream/v1/decks/${deck.deckKey}/items/${recording.id}/audio`,
        };
      }),
    };
  }

  private async getPinnedManifest(deck: { id: string; deckKey: string }, version: number) {
    const versionRow = await this.prisma.streamDeckVersion.findUnique({
      where: { deckId_version: { deckId: deck.id, version } },
      include: { items: true },
    });
    if (!versionRow) {
      throw new NotFoundException(`Version ${version} not found for this Stream Deck`);
    }

    const totalDurationMs = versionRow.items.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);

    return {
      deck_id: deck.deckKey,
      version: versionRow.version,
      items: versionRow.items.length,
      audio_hours: Number((totalDurationMs / 1000 / 60 / 60).toFixed(2)),
      records: versionRow.items.map((item) => ({
        id: item.recordingId,
        duration_ms: item.durationMs,
        language: item.dialectTag,
        dialect: item.dialectTag,
        subdialect: item.subdialectTag,
        dl_score: item.dlCanonicalScore,
        isvs: item.isvs,
        isvc_version: item.isvcVersion,
        audio_endpoint: `/stream/v1/decks/${deck.deckKey}/items/${item.recordingId}/audio`,
      })),
    };
  }

  /** Doc section 29's `GET .../versions` -- newest first. */
  async listVersions(streamKey: AuthenticatedStreamKey, deckId: string) {
    await this.getDeck(streamKey, deckId);
    return this.prisma.streamDeckVersion.findMany({
      where: { deckId },
      orderBy: { version: 'desc' },
      select: { version: true, itemCount: true, createdAt: true, createdReason: true },
    });
  }

  /**
   * Doc section 31's change feed -- diffs `afterVersion` against the
   * current version's frozen item sets. `added`/`removed` are recordingId
   * set differences; `updated` counts recordings present in both versions
   * whose denormalized fields (score/ISVS/etc.) differ between them.
   */
  async getChanges(streamKey: AuthenticatedStreamKey, deckId: string, afterVersion: number) {
    const deck = await this.getDeck(streamKey, deckId);

    const current = await this.prisma.streamDeckCurrentVersion.findUnique({
      where: { deckId },
      select: { version: { select: { version: true } } },
    });
    const toVersion = current?.version.version ?? 0;
    if (afterVersion >= toVersion) {
      throw new NotFoundException(
        `Version ${afterVersion} is not older than this deck's current version (${toVersion})`,
      );
    }

    const fromRow = await this.prisma.streamDeckVersion.findUnique({
      where: { deckId_version: { deckId: deck.id, version: afterVersion } },
      include: { items: true },
    });
    if (!fromRow) {
      throw new NotFoundException(`Version ${afterVersion} not found for this Stream Deck`);
    }
    const toRow = await this.prisma.streamDeckVersion.findUnique({
      where: { deckId_version: { deckId: deck.id, version: toVersion } },
      include: { items: true },
    });
    if (!toRow) {
      throw new NotFoundException(`Version ${toVersion} not found for this Stream Deck`);
    }

    const fromById = new Map(fromRow.items.map((item) => [item.recordingId, item]));
    const toById = new Map(toRow.items.map((item) => [item.recordingId, item]));

    let added = 0;
    let updated = 0;
    for (const [recordingId, toItem] of toById) {
      const fromItem = fromById.get(recordingId);
      if (!fromItem) {
        added++;
      } else if (
        fromItem.durationMs !== toItem.durationMs ||
        fromItem.dialectTag !== toItem.dialectTag ||
        fromItem.subdialectTag !== toItem.subdialectTag ||
        fromItem.dlCanonicalScore?.toString() !== toItem.dlCanonicalScore?.toString() ||
        fromItem.isvs?.toString() !== toItem.isvs?.toString() ||
        fromItem.isvcVersion !== toItem.isvcVersion
      ) {
        updated++;
      }
    }
    let removed = 0;
    for (const recordingId of fromById.keys()) {
      if (!toById.has(recordingId)) removed++;
    }

    return { from_version: afterVersion, to_version: toVersion, added, removed, updated };
  }

  async getUsageSummary(streamKey: AuthenticatedStreamKey, deckId?: string) {
    if (deckId) {
      this.assertKeyCanAccessDeck(streamKey, deckId);
    }
    const where = {
      organizationId: streamKey.organizationId,
      ...(deckId ? { deckId } : {}),
      ...(streamKey.deckId ? { streamApiKeyId: streamKey.id } : {}),
    };
    const [totalRequests, audioRows] = await Promise.all([
      this.prisma.streamAccessLog.count({ where }),
      this.prisma.streamAccessLog.findMany({
        where: { ...where, requestType: 'audio' },
        select: { bytesStreamed: true },
      }),
    ]);
    const totalBytesStreamed = audioRows.reduce(
      (sum, row) => sum + (row.bytesStreamed ?? BigInt(0)),
      BigInt(0),
    );
    return {
      total_requests: totalRequests,
      audio_requests: audioRows.length,
      total_bytes_streamed: totalBytesStreamed.toString(),
    };
  }

  private async currentIsvcByRecordingId(recordingIds: string[]) {
    if (recordingIds.length === 0) return new Map<string, { isvs: unknown; version: number }>();
    const currents = await this.prisma.isvcCurrent.findMany({
      where: { recordingId: { in: recordingIds } },
      include: { aggregation: true },
    });
    return new Map(
      currents.map((c) => [
        c.recordingId,
        { isvs: c.aggregation.isvs, version: c.aggregation.version },
      ]),
    );
  }
}

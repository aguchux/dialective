import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProvenanceReport {
  deckId: string;
  deckKey: string;
  version: number;
  itemCount: number;
  createdAt: Date;
  createdReason: string;
  rows: Record<string, unknown>[];
}

/**
 * Doc section 62's "model-training provenance reports" -- the frozen
 * StreamDeckVersionItem snapshot IS the provenance record (doc section 12's
 * reproducibility guarantee already froze dlCanonicalScore/isvs/isvcVersion
 * at versioning time); this just exposes it as a report, joined back to
 * WordRecording for createdAt/country since the version item alone doesn't
 * carry those. Deliberately org-level only -- no trainer identity is ever
 * surfaced to subscribers, matching this codebase's consistent stance.
 */
@Injectable()
export class ProvenanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, deckId: string, version: number): Promise<ProvenanceReport> {
    const deck = await this.prisma.streamDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.organizationId !== organizationId) {
      throw new NotFoundException('Stream Deck not found');
    }

    const versionRow = await this.prisma.streamDeckVersion.findUnique({
      where: { deckId_version: { deckId, version } },
      include: { items: true },
    });
    if (!versionRow) {
      throw new NotFoundException(`Version ${version} not found for this Stream Deck`);
    }

    const recordings = await this.prisma.wordRecording.findMany({
      where: { id: { in: versionRow.items.map((i) => i.recordingId) } },
      select: {
        id: true,
        createdAt: true,
        dialectVariant: { select: { dialect: { select: { country: { select: { code: true } } } } } },
      },
    });
    const recordingById = new Map(recordings.map((r) => [r.id, r]));

    return {
      deckId: deck.id,
      deckKey: deck.deckKey,
      version: versionRow.version,
      itemCount: versionRow.items.length,
      createdAt: versionRow.createdAt,
      createdReason: versionRow.createdReason,
      rows: versionRow.items.map((item) => {
        const recording = recordingById.get(item.recordingId);
        return {
          recordingId: item.recordingId,
          dialectTag: item.dialectTag,
          subdialectTag: item.subdialectTag,
          countryCode: recording?.dialectVariant?.dialect.country.code ?? null,
          durationMs: item.durationMs,
          dlCanonicalScore: item.dlCanonicalScore ? Number(item.dlCanonicalScore) : null,
          isvs: item.isvs ? Number(item.isvs) : null,
          isvcVersion: item.isvcVersion,
          recordingCreatedAt: recording?.createdAt ?? null,
        };
      }),
    };
  }
}

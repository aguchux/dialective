import { NotFoundException } from '@nestjs/common';
import { ProvenanceReportService } from './provenance-report.service';

function setup() {
  const prisma = {
    streamDeck: { findUnique: jest.fn() },
    streamDeckVersion: { findUnique: jest.fn() },
    wordRecording: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ProvenanceReportService(prisma as any);
  return { prisma, service };
}

describe('ProvenanceReportService.build', () => {
  it('rejects a deck belonging to another organization', async () => {
    const { prisma, service } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'other-org' });

    await expect(service.build('org-1', 'deck-1', 1)).rejects.toThrow(NotFoundException);
  });

  it('rejects a version that does not exist for this deck', async () => {
    const { prisma, service } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamDeckVersion.findUnique.mockResolvedValue(null);

    await expect(service.build('org-1', 'deck-1', 99)).rejects.toThrow(NotFoundException);
  });

  it('builds provenance rows joined back to WordRecording for country/createdAt', async () => {
    const { prisma, service } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'DLSD-NG-IGB-NSK-A1B2C3',
    });
    prisma.streamDeckVersion.findUnique.mockResolvedValue({
      version: 2,
      itemCount: 1,
      createdAt: new Date('2026-02-01'),
      createdReason: 'manual_add',
      items: [
        {
          recordingId: 'rec-1',
          durationMs: 4000,
          dialectTag: 'igbo',
          subdialectTag: 'nsukka',
          dlCanonicalScore: '92.50',
          isvs: '88.00',
          isvcVersion: 3,
        },
      ],
    });
    prisma.wordRecording.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        createdAt: new Date('2026-01-15'),
        dialectVariant: { dialect: { country: { code: 'NG' } } },
      },
    ]);

    const report = await service.build('org-1', 'deck-1', 2);

    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        recordingId: 'rec-1',
        countryCode: 'NG',
        dlCanonicalScore: 92.5,
        isvs: 88,
        isvcVersion: 3,
      }),
    );
  });

  it('leaves countryCode/recordingCreatedAt null for a recording that no longer resolves', async () => {
    const { prisma, service } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'DLSD-X',
    });
    prisma.streamDeckVersion.findUnique.mockResolvedValue({
      version: 1,
      itemCount: 1,
      createdAt: new Date(),
      createdReason: 'manual_add',
      items: [
        {
          recordingId: 'rec-purged',
          durationMs: null,
          dialectTag: 'igbo',
          subdialectTag: null,
          dlCanonicalScore: null,
          isvs: null,
          isvcVersion: null,
        },
      ],
    });

    const report = await service.build('org-1', 'deck-1', 1);

    expect(report.rows[0]).toEqual(
      expect.objectContaining({ countryCode: null, recordingCreatedAt: null }),
    );
  });
});

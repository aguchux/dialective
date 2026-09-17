import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PublicDecksService } from './public-decks.service';

function setup() {
  const prisma = {
    streamDeck: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    deckLicense: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
    deckLicenseAcceptance: { findUnique: jest.fn(), upsert: jest.fn() },
    streamDeckItem: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    isvcCurrent: { findMany: jest.fn().mockResolvedValue([]) },
    validationQueueItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  const catalogue = { isEligible: jest.fn().mockResolvedValue(true) };
  const decks = { create: jest.fn(), get: jest.fn() };
  const versioning = { writeNewVersionIfMaterial: jest.fn().mockResolvedValue(undefined) };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PublicDecksService(
    prisma as any,
    catalogue as any,
    decks as any,
    versioning as any,
    orgActivity as any,
  );
  return { prisma, catalogue, decks, versioning, orgActivity, service };
}

describe('PublicDecksService', () => {
  describe('setVisibility', () => {
    it('rejects when the caller does not own the deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-OTHER' });

      await expect(
        service.setVisibility('org-1', 'deck-1', 'user-1', 'PUBLIC' as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates visibility for an owned deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        visibility: 'PRIVATE',
      });
      prisma.streamDeck.update.mockResolvedValue({ id: 'deck-1', visibility: 'PUBLIC' });

      await service.setVisibility('org-1', 'deck-1', 'user-1', 'PUBLIC' as any);

      expect(prisma.streamDeck.update).toHaveBeenCalledWith({
        where: { id: 'deck-1' },
        data: { visibility: 'PUBLIC' },
      });
    });

    it('logs a DECK_VISIBILITY_CHANGED activity event only when visibility actually changes', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        visibility: 'PRIVATE',
      });
      prisma.streamDeck.update.mockResolvedValue({ id: 'deck-1', visibility: 'PUBLIC' });

      await service.setVisibility('org-1', 'deck-1', 'user-1', 'PUBLIC' as any);

      expect(orgActivity.record).toHaveBeenCalledWith(
        'org-1',
        'DECK_VISIBILITY_CHANGED',
        'user-1',
        expect.objectContaining({
          deckId: 'deck-1',
          previousVisibility: 'PRIVATE',
          newVisibility: 'PUBLIC',
        }),
      );
    });

    it('does not log an activity event when visibility is set to its current value', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        visibility: 'PRIVATE',
      });
      prisma.streamDeck.update.mockResolvedValue({ id: 'deck-1', visibility: 'PRIVATE' });

      await service.setVisibility('org-1', 'deck-1', 'user-1', 'PRIVATE' as any);

      expect(orgActivity.record).not.toHaveBeenCalled();
    });
  });

  describe('listPublic', () => {
    it("excludes the caller organization's own decks", async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findMany.mockResolvedValue([]);

      await service.listPublic('org-1');

      expect(prisma.streamDeck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { visibility: 'PUBLIC', organizationId: { not: 'org-1' } },
        }),
      );
    });

    it('filters out decks whose minimum item tier is below minQualityTier', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findMany.mockResolvedValue([
        {
          id: 'deck-standard',
          deckKey: 'DLSD-A',
          name: 'Standard deck',
          organizationId: 'org-2',
          organization: { name: 'Org 2' },
          createdAt: new Date(),
          license: null,
          items: [{ recordingId: 'rec-1' }],
          _count: { items: 1 },
        },
        {
          id: 'deck-premium',
          deckKey: 'DLSD-B',
          name: 'Premium deck',
          organizationId: 'org-3',
          organization: { name: 'Org 3' },
          createdAt: new Date(),
          license: null,
          items: [{ recordingId: 'rec-2' }],
          _count: { items: 1 },
        },
      ]);
      // rec-1 has no ISVC (standard); rec-2 is premium_verified.
      prisma.isvcCurrent.findMany.mockImplementation(({ where }: any) => {
        if (where.recordingId.in.includes('rec-2')) {
          return Promise.resolve([
            {
              recordingId: 'rec-2',
              aggregation: { confidence: 'VERY_HIGH', organizationCount: 5 },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.listPublic('org-1', 'premium_verified');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('deck-premium');
    });
  });

  describe('listPublic license acceptance', () => {
    it('reports licenseAccepted true when there is no license at all', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findMany.mockResolvedValue([
        {
          id: 'deck-1',
          deckKey: 'DLSD-A',
          name: 'Deck',
          organizationId: 'org-2',
          organization: { name: 'Org 2' },
          createdAt: new Date(),
          license: null,
          items: [],
          _count: { items: 0 },
        },
      ]);

      const [result] = await service.listPublic('org-1');

      expect(result.hasLicense).toBe(false);
      expect(result.licenseAccepted).toBe(true);
    });

    it('reports licenseAccepted false until the caller org has an acceptance row', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findMany.mockResolvedValue([
        {
          id: 'deck-1',
          deckKey: 'DLSD-A',
          name: 'Deck',
          organizationId: 'org-2',
          organization: { name: 'Org 2' },
          createdAt: new Date(),
          license: {
            termsSummary: 'Terms',
            attributionRequired: true,
            redistributionAllowed: false,
            acceptances: [],
          },
          items: [],
          _count: { items: 0 },
        },
      ]);

      const [result] = await service.listPublic('org-1');

      expect(result.hasLicense).toBe(true);
      expect(result.licenseAccepted).toBe(false);
    });
  });

  describe('acceptLicense', () => {
    it('rejects accepting a license on your own deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        visibility: 'PUBLIC',
      });

      await expect(service.acceptLicense('org-1', 'user-1', 'deck-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s on a private deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-2',
        visibility: 'PRIVATE',
      });

      await expect(service.acceptLicense('org-1', 'user-1', 'deck-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('records acceptance for a public deck with a license', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-2',
        visibility: 'PUBLIC',
      });
      prisma.deckLicense.findUnique.mockResolvedValue({ id: 'license-1' });
      prisma.deckLicenseAcceptance.upsert.mockResolvedValue({ id: 'accept-1' });

      await service.acceptLicense('org-1', 'user-1', 'deck-1');

      expect(prisma.deckLicenseAcceptance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { licenseId_organizationId: { licenseId: 'license-1', organizationId: 'org-1' } },
        }),
      );
    });
  });

  describe('copyToOwnDeck', () => {
    it('blocks the copy when the deck has an unaccepted license', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-2',
        visibility: 'PUBLIC',
      });
      prisma.deckLicense.findUnique.mockResolvedValue({ id: 'license-1' });
      prisma.deckLicenseAcceptance.findUnique.mockResolvedValue(null);

      await expect(service.copyToOwnDeck('org-1', 'user-1', 'deck-1', 'My copy')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.streamDeckItem.findMany).not.toHaveBeenCalled();
    });

    it('copies eligible items into a newly created deck when no license blocks it', async () => {
      const { prisma, catalogue, decks, versioning, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-2',
        visibility: 'PUBLIC',
      });
      prisma.deckLicense.findUnique.mockResolvedValue(null);
      prisma.streamDeckItem.findMany.mockResolvedValue([
        { recordingId: 'rec-1' },
        { recordingId: 'rec-2' },
      ]);
      prisma.streamDeckItem.findUnique.mockResolvedValue(null);
      catalogue.isEligible.mockResolvedValue(true);
      decks.create.mockResolvedValue({ id: 'new-deck-1' });
      decks.get.mockResolvedValue({ id: 'new-deck-1', name: 'My copy' });

      const result = await service.copyToOwnDeck('org-1', 'user-1', 'deck-1', 'My copy');

      expect(decks.create).toHaveBeenCalledWith('org-1', 'user-1', { name: 'My copy' });
      expect(prisma.streamDeckItem.create).toHaveBeenCalledTimes(2);
      expect(versioning.writeNewVersionIfMaterial).toHaveBeenCalledWith(
        'new-deck-1',
        'copied_from_public_deck',
      );
      expect(result).toEqual({ id: 'new-deck-1', name: 'My copy' });
    });

    it('skips ineligible (purged) recordings when copying', async () => {
      const { prisma, catalogue, decks, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-2',
        visibility: 'PUBLIC',
      });
      prisma.deckLicense.findUnique.mockResolvedValue(null);
      prisma.streamDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-purged' }]);
      catalogue.isEligible.mockResolvedValue(false);
      decks.create.mockResolvedValue({ id: 'new-deck-1' });
      decks.get.mockResolvedValue({ id: 'new-deck-1' });

      await service.copyToOwnDeck('org-1', 'user-1', 'deck-1', 'My copy');

      expect(prisma.streamDeckItem.create).not.toHaveBeenCalled();
    });
  });

  describe('importToValidationQueue', () => {
    it('queues eligible recordings not already queued', async () => {
      const { prisma, catalogue, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-2',
        visibility: 'PUBLIC',
      });
      prisma.deckLicense.findUnique.mockResolvedValue(null);
      prisma.streamDeckItem.findMany.mockResolvedValue([
        { recordingId: 'rec-1' },
        { recordingId: 'rec-2' },
      ]);
      prisma.validationQueueItem.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });
      catalogue.isEligible.mockResolvedValue(true);

      const result = await service.importToValidationQueue('org-1', 'user-1', 'deck-1');

      expect(prisma.validationQueueItem.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ queued: 1, alreadyQueued: 1 });
    });
  });

  describe('removeFromValidationQueue', () => {
    it('404s when the item belongs to a different organization', async () => {
      const { prisma, service } = setup();
      prisma.validationQueueItem.findUnique.mockResolvedValue({
        id: 'item-1',
        organizationId: 'org-OTHER',
      });

      await expect(service.removeFromValidationQueue('org-1', 'item-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

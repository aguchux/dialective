import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StreamDecksService } from './stream-decks.service';

function setup() {
  const prisma = {
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    streamDeck: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    streamDeckItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const catalogue = { isEligible: jest.fn().mockResolvedValue(true) };
  const service = new StreamDecksService(prisma as any, catalogue as any);
  return { prisma, catalogue, service };
}

describe('StreamDecksService', () => {
  describe('create', () => {
    it('generates a DLSD-prefixed deck key with GEN fallbacks when no scope is given', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.create.mockImplementation(({ data }: any) => ({ id: 'deck-1', ...data }));

      const deck = await service.create('org-1', 'user-1', { name: 'My Deck' });

      expect(deck.deckKey).toMatch(/^DLSD-GEN-GEN-GEN-[A-F0-9]{6}$/);
      expect(prisma.streamDeck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1', createdByUserId: 'user-1' }),
        }),
      );
    });

    it('incorporates country/dialect/subdialect scope into the deck key', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.create.mockImplementation(({ data }: any) => ({ id: 'deck-1', ...data }));

      const deck = await service.create('org-1', 'user-1', {
        name: 'Igbo Deck',
        countryCode: 'ng',
        dialectTag: 'igbo',
        subdialectTag: 'nsukka',
      });

      expect(deck.deckKey).toMatch(/^DLSD-NG-IGBO-NSUKKA-[A-F0-9]{6}$/);
    });

    it('rejects creating beyond the plan\'s maxStreamDecks limit', async () => {
      const { prisma, service } = setup();
      prisma.subscription.findUnique.mockResolvedValue({ plan: { maxStreamDecks: 2 } });
      prisma.streamDeck.count.mockResolvedValue(2);

      await expect(service.create('org-1', 'user-1', { name: 'Deck 3' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.streamDeck.create).not.toHaveBeenCalled();
    });
  });

  describe('addItem', () => {
    it('rejects a recording that is not eligible for the catalogue', async () => {
      const { prisma, catalogue, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      catalogue.isEligible.mockResolvedValue(false);

      await expect(service.addItem('org-1', 'deck-1', 'user-1', 'rec-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects adding a recording already in the deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      prisma.streamDeckItem.findUnique.mockResolvedValue({ id: 'item-1' });

      await expect(service.addItem('org-1', 'deck-1', 'user-1', 'rec-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('adds an eligible, not-yet-added recording', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      prisma.streamDeckItem.findUnique.mockResolvedValue(null);
      prisma.streamDeckItem.create.mockResolvedValue({ id: 'item-1' });

      const result = await service.addItem('org-1', 'deck-1', 'user-1', 'rec-1');

      expect(prisma.streamDeckItem.create).toHaveBeenCalledWith({
        data: { deckId: 'deck-1', recordingId: 'rec-1', addedByUserId: 'user-1' },
      });
      expect(result).toEqual({ id: 'item-1' });
    });

    it('rejects operating on a deck belonging to a different organization', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'other-org',
        items: [],
      });

      await expect(service.addItem('org-1', 'deck-1', 'user-1', 'rec-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StreamDeckType } from '@dialectiva/db';
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
    streamDeckRule: { upsert: jest.fn() },
    streamDeckVersion: { findMany: jest.fn() },
  };
  const catalogue = { isEligible: jest.fn().mockResolvedValue(true) };
  const versioning = { writeNewVersionIfMaterial: jest.fn().mockResolvedValue(undefined) };
  const smartDeckEvaluator = { evaluateRule: jest.fn().mockResolvedValue(undefined) };
  const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new StreamDecksService(
    prisma as any,
    catalogue as any,
    versioning as any,
    smartDeckEvaluator as any,
    webhookEvents as any,
    orgActivity as any,
  );
  return { prisma, catalogue, versioning, smartDeckEvaluator, webhookEvents, orgActivity, service };
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

    it('logs a DECK_CREATED activity event', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.create.mockImplementation(({ data }: any) => ({ id: 'deck-1', ...data }));

      await service.create('org-1', 'user-1', { name: 'My Deck' });

      expect(orgActivity.record).toHaveBeenCalledWith(
        'org-1',
        'DECK_CREATED',
        'user-1',
        expect.objectContaining({ deckId: 'deck-1' }),
      );
    });
  });

  describe('rename', () => {
    it('logs a DECK_RENAMED activity event with before/after names', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        name: 'Old Name',
        items: [],
      });
      prisma.streamDeck.update.mockResolvedValue({ id: 'deck-1', name: 'New Name' });

      await service.rename('org-1', 'deck-1', 'user-1', 'New Name');

      expect(orgActivity.record).toHaveBeenCalledWith(
        'org-1',
        'DECK_RENAMED',
        'user-1',
        expect.objectContaining({ deckId: 'deck-1', previousName: 'Old Name', newName: 'New Name' }),
      );
    });
  });

  describe('remove', () => {
    it('logs a DECK_DELETED activity event', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        deckKey: 'DLSD-GEN-GEN-GEN-ABC123',
        name: 'My Deck',
        items: [],
      });

      await service.remove('org-1', 'deck-1', 'user-1');

      expect(prisma.streamDeck.delete).toHaveBeenCalledWith({ where: { id: 'deck-1' } });
      expect(orgActivity.record).toHaveBeenCalledWith(
        'org-1',
        'DECK_DELETED',
        'user-1',
        expect.objectContaining({ deckId: 'deck-1' }),
      );
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

    it('logs a DECK_ITEM_ADDED activity event', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      prisma.streamDeckItem.findUnique.mockResolvedValue(null);
      prisma.streamDeckItem.create.mockResolvedValue({ id: 'item-1' });

      await service.addItem('org-1', 'deck-1', 'user-1', 'rec-1');

      expect(orgActivity.record).toHaveBeenCalledWith(
        'org-1',
        'DECK_ITEM_ADDED',
        'user-1',
        expect.objectContaining({ deckId: 'deck-1', recordingId: 'rec-1' }),
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

    it('triggers a version write after a successful add', async () => {
      const { prisma, versioning, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      prisma.streamDeckItem.findUnique.mockResolvedValue(null);
      prisma.streamDeckItem.create.mockResolvedValue({ id: 'item-1' });

      await service.addItem('org-1', 'deck-1', 'user-1', 'rec-1');

      expect(versioning.writeNewVersionIfMaterial).toHaveBeenCalledWith('deck-1', 'manual_add');
    });

    it('rejects manual add on a Smart Deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        type: StreamDeckType.SMART,
        items: [],
      });

      await expect(service.addItem('org-1', 'deck-1', 'user-1', 'rec-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('removeItem', () => {
    it('triggers a version write after a successful remove', async () => {
      const { prisma, versioning, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      prisma.streamDeckItem.findUnique.mockResolvedValue({ id: 'item-1', deckId: 'deck-1' });

      await service.removeItem('org-1', 'deck-1', 'user-1', 'item-1');

      expect(versioning.writeNewVersionIfMaterial).toHaveBeenCalledWith('deck-1', 'manual_remove');
    });

    it('logs a DECK_ITEM_REMOVED activity event', async () => {
      const { prisma, orgActivity, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1', items: [] });
      prisma.streamDeckItem.findUnique.mockResolvedValue({ id: 'item-1', deckId: 'deck-1', recordingId: 'rec-1' });

      await service.removeItem('org-1', 'deck-1', 'user-1', 'item-1');

      expect(orgActivity.record).toHaveBeenCalledWith(
        'org-1',
        'DECK_ITEM_REMOVED',
        'user-1',
        expect.objectContaining({ deckId: 'deck-1', recordingId: 'rec-1' }),
      );
    });

    it('rejects manual remove on a Smart Deck', async () => {
      const { prisma, service } = setup();
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        organizationId: 'org-1',
        type: StreamDeckType.SMART,
        items: [],
      });

      await expect(service.removeItem('org-1', 'deck-1', 'user-1', 'item-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('create (Smart Deck)', () => {
    it('rejects a SMART deck created without a rule', async () => {
      const { service } = setup();

      await expect(
        service.create('org-1', 'user-1', { name: 'Smart Deck', type: StreamDeckType.SMART }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the rule row and evaluates it for a SMART deck', async () => {
      const { prisma, smartDeckEvaluator, service } = setup();
      prisma.streamDeck.create.mockImplementation(({ data }: any) => ({
        id: 'deck-1',
        ...data,
      }));

      await service.create('org-1', 'user-1', {
        name: 'Smart Deck',
        type: StreamDeckType.SMART,
        rule: { minScore: 90 },
      });

      expect(prisma.streamDeck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StreamDeckType.SMART,
            rule: { create: { minScore: 90 } },
          }),
        }),
      );
      expect(smartDeckEvaluator.evaluateRule).toHaveBeenCalledWith('deck-1');
    });
  });
});

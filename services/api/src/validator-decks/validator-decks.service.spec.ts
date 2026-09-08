import { ValidatorDecksService } from './validator-decks.service';

describe('ValidatorDecksService', () => {
  let prisma: any;
  let settings: any;
  let service: ValidatorDecksService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      validatorDeck: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      validatorDeckItem: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      validatorDeckAuditLog: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-created-log' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' }),
      },
      wordRecording: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rec-1' }),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
    };
    settings = {
      getValidationRewardPerRecording: jest.fn().mockResolvedValue(0),
      getValidatorDeckMaxItems: jest.fn().mockResolvedValue(2000),
    };
    service = new ValidatorDecksService(prisma, settings);
  });

  describe('create', () => {
    it('creates a DRAFT deck owned by its creator', async () => {
      prisma.validatorDeck.create.mockResolvedValue({ id: 'deck-1' });
      await service.create('user-1', { name: 'My Deck' });
      expect(prisma.validatorDeck.create).toHaveBeenCalledWith({
        data: {
          name: 'My Deck',
          dialectTag: undefined,
          countryCode: undefined,
          createdByUserId: 'user-1',
          ownerUserId: 'user-1',
        },
      });
    });
  });

  describe('list', () => {
    it('filters to the caller-owned decks when filter=mine', async () => {
      await service.list('mine', 'user-1');
      expect(prisma.validatorDeck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerUserId: 'user-1' } }),
      );
    });

    it('returns every deck when filter=all', async () => {
      await service.list('all', 'user-1');
      expect(prisma.validatorDeck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  describe('ownership/editability gates', () => {
    it('lets any validator view a deck they do not own', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'other-user',
        status: 'DRAFT',
        items: [],
      });
      const result = await service.get('deck-1');
      expect(result.id).toBe('deck-1');
    });

    it('rejects editing a deck owned by someone else', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'other-user',
        status: 'DRAFT',
      });
      await expect(
        service.update('deck-1', 'user-1', 'VALIDATOR', { name: 'Renamed' }),
      ).rejects.toThrow('Only the deck owner or an admin can edit this deck');
    });

    it('lets an admin edit a deck they do not own', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'other-user',
        status: 'DRAFT',
      });
      prisma.validatorDeck.update.mockResolvedValue({ id: 'deck-1', name: 'Renamed' });
      await service.update('deck-1', 'admin-1', 'ADMIN', { name: 'Renamed' });
      expect(prisma.validatorDeck.update).toHaveBeenCalled();
    });

    it('rejects editing a deck that is no longer DRAFT', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'PUBLISHED',
      });
      await expect(
        service.update('deck-1', 'user-1', 'VALIDATOR', { name: 'Renamed' }),
      ).rejects.toThrow('Only a draft deck can be edited');
    });
  });

  describe('addItem', () => {
    beforeEach(() => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
    });

    it('adds a recording to the deck', async () => {
      prisma.validatorDeckItem.findUnique.mockResolvedValue(null);
      prisma.validatorDeckItem.create.mockResolvedValue({ id: 'item-1' });
      await service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1');
      expect(prisma.validatorDeckItem.create).toHaveBeenCalledWith({
        data: { deckId: 'deck-1', recordingId: 'rec-1', addedByUserId: 'user-1' },
      });
    });

    it('rejects a duplicate recording', async () => {
      prisma.validatorDeckItem.findUnique.mockResolvedValue({ id: 'existing-item' });
      await expect(service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1')).rejects.toThrow(
        'This recording is already in the deck',
      );
    });

    it('rejects a recording that does not exist', async () => {
      prisma.wordRecording.findUnique.mockResolvedValue(null);
      await expect(service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-missing')).rejects.toThrow(
        'Recording not found',
      );
    });

    it('enforces the platform-configured max-items cap', async () => {
      settings.getValidatorDeckMaxItems.mockResolvedValue(1);
      prisma.validatorDeckItem.findUnique.mockResolvedValue(null);
      prisma.validatorDeckItem.count.mockResolvedValue(1);
      await expect(service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1')).rejects.toThrow(
        'This deck already has the maximum of 1 recordings',
      );
    });

    it('does not enforce a cap when validatorDeckMaxItems is 0 (uncapped)', async () => {
      settings.getValidatorDeckMaxItems.mockResolvedValue(0);
      prisma.validatorDeckItem.findUnique.mockResolvedValue(null);
      prisma.validatorDeckItem.create.mockResolvedValue({ id: 'item-1' });
      await service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1');
      expect(prisma.validatorDeckItem.count).not.toHaveBeenCalled();
      expect(prisma.validatorDeckItem.create).toHaveBeenCalled();
    });
  });

  describe('scoreItem', () => {
    it('records a validator score against the deck item', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
      prisma.validatorDeckItem.findUnique.mockResolvedValue({ id: 'item-1' });
      prisma.validatorDeckItem.update.mockResolvedValue({ id: 'item-1', validationStatus: 'VALID' });

      await service.scoreItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1', {
        status: 'VALID' as never,
        score: 92,
        notes: 'Clean audio',
      });

      expect(prisma.validatorDeckItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          validationStatus: 'VALID',
          validatorScore: 92,
          validatorNotes: 'Clean audio',
        }),
      });
    });
  });

  describe('getWithPreview', () => {
    it('computes expected earning as validated-count times the flat rate', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
        items: [
          { validationStatus: 'VALID' },
          { validationStatus: 'VALID' },
          { validationStatus: 'INVALID' },
          { validationStatus: 'UNSCORED' },
        ],
      });
      settings.getValidationRewardPerRecording.mockResolvedValue(2.5);

      const result = await service.getWithPreview('deck-1');

      expect(result.expectedEarning).toBe('5');
    });
  });
});

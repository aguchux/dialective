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
        findUnique: jest.fn().mockResolvedValue({ id: 'rec-1', dialectTag: 'ig', dialectVariantId: null }),
      },
      dialect: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dialect-1',
          tag: 'ig',
          countryId: 'country-1',
          active: true,
          country: { id: 'country-1', code: 'NG' },
        }),
      },
      dialectVariant: {
        findUnique: jest.fn(),
      },
      validatorDialectAssignment: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', dialectId: 'dialect-1' }),
        findMany: jest.fn().mockResolvedValue([]),
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
    const dto = { name: 'My Deck', countryId: 'country-1', dialectId: 'dialect-1' };

    it('creates a DRAFT deck owned by its creator, deriving dialectTag/countryCode from the resolved dialect', async () => {
      prisma.validatorDeck.create.mockResolvedValue({ id: 'deck-1' });
      await service.create('user-1', 'VALIDATOR', dto);
      expect(prisma.validatorDeck.create).toHaveBeenCalledWith({
        data: {
          name: 'My Deck',
          dialectTag: 'ig',
          countryCode: 'NG',
          dialectId: 'dialect-1',
          dialectVariantId: undefined,
          createdByUserId: 'user-1',
          ownerUserId: 'user-1',
        },
      });
    });

    it('rejects when the dialect does not belong to the given country', async () => {
      prisma.dialect.findUnique.mockResolvedValue({
        id: 'dialect-1',
        tag: 'ig',
        countryId: 'other-country',
        active: true,
        country: { id: 'other-country', code: 'XX' },
      });
      await expect(service.create('user-1', 'VALIDATOR', dto)).rejects.toThrow(
        'Select an active dialect for the given country',
      );
    });

    it('rejects when the caller has no assignment for that dialect', async () => {
      prisma.validatorDialectAssignment.findUnique.mockResolvedValue(null);
      await expect(service.create('user-1', 'VALIDATOR', dto)).rejects.toThrow(
        'You are not onboarded to this dialect',
      );
    });

    it('lets an admin create a deck without an assignment', async () => {
      prisma.validatorDialectAssignment.findUnique.mockResolvedValue(null);
      prisma.validatorDeck.create.mockResolvedValue({ id: 'deck-1' });
      await expect(service.create('admin-1', 'ADMIN', dto)).resolves.toBeDefined();
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

    describe('deck-level dialect scoping', () => {
      beforeEach(() => {
        prisma.validatorDeck.findUnique.mockResolvedValue({
          id: 'deck-1',
          ownerUserId: 'user-1',
          status: 'DRAFT',
          dialectId: 'dialect-1',
          dialectVariantId: null,
        });
        prisma.validatorDeckItem.findUnique.mockResolvedValue(null);
        prisma.validatorDeckItem.create.mockResolvedValue({ id: 'item-1' });
      });

      it('allows a recording matching the deck dialect', async () => {
        prisma.wordRecording.findUnique.mockResolvedValue({ id: 'rec-1', dialectTag: 'ig', dialectVariantId: null });
        await expect(service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1')).resolves.toBeDefined();
      });

      it('rejects a recording from a different dialect', async () => {
        prisma.wordRecording.findUnique.mockResolvedValue({ id: 'rec-1', dialectTag: 'yo', dialectVariantId: null });
        await expect(service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1')).rejects.toThrow(
          "This recording is not in the deck's dialect",
        );
      });

      it('rejects a recording from a different sub-dialect when the deck has one set', async () => {
        prisma.validatorDeck.findUnique.mockResolvedValue({
          id: 'deck-1',
          ownerUserId: 'user-1',
          status: 'DRAFT',
          dialectId: 'dialect-1',
          dialectVariantId: 'variant-1',
        });
        prisma.wordRecording.findUnique.mockResolvedValue({ id: 'rec-1', dialectTag: 'ig', dialectVariantId: 'variant-2' });
        await expect(service.addItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1')).rejects.toThrow(
          "This recording is not in the deck's sub-dialect",
        );
      });
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

  describe('updateTranscript', () => {
    it('saves the validator transcript against the deck item, distinct from any WordRecording fields', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
      prisma.validatorDeckItem.findUnique.mockResolvedValue({ id: 'item-1' });
      prisma.validatorDeckItem.update.mockResolvedValue({ id: 'item-1' });

      await service.updateTranscript('deck-1', 'user-1', 'VALIDATOR', 'rec-1', {
        transcript: 'good morning',
      });

      expect(prisma.validatorDeckItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ validatorTranscript: 'good morning' }),
      });
      expect(prisma.wordRecording.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to save a transcript for a recording not in the deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
      prisma.validatorDeckItem.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTranscript('deck-1', 'user-1', 'VALIDATOR', 'rec-missing', {
          transcript: 'x',
        }),
      ).rejects.toThrow('This recording is not in the deck');
    });

    it('only the deck owner or an admin can save a transcript', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'someone-else',
        status: 'DRAFT',
      });

      await expect(
        service.updateTranscript('deck-1', 'user-1', 'VALIDATOR', 'rec-1', { transcript: 'x' }),
      ).rejects.toThrow('Only the deck owner or an admin can edit this deck');
    });
  });

  describe('flagItem', () => {
    it('records a flag reason/note against the deck item, stamped with the caller and a timestamp', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
      prisma.validatorDeckItem.findUnique.mockResolvedValue({ id: 'item-1' });
      prisma.validatorDeckItem.update.mockResolvedValue({ id: 'item-1' });

      await service.flagItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1', {
        reason: 'CLIPPING_OR_DISTORTION' as never,
        note: 'loud pop at 0:04',
      });

      expect(prisma.validatorDeckItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          flagReason: 'CLIPPING_OR_DISTORTION',
          flagNote: 'loud pop at 0:04',
          flaggedByUserId: 'user-1',
          flaggedAt: expect.any(Date),
        },
      });
    });

    it('defaults flagNote to null when no note is given', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
      prisma.validatorDeckItem.findUnique.mockResolvedValue({ id: 'item-1' });
      prisma.validatorDeckItem.update.mockResolvedValue({ id: 'item-1' });

      await service.flagItem('deck-1', 'user-1', 'VALIDATOR', 'rec-1', {
        reason: 'OTHER' as never,
      });

      expect(prisma.validatorDeckItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ flagNote: null }) }),
      );
    });

    it('refuses to flag a recording not in the deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({
        id: 'deck-1',
        ownerUserId: 'user-1',
        status: 'DRAFT',
      });
      prisma.validatorDeckItem.findUnique.mockResolvedValue(null);

      await expect(
        service.flagItem('deck-1', 'user-1', 'VALIDATOR', 'rec-missing', {
          reason: 'OTHER' as never,
        }),
      ).rejects.toThrow('This recording is not in the deck');
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

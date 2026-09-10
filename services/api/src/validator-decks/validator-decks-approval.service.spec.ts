import { ConflictException } from '@nestjs/common';
import { ValidatorDecksService } from './validator-decks.service';

describe('ValidatorDecksService (Phase 2: approval chain)', () => {
  let prisma: any;
  let settings: any;
  let service: ValidatorDecksService;

  function baseDeck(overrides: Record<string, unknown> = {}) {
    return {
      id: 'deck-1',
      createdByUserId: 'owner-1',
      ownerUserId: 'owner-1',
      status: 'DRAFT',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      validatorDeck: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where: { id } }: any) =>
          Promise.resolve(baseDeck({ id })),
        ),
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
        findUnique: jest.fn(),
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
        findUnique: jest.fn().mockResolvedValue({ userId: 'owner-1', dialectId: 'dialect-1' }),
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

  describe('full-chain routing', () => {
    it('L1-created deck: submit -> PENDING_L2, L2 approves -> PENDING_L3, L3 approves -> APPROVED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' });

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'DRAFT' },
        data: { status: 'PENDING_L2' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'SUBMITTED', toStatus: 'PENDING_L2' }) }),
      );

      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L2' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });
      await service.approve('deck-1', 'l2-user', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_L2' },
        data: { status: 'PENDING_L3' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'APPROVED', fromStatus: 'PENDING_L2', toStatus: 'PENDING_L3' }),
        }),
      );

      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L3' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L3' });
      await service.approve('deck-1', 'l3-user', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_L3' },
        data: { status: 'APPROVED' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'APPROVED', fromStatus: 'PENDING_L3', toStatus: 'APPROVED' }),
        }),
      );
    });

    it('L2-created deck: submit -> PENDING_L3, L3 approves -> APPROVED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'DRAFT' },
        data: { status: 'PENDING_L3' },
      });

      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L3' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L3' });
      await service.approve('deck-1', 'l3-user', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_L3' },
        data: { status: 'APPROVED' },
      });
    });

    it('L3-created deck: submit -> PENDING_ADMIN, admin approves -> APPROVED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L3' });

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'DRAFT' },
        data: { status: 'PENDING_ADMIN' },
      });

      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_ADMIN' }));
      await service.approve('deck-1', 'admin-1', 'ADMIN');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_ADMIN' },
        data: { status: 'APPROVED' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'APPROVED', fromStatus: 'PENDING_ADMIN', toStatus: 'APPROVED' }),
        }),
      );
    });
  });

  describe('tier-mismatch rejection', () => {
    it('an L1 caller cannot approve a PENDING_L3 deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L3' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' });

      await expect(service.approve('deck-1', 'l1-user', 'VALIDATOR')).rejects.toThrow();
    });

    it('an L2 caller cannot approve a PENDING_ADMIN deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_ADMIN' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });

      await expect(service.approve('deck-1', 'l2-user', 'VALIDATOR')).rejects.toThrow();
    });
  });

  describe('admin bypass', () => {
    it('bypasses from PENDING_L2 straight to APPROVED, writing ADMIN_BYPASS_APPROVED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L2' }));

      await service.approve('deck-1', 'admin-1', 'ADMIN');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_L2' },
        data: { status: 'APPROVED' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_BYPASS_APPROVED',
            fromStatus: 'PENDING_L2',
            toStatus: 'APPROVED',
          }),
        }),
      );
    });

    it('bypasses from PENDING_L3 straight to APPROVED, writing ADMIN_BYPASS_APPROVED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L3' }));

      await service.approve('deck-1', 'admin-1', 'ADMIN');
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ADMIN_BYPASS_APPROVED', toStatus: 'APPROVED' }),
        }),
      );
    });

    it('from PENDING_ADMIN writes the normal APPROVED action, not a bypass', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_ADMIN' }));

      await service.approve('deck-1', 'admin-1', 'ADMIN');
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVED' }) }),
      );
      expect(prisma.validatorDeckAuditLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ADMIN_BYPASS_APPROVED' }) }),
      );
    });
  });

  describe('optimistic-concurrency conflict', () => {
    it('throws ConflictException when updateMany matches zero rows on approve', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L2' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });
      prisma.validatorDeck.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('deck-1', 'l2-user', 'VALIDATOR')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when updateMany matches zero rows on submit', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' });
      prisma.validatorDeck.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.submit('deck-1', 'owner-1', 'VALIDATOR')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when updateMany matches zero rows on reject', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L2' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });
      prisma.validatorDeck.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reject('deck-1', 'l2-user', 'VALIDATOR', 'Not good enough'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('requires a non-empty reason at the DTO layer', async () => {
      const { validate } = await import('class-validator');
      const { plainToInstance } = await import('class-transformer');
      const { RejectValidatorDeckDto } = await import('./dto/reject-validator-deck.dto');

      const emptyDto = plainToInstance(RejectValidatorDeckDto, { reason: '' });
      const errors = await validate(emptyDto);
      expect(errors.length).toBeGreaterThan(0);

      const validDto = plainToInstance(RejectValidatorDeckDto, { reason: 'Audio quality too low' });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);
    });

    it('rejects any PENDING_* deck to REJECTED and writes a REJECTED audit row with the reason', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L3' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L3' });

      await service.reject('deck-1', 'l3-user', 'VALIDATOR', 'Audio quality too low');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_L3' },
        data: { status: 'REJECTED' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REJECTED',
            fromStatus: 'PENDING_L3',
            toStatus: 'REJECTED',
            reason: 'Audio quality too low',
          }),
        }),
      );
    });

    it('lets an admin reject from any PENDING_* state', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PENDING_L2' }));

      await service.reject('deck-1', 'admin-1', 'ADMIN', 'Bad batch');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'PENDING_L2' },
        data: { status: 'REJECTED' },
      });
    });
  });

  describe('resubmission after reject', () => {
    it('re-routes REJECTED -> PENDING_L3 using the caller current (promoted) level and writes RESUBMITTED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'REJECTED' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'REJECTED' },
        data: { status: 'PENDING_L3' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'RESUBMITTED', fromStatus: 'REJECTED', toStatus: 'PENDING_L3' }),
        }),
      );
      // Resubmission must not re-write a CREATED row.
      expect(prisma.validatorDeckAuditLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) }),
      );
    });

    it('re-routes REJECTED -> PENDING_ADMIN using the caller current (promoted to L3) level', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'REJECTED' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L3' });

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'REJECTED' },
        data: { status: 'PENDING_ADMIN' },
      });
    });
  });

  describe('audit log writes', () => {
    it('writes a CREATED row when create() is called', async () => {
      prisma.validatorDeck.create.mockResolvedValue(baseDeck());
      await service.create('owner-1', 'VALIDATOR', {
        name: 'Deck',
        countryId: 'country-1',
        dialectId: 'dialect-1',
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) }),
      );
    });

    it('writes an ITEM_ADDED row when addItem() is called', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.validatorDeckItem.findUnique.mockResolvedValue(null);
      prisma.validatorDeckItem.create.mockResolvedValue({ id: 'item-1' });

      await service.addItem('deck-1', 'owner-1', 'VALIDATOR', 'WORD_RECORDING', 'rec-1');
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ITEM_ADDED' }) }),
      );
    });

    it('writes an ITEM_REMOVED row when removeItem() is called', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.validatorDeckItem.findUnique.mockResolvedValue({ id: 'item-1' });

      await service.removeItem('deck-1', 'owner-1', 'VALIDATOR', 'WORD_RECORDING', 'rec-1');
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ITEM_REMOVED' }) }),
      );
    });

    it('writes a CREATED row before SUBMITTED on first submission when none exists yet', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' });
      prisma.validatorDeckAuditLog.findFirst.mockResolvedValue(null);

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) }),
      );
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'SUBMITTED' }) }),
      );
    });

    it('does not duplicate a CREATED row on first submission when one already exists', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' });
      prisma.validatorDeckAuditLog.findFirst.mockResolvedValue({ id: 'already-there' });

      await service.submit('deck-1', 'owner-1', 'VALIDATOR');
      expect(prisma.validatorDeckAuditLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) }),
      );
    });
  });

  describe('listPendingMyApproval', () => {
    it('returns PENDING_ADMIN decks for an admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', validatorLevel: null });
      await service.listPendingMyApproval('admin-1');
      expect(prisma.validatorDeck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING_ADMIN' } }),
      );
    });

    it('returns PENDING_L2 decks for an L2 validator', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L2' });
      await service.listPendingMyApproval('l2-user');
      expect(prisma.validatorDeck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING_L2' } }),
      );
    });

    it('returns PENDING_L3 decks for an L3 validator', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L3' });
      await service.listPendingMyApproval('l3-user');
      expect(prisma.validatorDeck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING_L3' } }),
      );
    });

    it('returns an empty array for an L1 validator (no approval tier)', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'VALIDATOR', validatorLevel: 'L1' });
      const result = await service.listPendingMyApproval('l1-user');
      expect(result).toEqual([]);
      expect(prisma.validatorDeck.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getAuditLog', () => {
    it('returns the deck audit trail newest-first', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue({ id: 'deck-1' });
      await service.getAuditLog('deck-1');
      expect(prisma.validatorDeckAuditLog.findMany).toHaveBeenCalledWith({
        where: { deckId: 'deck-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});

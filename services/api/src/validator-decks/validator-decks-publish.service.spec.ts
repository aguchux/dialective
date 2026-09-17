import { ConflictException } from '@nestjs/common';
import { ValidatorDecksService } from './validator-decks.service';

/**
 * Phase 3 (docs/validators.md): publish/reassign/archive/adminCloneFromStreamDeck.
 * Mirrors the mock shape used by validator-decks.service.spec.ts and
 * validator-decks-approval.service.spec.ts (Phase 1/2), extended with the
 * streamDeck/streamDeckItem/wallet/ledgerEntry tables publish() touches.
 */
describe('ValidatorDecksService (Phase 3: publish/reassign/archive/clone)', () => {
  let prisma: any;
  let settings: any;
  let service: ValidatorDecksService;

  function baseDeck(overrides: Record<string, unknown> = {}) {
    return {
      id: 'deck-1',
      name: 'Test Deck',
      createdByUserId: 'creator-1',
      ownerUserId: 'creator-1',
      status: 'APPROVED',
      dialectTag: null,
      countryCode: null,
      reassignedFromUserId: null,
      reassignedAt: null,
      effectiveReassignmentPenaltyPercent: null,
      publishedStreamDeckId: null,
      publishedAt: null,
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
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(({ where: { id } }: any) => Promise.resolve(baseDeck({ id }))),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(baseDeck(data))),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      validatorDeckItem: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      validatorDeckAuditLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'new-owner-1', role: 'VALIDATOR' }),
      },
      streamDeck: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'stream-deck-1', deckKey: 'DLSD-GEN-GEN-GEN-ABC123' }),
        findUnique: jest.fn(),
      },
      streamDeckItem: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ id: `wallet-${data.userId}`, userId: data.userId, balance: 0 }),
          ),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
    };
    settings = {
      getValidationRewardPerRecording: jest.fn().mockResolvedValue(2),
      getValidatorDeckMaxItems: jest.fn().mockResolvedValue(2000),
      getValidatorL1ApprovalBonusPercent: jest.fn().mockResolvedValue(5),
      getValidatorL2ApprovalBonusPercent: jest.fn().mockResolvedValue(10),
      getValidatorL3ApprovalBonusPercent: jest.fn().mockResolvedValue(15),
      getValidatorReassignmentPenaltyPercent: jest.fn().mockResolvedValue(0),
    };
    service = new ValidatorDecksService(prisma, settings);
  });

  describe('publish', () => {
    it('rejects publishing a deck that is not APPROVED', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));

      await expect(service.publish('deck-1', 'admin-1')).rejects.toThrow(
        'Only an approved deck can be published',
      );
    });

    it('throws ConflictException when the optimistic-concurrency updateMany matches zero rows', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'APPROVED' }));
      prisma.validatorDeck.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.publish('deck-1', 'admin-1')).rejects.toThrow(ConflictException);
    });

    it('creates a PUBLIC StreamDeck owned by the reserved platform org and bulk-creates items for every VALID ValidatorDeckItem', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'APPROVED' }));
      prisma.validatorDeckItem.findMany.mockResolvedValue([
        { recordingId: 'rec-1' },
        { recordingId: 'rec-2' },
      ]);

      await service.publish('deck-1', 'admin-1');

      expect(prisma.streamDeck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'dialect-library-platform',
            visibility: 'PUBLIC',
            type: 'MANUAL',
            createdByUserId: 'admin-1',
          }),
        }),
      );
      expect(prisma.streamDeckItem.createMany).toHaveBeenCalledWith({
        data: [
          { deckId: 'stream-deck-1', recordingId: 'rec-1', addedByUserId: 'admin-1' },
          { deckId: 'stream-deck-1', recordingId: 'rec-2', addedByUserId: 'admin-1' },
        ],
      });
    });

    it('updates ValidatorDeck to PUBLISHED with publishedStreamDeckId/publishedAt and writes a PUBLISHED audit row', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'APPROVED' }));

      await service.publish('deck-1', 'admin-1');

      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith({
        where: { id: 'deck-1', status: 'APPROVED' },
        data: expect.objectContaining({
          status: 'PUBLISHED',
          publishedStreamDeckId: 'stream-deck-1',
          publishedAt: expect.any(Date),
        }),
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PUBLISHED',
            fromStatus: 'APPROVED',
            toStatus: 'PUBLISHED',
            actorUserId: 'admin-1',
          }),
        }),
      );
    });

    it('credits the creator wallet with base reward via a VALIDATION_REWARD ledger entry', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(
        baseDeck({ status: 'APPROVED', createdByUserId: 'creator-1' }),
      );
      prisma.validatorDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);

      await service.publish('deck-1', 'admin-1');

      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'VALIDATION_REWARD',
            reference: 'validator-deck:deck-1:creator',
          }),
        }),
      );
    });

    it('skips all crediting when the configured rate is 0, but still publishes and bridges the deck', async () => {
      settings.getValidationRewardPerRecording.mockResolvedValue(0);
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'APPROVED' }));
      prisma.validatorDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);

      await service.publish('deck-1', 'admin-1');

      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
      expect(prisma.streamDeck.create).toHaveBeenCalled();
      expect(prisma.validatorDeck.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }),
      );
    });

    it('pays out the reassignment split instead of 100% to the creator when the deck was reassigned', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(
        baseDeck({
          status: 'APPROVED',
          ownerUserId: 'new-owner-1',
          reassignedFromUserId: 'original-owner-1',
          effectiveReassignmentPenaltyPercent: 30,
        }),
      );
      prisma.validatorDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);

      await service.publish('deck-1', 'admin-1');

      const references = prisma.ledgerEntry.create.mock.calls.map(
        (call: any) => call[0].data.reference,
      );
      expect(references).toContain('validator-deck:deck-1:creator');
      expect(references).toContain('validator-deck:deck-1:reassigned-owner');
    });
  });

  describe('reassign', () => {
    it('rejects reassigning a PUBLISHED deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PUBLISHED' }));

      await expect(service.reassign('deck-1', 'admin-1', 'new-owner-1')).rejects.toThrow(
        'A published or archived deck cannot be reassigned',
      );
    });

    it('rejects reassigning an ARCHIVED deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'ARCHIVED' }));

      await expect(service.reassign('deck-1', 'admin-1', 'new-owner-1')).rejects.toThrow(
        'A published or archived deck cannot be reassigned',
      );
    });

    it('rejects reassigning to the deck current owner', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(
        baseDeck({ status: 'DRAFT', ownerUserId: 'owner-1' }),
      );

      await expect(service.reassign('deck-1', 'admin-1', 'owner-1')).rejects.toThrow(
        'This deck is already owned by that validator',
      );
    });

    it('rejects reassigning to a non-validator user', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));
      prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER' });

      await expect(service.reassign('deck-1', 'admin-1', 'trainer-1')).rejects.toThrow(
        'newOwnerUserId must be an existing validator',
      );
    });

    it('captures the explicit penalty percent on the deck and writes a REASSIGNED audit row', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(
        baseDeck({ status: 'PENDING_L2', ownerUserId: 'owner-1' }),
      );

      await service.reassign('deck-1', 'admin-1', 'new-owner-1', 40);

      expect(prisma.validatorDeck.update).toHaveBeenCalledWith({
        where: { id: 'deck-1' },
        data: expect.objectContaining({
          ownerUserId: 'new-owner-1',
          reassignedFromUserId: 'owner-1',
          reassignedAt: expect.any(Date),
          effectiveReassignmentPenaltyPercent: 40,
        }),
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REASSIGNED',
            actorUserId: 'admin-1',
            metadata: { fromUserId: 'owner-1', toUserId: 'new-owner-1', penaltyPercent: 40 },
          }),
        }),
      );
    });

    it('falls back to the global default penalty percent when none is explicitly given', async () => {
      settings.getValidatorReassignmentPenaltyPercent.mockResolvedValue(15);
      prisma.validatorDeck.findUnique.mockResolvedValue(
        baseDeck({ status: 'DRAFT', ownerUserId: 'owner-1' }),
      );

      await service.reassign('deck-1', 'admin-1', 'new-owner-1');

      expect(prisma.validatorDeck.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ effectiveReassignmentPenaltyPercent: 15 }),
        }),
      );
    });
  });

  describe('archive', () => {
    it('rejects archiving an already-PUBLISHED deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'PUBLISHED' }));

      await expect(service.archive('deck-1', 'admin-1')).rejects.toThrow(
        'A published or already-archived deck cannot be archived',
      );
    });

    it('rejects archiving an already-ARCHIVED deck', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'ARCHIVED' }));

      await expect(service.archive('deck-1', 'admin-1')).rejects.toThrow(
        'A published or already-archived deck cannot be archived',
      );
    });

    it('archives a DRAFT deck and writes an ARCHIVED audit row', async () => {
      prisma.validatorDeck.findUnique.mockResolvedValue(baseDeck({ status: 'DRAFT' }));

      await service.archive('deck-1', 'admin-1');

      expect(prisma.validatorDeck.update).toHaveBeenCalledWith({
        where: { id: 'deck-1' },
        data: { status: 'ARCHIVED' },
      });
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ARCHIVED',
            fromStatus: 'DRAFT',
            toStatus: 'ARCHIVED',
          }),
        }),
      );
    });
  });

  describe('adminCloneFromStreamDeck', () => {
    it('throws when the source StreamDeck does not exist', async () => {
      prisma.streamDeck.findUnique.mockResolvedValue(null);

      await expect(
        service.adminCloneFromStreamDeck('missing-stream-deck', 'new-owner-1', 'admin-1'),
      ).rejects.toThrow('Stream Deck not found');
    });

    it('rejects a target owner who is not a validator', async () => {
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'sd-1',
        name: 'B2B Deck',
        deckKey: 'DLSD-1',
        items: [],
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER' });

      await expect(
        service.adminCloneFromStreamDeck('sd-1', 'trainer-1', 'admin-1'),
      ).rejects.toThrow('targetOwnerUserId must be an existing validator');
    });

    it('creates a new DRAFT ValidatorDeck owned by the target validator and copies items as UNSCORED', async () => {
      prisma.streamDeck.findUnique.mockResolvedValue({
        id: 'sd-1',
        name: 'B2B Deck',
        deckKey: 'DLSD-1',
        items: [{ recordingId: 'rec-1' }, { recordingId: 'rec-2' }],
      });
      prisma.validatorDeck.create.mockResolvedValue(
        baseDeck({ id: 'new-deck-1', status: 'DRAFT' }),
      );

      const result = await service.adminCloneFromStreamDeck('sd-1', 'new-owner-1', 'admin-1');

      expect(prisma.validatorDeck.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdByUserId: 'new-owner-1',
          ownerUserId: 'new-owner-1',
        }),
      });
      expect(prisma.validatorDeckItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { deckId: 'new-deck-1', recordingId: 'rec-1', addedByUserId: 'admin-1' },
            { deckId: 'new-deck-1', recordingId: 'rec-2', addedByUserId: 'admin-1' },
          ],
        }),
      );
      expect(prisma.validatorDeckAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CLONED', actorUserId: 'admin-1' }),
        }),
      );
      expect(result.id).toBe('new-deck-1');
    });
  });
});

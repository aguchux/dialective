import { StreamDeckType } from '@dialectiva/db';
import { SmartDeckEvaluatorService } from './smart-deck-evaluator.service';

function setup() {
  const prisma: any = {
    streamDeck: { findUnique: jest.fn(), findMany: jest.fn() },
    streamDeckItem: {
      findMany: jest.fn(),
      createMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    wordRecording: { findUnique: jest.fn() },
    streamApiKey: { findMany: jest.fn().mockResolvedValue([]) },
    oAuthClient: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  const streams = { consume: jest.fn().mockResolvedValue(undefined) };
  const catalogue = { matchingRecordingIdsForRule: jest.fn(), getEligibleRecording: jest.fn() };
  const versioning = { writeNewVersionIfMaterial: jest.fn().mockResolvedValue(undefined) };
  // VDCL coverage -- logged, never used to narrow a rule's membership.
  const deckCoverage = {
    forRecordings: jest.fn().mockResolvedValue({
      totalItems: 0,
      breakdown: { licensed: 0, pending: 0, purposeNotGranted: 0, withdrawn: 0, suspended: 0 },
      coveragePercent: 100,
      contributingAgreements: null,
      advisory: false,
      purposes: [],
    }),
  };
  const service = new SmartDeckEvaluatorService(
    prisma as never,
    streams as never,
    catalogue as never,
    versioning as never,
    deckCoverage as never,
  );
  return { service, prisma, catalogue, versioning, deckCoverage };
}

describe('SmartDeckEvaluatorService.evaluateRule', () => {
  it('adds a newly matching recording and removes a no-longer-matching one', async () => {
    const { service, prisma, catalogue, versioning } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      type: StreamDeckType.SMART,
      createdByUserId: 'user-1',
      rule: { minScore: 90 },
    });
    prisma.streamDeckItem.findMany.mockResolvedValue([{ id: 'item-1', recordingId: 'rec-old' }]);
    catalogue.matchingRecordingIdsForRule.mockResolvedValue(['rec-new']);

    await service.evaluateRule('deck-1');

    expect(prisma.streamDeckItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ deckId: 'deck-1', recordingId: 'rec-new', addedByUserId: 'user-1' }],
      }),
    );
    expect(prisma.streamDeckItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] } },
    });
    expect(versioning.writeNewVersionIfMaterial).toHaveBeenCalledWith('deck-1', 'smart_rule_match');
  });

  it('is a no-op when the matching set already equals current membership', async () => {
    const { service, prisma, catalogue, versioning } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      type: StreamDeckType.SMART,
      createdByUserId: 'user-1',
      rule: {},
    });
    prisma.streamDeckItem.findMany.mockResolvedValue([{ id: 'item-1', recordingId: 'rec-1' }]);
    catalogue.matchingRecordingIdsForRule.mockResolvedValue(['rec-1']);

    await service.evaluateRule('deck-1');

    expect(prisma.streamDeckItem.createMany).not.toHaveBeenCalled();
    expect(prisma.streamDeckItem.deleteMany).not.toHaveBeenCalled();
    expect(versioning.writeNewVersionIfMaterial).not.toHaveBeenCalled();
  });

  it('does nothing for a non-SMART deck', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      type: StreamDeckType.MANUAL,
      rule: null,
    });

    await service.evaluateRule('deck-1');

    expect(catalogue.matchingRecordingIdsForRule).not.toHaveBeenCalled();
  });
});

describe('SmartDeckEvaluatorService.evaluateAllRulesFor', () => {
  it('skips a Smart Deck whose rule country clearly does not match', async () => {
    const { service, prisma, catalogue } = setup();
    catalogue.getEligibleRecording.mockResolvedValue({
      id: 'rec-1',
      dialectTag: 'ig',
      dialectVariant: { dialect: { tag: 'ig', country: { code: 'NG' } } },
    });
    prisma.streamDeck.findMany.mockResolvedValue([
      { id: 'deck-gh', rule: { countryCode: 'GH', dialectTag: 'ig' } },
      { id: 'deck-ng', rule: { countryCode: 'NG', dialectTag: 'ig' } },
      { id: 'deck-any', rule: { countryCode: null, dialectTag: 'ig' } },
    ]);
    prisma.streamDeck.findUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve({
          id,
          type: StreamDeckType.SMART,
          createdByUserId: 'user-1',
          rule: { countryCode: id === 'deck-ng' ? 'NG' : null, dialectTag: 'ig' },
        }),
    );
    catalogue.matchingRecordingIdsForRule.mockResolvedValue([]);
    prisma.streamDeckItem.findMany.mockResolvedValue([]);

    await service.evaluateAllRulesFor('rec-1');

    const evaluatedDeckIds = prisma.streamDeck.findUnique.mock.calls.map(
      (c: unknown[]) => (c[0] as any).where.id,
    );
    expect(evaluatedDeckIds).not.toContain('deck-gh');
    expect(evaluatedDeckIds).toEqual(expect.arrayContaining(['deck-ng', 'deck-any']));
  });
});

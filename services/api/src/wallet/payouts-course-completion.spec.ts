import { creditCourseCompletionReward, Prisma } from '@dialectiva/db';

const { Decimal } = Prisma;

/**
 * Exercises packages/db/src/payouts.ts's creditCourseCompletionReward
 * directly against a mocked Prisma client whose ledgerEntry.create actually
 * enforces the real (walletId, type, reference) unique constraint (schema.
 * prisma's LedgerEntry.@@unique) -- unlike payouts-admin-funding.spec.ts's
 * fake, which never needs to simulate a P2002 since creditStartupBonus uses
 * an explicit findFirst-then-create guard instead. This is the DB-level
 * backstop that makes a retaken course's reward idempotent even if the
 * caller's own app-level "already completed" check (CoursesService.
 * saveProgress's wasAlreadyComplete) were ever bypassed or raced.
 */

class UniqueConstraintViolation extends Prisma.PrismaClientKnownRequestError {
  constructor() {
    super('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
  }
}

function setupWallet() {
  const wallets = new Map<
    string,
    { id: string; userId: string; balance: InstanceType<typeof Decimal> }
  >();
  const ledgerEntries: {
    walletId: string;
    type: string;
    amount: InstanceType<typeof Decimal>;
    reference: string;
  }[] = [];

  const prisma = {
    wallet: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(wallets.get(where.userId) ?? null),
      ),
      create: jest.fn(({ data }: { data: { userId: string } }) => {
        const wallet = {
          id: `wallet-${data.userId}`,
          userId: data.userId,
          balance: new Decimal(0),
        };
        wallets.set(data.userId, wallet);
        return Promise.resolve(wallet);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { balance: { increment: InstanceType<typeof Decimal> } };
        }) => {
          const wallet = [...wallets.values()].find((w) => w.id === where.id);
          if (wallet) wallet.balance = wallet.balance.add(data.balance.increment);
          return Promise.resolve(wallet);
        },
      ),
    },
    ledgerEntry: {
      // Real Postgres would reject a second (walletId, type, reference) row
      // via the LedgerEntry @@unique constraint -- simulated here so this
      // test exercises the actual P2002-catch path in
      // creditCourseCompletionReward, not just the happy path.
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            walletId: string;
            type: string;
            amount: InstanceType<typeof Decimal>;
            reference: string;
          };
        }) => {
          const duplicate = ledgerEntries.some(
            (entry) =>
              entry.walletId === data.walletId &&
              entry.type === data.type &&
              entry.reference === data.reference,
          );
          if (duplicate) return Promise.reject(new UniqueConstraintViolation());
          ledgerEntries.push(data);
          return Promise.resolve(data);
        },
      ),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (ops: unknown) => {
    if (typeof ops === 'function') return ops(prisma);
    return Promise.all(ops as Promise<unknown>[]);
  });

  return { prisma: prisma as never, wallets, ledgerEntries };
}

describe('creditCourseCompletionReward', () => {
  it('credits the wallet and writes a COURSE_COMPLETION_REWARD ledger entry keyed by courseId', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    const credited = await creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5);

    expect(credited).toBe(true);
    expect(wallets.get('user-1')!.balance.toString()).toBe('5');
    expect(ledgerEntries).toEqual([
      expect.objectContaining({ type: 'COURSE_COMPLETION_REWARD', reference: 'course-1' }),
    ]);
  });

  it('does not credit a second reward for the same trainer retaking the same course', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    const first = await creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5);
    const second = await creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(wallets.get('user-1')!.balance.toString()).toBe('5');
    expect(ledgerEntries).toHaveLength(1);
  });

  it('still rewards a different course completed by the same trainer', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    await creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5);
    await creditCourseCompletionReward(prisma, 'user-1', 'course-2', 7);

    expect(wallets.get('user-1')!.balance.toString()).toBe('12');
    expect(ledgerEntries).toHaveLength(2);
  });

  it('still rewards the same course completed by a different trainer', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    await creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5);
    await creditCourseCompletionReward(prisma, 'user-2', 'course-1', 5);

    expect(wallets.get('user-1')!.balance.toString()).toBe('5');
    expect(wallets.get('user-2')!.balance.toString()).toBe('5');
    expect(ledgerEntries).toHaveLength(2);
  });

  it('stays idempotent even when two completions race concurrently (simulates saveProgress double-submit)', async () => {
    const { prisma, wallets, ledgerEntries } = setupWallet();

    const [first, second] = await Promise.all([
      creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5),
      creditCourseCompletionReward(prisma, 'user-1', 'course-1', 5),
    ]);

    // Exactly one of the two concurrent attempts wins -- never both, never
    // neither. This is the real backstop if CoursesService.saveProgress's
    // own wasAlreadyComplete app-level guard were ever raced (two requests
    // both reading "not yet complete" before either writes).
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(wallets.get('user-1')!.balance.toString()).toBe('5');
    expect(ledgerEntries).toHaveLength(1);
  });
});

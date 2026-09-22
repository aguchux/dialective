import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { VdclDraftService } from './vdcl-draft.service';

/**
 * Drafting is where a licence's SCOPE is fixed: which contributor, which
 * dialect, and which purposes. Every guard here exists because getting one
 * of those wrong produces a signable document that grants the wrong thing.
 */
describe('VdclDraftService', () => {
  function makeService(opts: {
    contributor?: Record<string, unknown> | null;
    agreement?: Record<string, unknown>;
    openVersion?: Record<string, unknown> | null;
    latestVersion?: Record<string, unknown> | null;
  } = {}) {
    const agreement = opts.agreement ?? {
      id: 'a1',
      withdrawnAt: null,
      licenceKey: 'VDCL-NG-IGNG-USER0001',
    };
    const tx = {
      vdclAgreement: { upsert: jest.fn().mockResolvedValue(agreement) },
      vdclVersion: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(opts.openVersion === undefined ? null : opts.openVersion)
          .mockResolvedValueOnce(
            opts.latestVersion === undefined ? null : opts.latestVersion,
          ),
        create: jest.fn().mockResolvedValue({ id: 'v1', version: 1, grants: [] }),
      },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          opts.contributor === undefined
            ? { id: 'user-1', countryId: 'c1' }
            : opts.contributor,
        ),
      },
      country: { findUnique: jest.fn().mockResolvedValue({ code: 'NG' }) },
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    return { service: new VdclDraftService(prisma as never), prisma, tx };
  }

  const base = {
    contributorId: 'user-1',
    dialectTag: 'ig-ng',
    purposes: [VdclPurpose.ASR_TRAINING],
    wordingVersion: 'v1.0',
  };

  it('creates an agreement and a first version with its grants', async () => {
    const { service, tx } = makeService();

    await service.createDraft(base);

    expect(tx.vdclVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 1, status: VdclVersionStatus.DRAFT }),
      }),
    );
  });

  it('refuses to grant a purpose that is never offered', async () => {
    // VOICE_CLONING exists in the enum so a refusal can be represented.
    // An API that accepted it would make that policy decorative.
    const { service } = makeService();

    await expect(
      service.createDraft({ ...base, purposes: [VdclPurpose.VOICE_CLONING] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses voice cloning even when smuggled in alongside a legitimate purpose', async () => {
    const { service } = makeService();
    await expect(
      service.createDraft({
        ...base,
        purposes: [VdclPurpose.ASR_TRAINING, VdclPurpose.VOICE_CLONING],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('deduplicates repeated purposes rather than failing on a constraint', async () => {
    const { service, tx } = makeService();

    await service.createDraft({
      ...base,
      purposes: [VdclPurpose.ASR_TRAINING, VdclPurpose.ASR_TRAINING],
    });

    expect(tx.vdclVersion.create.mock.calls[0][0].data.grants.createMany.data).toHaveLength(1);
  });

  it('refuses a second in-flight version of the same agreement', async () => {
    // Two in-flight versions would mean two different answers to "what does
    // this licence cover" racing to be signed.
    const { service } = makeService({
      openVersion: { id: 'v1', version: 1, status: VdclVersionStatus.PENDING_REVIEW },
    });

    await expect(service.createDraft(base)).rejects.toThrow(BadRequestException);
  });

  it('refuses to draft against a withdrawn agreement', async () => {
    const { service } = makeService({
      agreement: { id: 'a1', withdrawnAt: new Date(), licenceKey: 'k' },
    });

    await expect(service.createDraft(base)).rejects.toThrow(BadRequestException);
  });

  it('numbers a new version after the highest existing one', async () => {
    const { service, tx } = makeService({ latestVersion: { version: 3 } });

    await service.createDraft(base);

    expect(tx.vdclVersion.create.mock.calls[0][0].data.version).toBe(4);
  });

  it('throws NotFound for an unknown contributor', async () => {
    const { service } = makeService({ contributor: null });
    await expect(service.createDraft(base)).rejects.toThrow(NotFoundException);
  });

  it("falls back to the contributor's own country when none is given", async () => {
    const { service, prisma } = makeService();
    await service.createDraft(base);
    expect(prisma.country.findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
      select: { code: true },
    });
  });
});

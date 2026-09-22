import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VdclVersionStatus } from '@dialectiva/db';
import { VdclAdminService } from './vdcl-admin.service';

/**
 * Activation is the moment a licence starts granting rights, and withdrawal
 * is the moment it stops. These tests pin the state guards around both,
 * because the failure modes are asymmetric: wrongly activating grants
 * commercial rights over work a contributor never signed for, while wrongly
 * refusing merely blocks an admin.
 */
describe('VdclAdminService', () => {
  function makeService(overrides: {
    version?: Record<string, unknown> | null;
    agreement?: Record<string, unknown> | null;
  } = {}) {
    const tx = {
      vdclVersion: { update: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vdclAgreement: { update: jest.fn().mockResolvedValue({ id: 'a1' }) },
      vdclSignatureEvent: { create: jest.fn().mockResolvedValue({}) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      vdclVersion: {
        findUnique: jest.fn().mockResolvedValue(
          overrides.version === undefined ? null : overrides.version,
        ),
        update: jest.fn().mockResolvedValue({ id: 'v1' }),
      },
      vdclAgreement: {
        findUnique: jest.fn().mockResolvedValue(
          overrides.agreement === undefined ? null : overrides.agreement,
        ),
        update: jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vdclSignatureEvent: { create: jest.fn().mockResolvedValue({}) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: unknown) => Promise<unknown>)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    const coverageNotifier = { notifyForAgreement: jest.fn().mockResolvedValue(undefined) };
    const documents = { issueDocuments: jest.fn().mockResolvedValue({ pdfHash: 'p' }) };
    return {
      service: new VdclAdminService(
        prisma as never,
        coverageNotifier as never,
        documents as never,
      ),
      prisma,
      tx,
      coverageNotifier,
      documents,
    };
  }

  describe('activateVersion', () => {
    const pending = {
      id: 'v1',
      agreementId: 'a1',
      status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
      agreement: { id: 'a1', withdrawnAt: null, activeVersionId: null },
      manifest: { id: 'm1' },
    };

    it('activates a version awaiting countersignature and points the agreement at it', async () => {
      const { service, prisma, coverageNotifier } = makeService({ version: pending });

      await service.activateVersion('v1', 'admin-1');

      expect(prisma.vdclAgreement.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { activeVersionId: 'v1' },
      });
      // Decks holding these recordings just GAINED coverage.
      expect(coverageNotifier.notifyForAgreement).toHaveBeenCalledWith('a1', 'reinstated');
    });

    it.each([
      VdclVersionStatus.DRAFT,
      VdclVersionStatus.PENDING_COMPILATION,
      VdclVersionStatus.PENDING_REVIEW,
      VdclVersionStatus.ACTIVE,
      VdclVersionStatus.SUPERSEDED,
      VdclVersionStatus.REJECTED,
    ])('refuses to activate a version in %s', async (status) => {
      // Activating a draft would grant commercial rights over a dataset the
      // contributor never signed for.
      const { service } = makeService({ version: { ...pending, status } });

      await expect(service.activateVersion('v1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('refuses to activate a version with no compiled manifest', async () => {
      // It would grant rights over nothing, and read as an active licence.
      const { service } = makeService({ version: { ...pending, manifest: null } });

      await expect(service.activateVersion('v1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('refuses to activate under a withdrawn agreement', async () => {
      const { service } = makeService({
        version: {
          ...pending,
          agreement: { id: 'a1', withdrawnAt: new Date(), activeVersionId: null },
        },
      });

      await expect(service.activateVersion('v1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('supersedes the previously active version', async () => {
      // An agreement has exactly one active version; the rights check
      // cross-checks the pointer against the version's own status.
      const { service, prisma } = makeService({
        version: {
          ...pending,
          agreement: { id: 'a1', withdrawnAt: null, activeVersionId: 'v-old' },
        },
      });

      await service.activateVersion('v1', 'admin-1');

      expect(prisma.vdclVersion.update).toHaveBeenCalledWith({
        where: { id: 'v-old' },
        data: { status: VdclVersionStatus.SUPERSEDED },
      });
    });

    it('throws NotFound for an unknown version', async () => {
      const { service } = makeService({ version: null });
      await expect(service.activateVersion('nope', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('issues the licence documents at countersignature', async () => {
      // Countersignature is when a licence starts granting rights, so it is
      // also when its documents become true. A contributor told their
      // licence is active must never find nothing to download.
      const { service, documents } = makeService({ version: pending });

      await service.activateVersion('v1', 'admin-1');

      expect(documents.issueDocuments).toHaveBeenCalledWith('v1');
    });

    it('does not roll back an activation when document rendering fails', async () => {
      // Rendering and uploading are slow and can fail on a network blip.
      // The activation has already been decided; a failed render leaves
      // pdfKey null, which the download route reports honestly.
      const { service, documents, prisma } = makeService({ version: pending });
      documents.issueDocuments.mockRejectedValue(new Error('Spaces unreachable'));

      await expect(service.activateVersion('v1', 'admin-1')).resolves.toBeDefined();
      expect(prisma.vdclAgreement.update).toHaveBeenCalled();
    });
  });

  describe('suspendVersion', () => {
    it('suspends an active version and notifies affected decks', async () => {
      const { service, tx, coverageNotifier } = makeService({
        version: { id: 'v1', agreementId: 'a1', status: VdclVersionStatus.ACTIVE },
      });

      await service.suspendVersion('v1', 'admin-1', 'compliance review');

      expect(tx.vdclVersion.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VdclVersionStatus.SUSPENDED },
      });
      expect(coverageNotifier.notifyForAgreement).toHaveBeenCalledWith('a1', 'suspended');
    });

    it('records the reason, since an unexplained suspension is unanswerable later', async () => {
      const { service, tx } = makeService({
        version: { id: 'v1', agreementId: 'a1', status: VdclVersionStatus.ACTIVE },
      });

      await service.suspendVersion('v1', 'admin-1', 'disputed ownership');

      expect(tx.vdclAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ detail: 'suspended: disputed ownership' }),
        }),
      );
    });

    it('refuses to suspend a version that is not active', async () => {
      const { service } = makeService({
        version: { id: 'v1', agreementId: 'a1', status: VdclVersionStatus.DRAFT },
      });

      await expect(service.suspendVersion('v1', 'admin-1', 'why')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reinstateVersion', () => {
    it('refuses to reinstate under a withdrawn agreement', async () => {
      // Withdrawal is the contributor's decision and outranks an admin's.
      const { service } = makeService({
        version: {
          id: 'v1',
          agreementId: 'a1',
          status: VdclVersionStatus.SUSPENDED,
          agreement: { withdrawnAt: new Date() },
        },
      });

      await expect(service.reinstateVersion('v1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('reinstates a suspended version', async () => {
      const { service, tx, coverageNotifier } = makeService({
        version: {
          id: 'v1',
          agreementId: 'a1',
          status: VdclVersionStatus.SUSPENDED,
          agreement: { withdrawnAt: null },
        },
      });

      await service.reinstateVersion('v1', 'admin-1');

      expect(tx.vdclVersion.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VdclVersionStatus.ACTIVE },
      });
      expect(coverageNotifier.notifyForAgreement).toHaveBeenCalledWith('a1', 'reinstated');
    });
  });

  describe('withdrawAgreement', () => {
    it('withdraws, marks the active version, and notifies every affected deck', async () => {
      const { service, tx, coverageNotifier } = makeService({
        agreement: { id: 'a1', withdrawnAt: null, activeVersionId: 'v1' },
      });

      await service.withdrawAgreement('a1', 'admin-1', 'contributor request');

      expect(tx.vdclAgreement.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { withdrawnAt: expect.any(Date) },
      });
      expect(tx.vdclVersion.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VdclVersionStatus.WITHDRAWN },
      });
      expect(coverageNotifier.notifyForAgreement).toHaveBeenCalledWith('a1', 'withdrawn');
    });

    it('is idempotent -- a second withdrawal is a no-op, not an error', async () => {
      const already = { id: 'a1', withdrawnAt: new Date(), activeVersionId: 'v1' };
      const { service, prisma, coverageNotifier } = makeService({ agreement: already });

      const result = await service.withdrawAgreement('a1', 'admin-1', 'again');

      expect(result).toBe(already);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(coverageNotifier.notifyForAgreement).not.toHaveBeenCalled();
    });

    it('handles an agreement with no active version', async () => {
      const { service, tx } = makeService({
        agreement: { id: 'a1', withdrawnAt: null, activeVersionId: null },
      });

      await service.withdrawAgreement('a1', 'admin-1', 'never activated');

      expect(tx.vdclVersion.update).not.toHaveBeenCalled();
      expect(tx.vdclAgreement.update).toHaveBeenCalled();
    });
  });
});

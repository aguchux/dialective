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
    otpEnabled?: boolean;
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
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          phoneNumber: null,
          phoneVerifiedAt: null,
        }),
      },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: unknown) => Promise<unknown>)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    const coverageNotifier = { notifyForAgreement: jest.fn().mockResolvedValue(undefined) };
    const documents = { issueDocuments: jest.fn().mockResolvedValue({ pdfHash: 'p' }) };
    const otp = {
      issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
      verify: jest.fn().mockResolvedValue({ id: 'otp-row' }),
    };
    const settings = {
      isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(overrides.otpEnabled ?? false),
      getOtpChannel: jest.fn().mockResolvedValue('EMAIL'),
      isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
    };
    return {
      service: new VdclAdminService(
        prisma as never,
        coverageNotifier as never,
        documents as never,
        otp as never,
        settings as never,
      ),
      prisma,
      tx,
      coverageNotifier,
      documents,
      otp,
      settings,
    };
  }

  describe('activateVersion', () => {
    const pending = {
      id: 'v1',
      agreementId: 'a1',
      status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
      agreement: { id: 'a1', withdrawnAt: null, activeVersionId: null },
      manifest: { id: 'm1' },
      manifestHash: 'hash-abc',
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

    describe('OTP step-up', () => {
      it('refuses to countersign without a code when admin OTP is on', async () => {
        // Countersignature grants commercial rights over a real person's
        // voice, so it joins the same step-up set as payouts and account
        // deletion.
        const { service } = makeService({ version: pending, otpEnabled: true });

        await expect(service.activateVersion('v1', 'admin-1')).rejects.toThrow(
          /OTP verification is required/i,
        );
      });

      it('verifies the code against the manifest hash, not just the version id', async () => {
        // An admin confirming a licence over one dataset must not have that
        // code complete a countersignature over a different one.
        const { service, otp } = makeService({ version: pending, otpEnabled: true });

        await service.activateVersion('v1', 'admin-1', {
          otpRequestId: 'otp-1',
          code: '123456',
        });

        expect(otp.verify).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'admin-1',
            purpose: 'VDCL_COUNTERSIGN',
            contextHash: expect.any(String),
          }),
        );
      });

      it('derives a different binding when the manifest changed', async () => {
        const a = makeService({ version: pending, otpEnabled: true });
        await a.service.activateVersion('v1', 'admin-1', {
          otpRequestId: 'otp-1',
          code: '123456',
        });
        const b = makeService({
          version: { ...pending, manifestHash: 'hash-CHANGED' },
          otpEnabled: true,
        });
        await b.service.activateVersion('v1', 'admin-1', {
          otpRequestId: 'otp-1',
          code: '123456',
        });

        expect(a.otp.verify.mock.calls[0][0].contextHash).not.toBe(
          b.otp.verify.mock.calls[0][0].contextHash,
        );
      });

      it('skips the step-up when admin OTP is turned off', async () => {
        // The gate follows the same setting as every other admin step-up,
        // so turning it off does not leave this one route demanding a code
        // nobody can receive.
        const { service, otp } = makeService({ version: pending, otpEnabled: false });

        await service.activateVersion('v1', 'admin-1');

        expect(otp.verify).not.toHaveBeenCalled();
      });

      it('refuses to issue a code for a version that cannot be countersigned', async () => {
        // An admin must never be handed a code for an action that will then
        // refuse.
        const { service, otp } = makeService({
          version: { ...pending, status: VdclVersionStatus.DRAFT },
        });

        await expect(service.requestCountersignOtp('v1', 'admin-1')).rejects.toThrow(
          BadRequestException,
        );
        expect(otp.issueForUser).not.toHaveBeenCalled();
      });

      it('sends the code to the admin, bound to this version', async () => {
        const { service, otp } = makeService({ version: pending });

        await service.requestCountersignOtp('v1', 'admin-1');

        expect(otp.issueForUser).toHaveBeenCalledWith(
          'admin-1',
          'VDCL_COUNTERSIGN',
          'admin@example.com',
          expect.any(String),
          'EMAIL',
        );
      });
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

  describe('listAgreements', () => {
    /**
     * The bug this panel existed to expose. activeVersionId is only set AT
     * countersignature, so reading activeVersion alone meant the one state
     * that needs an admin -- PENDING_COUNTERSIGNATURE -- was invisible, and
     * the UI offered a withdrawal form for the licence it should have been
     * countersigning.
     */
    it('surfaces a version awaiting countersignature even with no active version', async () => {
      const { service, prisma } = makeService();
      prisma.vdclAgreement.findMany.mockResolvedValue([
        {
          id: 'a1',
          licenceKey: 'VDCL-NG-1',
          activeVersionId: null,
          activeVersion: null,
          versions: [{ id: 'v1', version: 1, status: 'PENDING_COUNTERSIGNATURE' }],
          _count: { versions: 1 },
        },
      ]);

      const [row] = await service.listAgreements({});

      expect(row.activeVersion).toBeNull();
      expect(row.latestVersion).toMatchObject({
        id: 'v1',
        status: 'PENDING_COUNTERSIGNATURE',
      });
      // The raw relation is not leaked alongside the resolved field.
      expect(row).not.toHaveProperty('versions');
    });

    it('still reports the active version when there is one', async () => {
      const { service, prisma } = makeService();
      prisma.vdclAgreement.findMany.mockResolvedValue([
        {
          id: 'a1',
          licenceKey: 'VDCL-NG-1',
          activeVersionId: 'v2',
          activeVersion: { id: 'v2', version: 2, status: 'ACTIVE' },
          versions: [{ id: 'v2', version: 2, status: 'ACTIVE' }],
          _count: { versions: 2 },
        },
      ]);

      const [row] = await service.listAgreements({});

      expect(row.activeVersion).toMatchObject({ id: 'v2' });
      expect(row.latestVersion).toMatchObject({ id: 'v2' });
    });

    it('reports no latest version for an agreement with none', async () => {
      const { service, prisma } = makeService();
      prisma.vdclAgreement.findMany.mockResolvedValue([
        {
          id: 'a1',
          licenceKey: 'VDCL-NG-1',
          activeVersionId: null,
          activeVersion: null,
          versions: [],
          _count: { versions: 0 },
        },
      ]);

      const [row] = await service.listAgreements({});

      expect(row.latestVersion).toBeNull();
    });
  });

  /**
   * Every control on the licence screen used to be a single click.
   * Suspending cut a contributor off, revoking sent their licence back,
   * re-issuing changed what their certificate verifies against -- all with
   * no confirmation. These lock the step-up in place.
   */
  describe('step-up on every licence action', () => {
    const activeVersion = {
      id: 'v1',
      agreementId: 'a1',
      status: 'ACTIVE',
      agreement: { activeVersionId: 'v1', withdrawnAt: null },
    };

    it('refuses to suspend without a code when step-ups are on', async () => {
      const { service } = makeService({ version: activeVersion, otpEnabled: true });

      await expect(service.suspendVersion('v1', 'admin-1', 'compliance')).rejects.toThrow(
        /OTP verification is required to suspend/i,
      );
    });

    it('refuses to revoke without a code when step-ups are on', async () => {
      const { service } = makeService({ version: activeVersion, otpEnabled: true });

      await expect(
        service.revokeCountersignature('v1', 'admin-1', 'dialect wrong'),
      ).rejects.toThrow(/OTP verification is required to revoke/i);
    });

    it('refuses to re-issue documents without a code when step-ups are on', async () => {
      const { service } = makeService({ version: activeVersion, otpEnabled: true });

      await expect(service.reissueDocuments('v1', 'admin-1')).rejects.toThrow(
        /OTP verification is required to re-issue/i,
      );
    });

    it('refuses to withdraw without a code when step-ups are on', async () => {
      const { service } = makeService({
        version: activeVersion,
        agreement: { id: 'a1', withdrawnAt: null },
        otpEnabled: true,
      });

      await expect(service.withdrawAgreement('a1', 'admin-1', 'support ticket')).rejects.toThrow(
        /OTP verification is required to record this withdrawal/i,
      );
    });

    it('binds the code to the action and the target', async () => {
      // A code issued to suspend one licence must not revoke it, and must
      // not act on a different licence.
      const { service, otp } = makeService({ version: activeVersion, otpEnabled: true });

      await service.suspendVersion('v1', 'admin-1', 'compliance', {
        otpRequestId: 'otp-1',
        code: '123456',
      });

      const suspendHash = otp.verify.mock.calls[0][0].contextHash;

      const revokeRun = makeService({ version: activeVersion, otpEnabled: true });
      await revokeRun.service.revokeCountersignature('v1', 'admin-1', 'reason', {
        otpRequestId: 'otp-1',
        code: '123456',
      });
      const revokeHash = revokeRun.otp.verify.mock.calls[0][0].contextHash;

      const otherTarget = makeService({
        version: { ...activeVersion, id: 'v2' },
        otpEnabled: true,
      });
      await otherTarget.service.suspendVersion('v2', 'admin-1', 'compliance', {
        otpRequestId: 'otp-1',
        code: '123456',
      });
      const otherHash = otherTarget.otp.verify.mock.calls[0][0].contextHash;

      expect(suspendHash).not.toEqual(revokeHash);
      expect(suspendHash).not.toEqual(otherHash);
    });

    it('lets the action through when step-ups are switched off', async () => {
      // The gate is the platform setting. An admin who turns admin OTP off
      // must not be locked out of their own licence screen.
      const { service, tx } = makeService({ version: activeVersion, otpEnabled: false });

      await service.suspendVersion('v1', 'admin-1', 'compliance');

      expect(tx.vdclVersion.update).toHaveBeenCalled();
    });

    it('does not demand a code to re-confirm an already-withdrawn agreement', async () => {
      // Idempotent, so there is no write to guard.
      const { service } = makeService({
        agreement: { id: 'a1', withdrawnAt: new Date() },
        otpEnabled: true,
      });

      await expect(
        service.withdrawAgreement('a1', 'admin-1', 'support ticket'),
      ).resolves.toMatchObject({ id: 'a1' });
    });
  });

  describe('revokeCountersignature', () => {
    const activeVersion = {
      id: 'v1',
      agreementId: 'a1',
      status: 'ACTIVE',
      agreement: { activeVersionId: 'v1' },
    };

    it('undoes the Dialect Library signature but never the contributor one', async () => {
      // The contributor signed. We are refusing to countersign; we do not
      // get to erase the fact that they did.
      const { service, tx } = makeService({ version: activeVersion });

      await service.revokeCountersignature('v1', 'admin-1', 'Dialect tag looks wrong');

      const data = tx.vdclVersion.update.mock.calls[0][0].data;
      expect(data.status).toBe('REJECTED');
      expect(data.countersignedAt).toBeNull();
      expect(data.countersignedById).toBeNull();
      expect(data).not.toHaveProperty('signedAt');
    });

    it('records the reason where the contributor can read it', async () => {
      const { service, tx } = makeService({ version: activeVersion });

      await service.revokeCountersignature('v1', 'admin-1', '  Dialect tag looks wrong  ');

      const data = tx.vdclVersion.update.mock.calls[0][0].data;
      expect(data.rejectionReason).toBe('Dialect tag looks wrong');
      expect(data.rejectedAt).toBeInstanceOf(Date);
    });

    it('clears the active pointer so rights stop resolving immediately', async () => {
      const { service, tx } = makeService({ version: activeVersion });

      await service.revokeCountersignature('v1', 'admin-1', 'compliance');

      expect(tx.vdclAgreement.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { activeVersionId: null },
      });
    });

    it('leaves another version active pointer alone', async () => {
      const { service, tx } = makeService({
        version: { ...activeVersion, agreement: { activeVersionId: 'v9' } },
      });

      await service.revokeCountersignature('v1', 'admin-1', 'compliance');

      expect(tx.vdclAgreement.update).not.toHaveBeenCalled();
    });

    it('works on a version still awaiting countersignature', async () => {
      // Refusing before signing is the same decision as revoking after it.
      const { service, tx } = makeService({
        version: {
          ...activeVersion,
          status: 'PENDING_COUNTERSIGNATURE',
          agreement: { activeVersionId: null },
        },
      });

      await service.revokeCountersignature('v1', 'admin-1', 'needs more recordings');

      expect(tx.vdclVersion.update.mock.calls[0][0].data.status).toBe('REJECTED');
    });

    it('refuses without a usable reason', async () => {
      const { service } = makeService({ version: activeVersion });

      await expect(service.revokeCountersignature('v1', 'admin-1', '  ')).rejects.toThrow(
        /reason is required/i,
      );
    });

    it('refuses to overwrite an existing rejection', async () => {
      // A second revoke would replace the reason the contributor is already
      // working from.
      const { service } = makeService({
        version: { ...activeVersion, status: 'REJECTED' },
      });

      await expect(
        service.revokeCountersignature('v1', 'admin-1', 'another reason'),
      ).rejects.toThrow(/REJECTED/);
    });

    it('refuses a version that was never countersigned or reviewed', async () => {
      const { service } = makeService({
        version: { ...activeVersion, status: 'DRAFT' },
      });

      await expect(service.revokeCountersignature('v1', 'admin-1', 'nope')).rejects.toThrow(
        /DRAFT/,
      );
    });

    it('tells subscribers their access has stopped', async () => {
      const { service, coverageNotifier } = makeService({ version: activeVersion });

      await service.revokeCountersignature('v1', 'admin-1', 'compliance');

      expect(coverageNotifier.notifyForAgreement).toHaveBeenCalledWith('a1', 'suspended');
    });

    it('writes an audit row naming the reason', async () => {
      const { service, tx } = makeService({ version: activeVersion });

      await service.revokeCountersignature('v1', 'admin-1', 'dialect tag wrong');

      expect(tx.vdclAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin-1',
            detail: expect.stringContaining('dialect tag wrong'),
          }),
        }),
      );
    });
  });
});

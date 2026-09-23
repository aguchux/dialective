import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KycStatus, VdclVersionStatus } from '@dialectiva/db';
import { VdclDocumentsService } from './vdcl-documents.service';

/**
 * Documents are the artefacts that leave the platform. A PDF names a real
 * person; a PNG gets pasted into slide decks. So the tests here are mostly
 * about two things: WHO can get them, and whether they are issued at a
 * point where they are actually true.
 */
describe('VdclDocumentsService', () => {
  // These exercise the REAL pdfkit and node-canvas renderers rather than
  // mocking them -- rendering is where a privacy mistake would actually
  // happen, so mocking it out would test nothing that matters. Real
  // rendering is slow, and slower still when the whole suite runs in
  // parallel, so the default 5s is not enough.
  jest.setTimeout(60_000);

  const ORIGINAL = process.env.VDCL_VERIFICATION_SECRET;

  beforeEach(() => {
    process.env.VDCL_VERIFICATION_SECRET = 'test-secret-at-least-16-chars';
  });

  afterAll(() => {
    process.env.VDCL_VERIFICATION_SECRET = ORIGINAL;
  });

  function makeService(opts: {
    dialects?: { tag: string; name: string }[];
    version?: Record<string, unknown> | null;
    downloadVersion?: Record<string, unknown> | null;
  } = {}) {
    const prisma = {
      vdclVersion: {
        findUnique: jest.fn().mockImplementation(({ select }) =>
          // The download path uses a narrow `select`; the render path uses
          // `include`. Distinguishing them keeps one mock serving both.
          Promise.resolve(
            select
              ? opts.downloadVersion === undefined
                ? downloadRow()
                : opts.downloadVersion
              : opts.version === undefined
                ? fullVersion()
                : opts.version,
          ),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      vdclManifestItem: { findMany: jest.fn().mockResolvedValue([]) },
      dialect: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.dialects ?? [{ tag: 'ig', name: 'Igbo' }, { tag: 'pcm', name: 'Nigerian Pidgin' }],
          ),
      },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([{}, {}]),
    };
    const storage = {
      putObject: jest
        .fn()
        .mockImplementation(({ bucket, key }) => Promise.resolve({ bucket, key })),
      createPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://spaces/signed', expiresInSeconds: 900 }),
    };
    return {
      service: new VdclDocumentsService(prisma as never, storage as never),
      prisma,
      storage,
    };
  }

  function fullVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      agreementId: 'a1',
      status: VdclVersionStatus.ACTIVE,
      manifestHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      pdfHash: null,
      pngHash: null,
      termsVersion: 'terms-1.0',
      signedAt: new Date('2026-09-20T00:00:00Z'),
      countersignedAt: new Date('2026-09-21T00:00:00Z'),
      agreement: {
        licenceKey: 'VDCL-NG-IGNG-A1B2C3D4',
        contributorId: 'a1b2c3d4-0000-4000-8000-000000000001',
        dialectTag: 'ig-ng',
        withdrawnAt: null,
        country: { name: 'Nigeria' },
        contributor: {
          firstName: 'Ada',
          lastName: 'Okoro',
          kycStatus: KycStatus.APPROVED,
        },
      },
      manifest: {
        id: 'm1',
        manifestKey: 'VDM-NG-A1B2C3D4-1',
        dialectTags: ['ig-ng'],
        recordingCount: 120,
        totalDurationMs: 480000n,
        transcriptCount: 118,
        excludedCount: 4,
        meanCompositeScore: { toString: () => '81.00' },
        asrPipelineVersion: 'whisper',
      },
      grants: [{ purpose: 'ASR_TRAINING' }],
      ...overrides,
    };
  }

  function downloadRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      pdfKey: 'vdcl/VDCL-NG-IGNG-A1B2C3D4/v1/licence.pdf',
      pngKey: 'vdcl/VDCL-NG-IGNG-A1B2C3D4/v1/certificate.png',
      pdfHash: 'pdf-hash',
      pngHash: 'png-hash',
      agreement: { contributorId: 'a1b2c3d4-0000-4000-8000-000000000001' },
      ...overrides,
    };
  }

  describe('issuing', () => {
    it('refuses to issue documents before countersignature', async () => {
      // A PDF rendered from an unsigned version would be a licence-shaped
      // object asserting rights nobody granted -- and PDFs get forwarded.
      const { service } = makeService({
        version: fullVersion({
          countersignedAt: null,
          status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
        }),
      });

      await expect(service.issueDocuments('v1')).rejects.toThrow(BadRequestException);
    });

    it('refuses to issue documents for a version with no manifest', async () => {
      const { service } = makeService({
        version: fullVersion({ manifest: null, manifestHash: null }),
      });
      await expect(service.issueDocuments('v1')).rejects.toThrow(BadRequestException);
    });

    it('renders and stores both documents, privately', async () => {
      // A VDCL PDF names a real person and must never be public-read.
      const { service, storage } = makeService();

      const result = await service.issueDocuments('v1');

      expect(storage.putObject).toHaveBeenCalledTimes(2);
      for (const call of storage.putObject.mock.calls) {
        expect(call[0].publicRead).toBeUndefined();
      }
      expect(result.pdfKey).toMatch(/licence\.pdf$/);
      expect(result.pngKey).toMatch(/certificate\.png$/);
    });

    it('records a hash of each document so a re-render can be proven identical', async () => {
      const { service } = makeService();
      const result = await service.issueDocuments('v1');
      expect(result.pdfHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.pngHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('gives each issue its own hash, because each carries its own QR nonce', async () => {
      // pdfHash answers "is this the exact file we sent?", NOT "could this
      // be re-derived from the data?". Every issue mints a fresh
      // verification nonce, so a re-issue is a genuinely different
      // document -- which is the point: a re-issue should be visible as a
      // changed hash rather than a silent swap.
      //
      // The document's own CONTENT is still deterministic: pdfkit's
      // CreationDate is pinned to the countersignature rather than the
      // current time, so two issues differ only by their nonce.
      const first = await makeService().service.issueDocuments('v1');
      const second = await makeService().service.issueDocuments('v1');

      expect(first.pdfHash).not.toBe(second.pdfHash);
      expect(first.verificationUrl).not.toBe(second.verificationUrl);
    });

    it('never passes the contributor name to the certificate renderer', async () => {
      // The PNG is the most shareable artefact in the product -- it gets
      // pasted into slide decks and posted publicly. The name is nulled
      // before it reaches the renderer, so no code path inside it could
      // print the name even by accident.
      const { service } = makeService();
      const pngSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('./vdcl-png.util'),
        'renderVdclCertificatePng',
      );

      await service.issueDocuments('v1');

      const passed = pngSpy.mock.calls[0][0] as { contributorName: unknown };
      expect(passed.contributorName).toBeNull();
      pngSpy.mockRestore();
    });

    it('carries a verification URL for the QR', async () => {
      const { service } = makeService();
      const result = await service.issueDocuments('v1');
      expect(result.verificationUrl).toContain('/verify/');
    });
  });

  describe('dialect names on the rendered documents', () => {
    /**
     * The manifest stores TAGS and must keep doing so -- the hash is
     * computed over them, and a renamed dialect must not change what an
     * already-issued licence verifies against. But "ig" on a certificate
     * tells the contributor holding it nothing, so the name is resolved at
     * render time.
     */
    it('looks up the full name for every tag the manifest covers', async () => {
      const { service, prisma } = makeService();

      await service.issueDocuments('v1');

      expect(prisma.dialect.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tag: { in: ['ig-ng'] } },
          select: { tag: true, name: true },
        }),
      );
    });

    it('falls back to the tag when a dialect row is missing', async () => {
      // Showing a raw code is bad; silently dropping a dialect the licence
      // actually covers is worse.
      const { service } = makeService({ dialects: [] });

      await expect(service.issueDocuments('v1')).resolves.toBeDefined();
    });
  });

  describe('download access', () => {
    it('gives the contributor a short-lived link', async () => {
      const { service } = makeService();
      const result = await service.getDownloadUrl({
        versionId: 'v1',
        kind: 'pdf',
        requesterId: 'a1b2c3d4-0000-4000-8000-000000000001',
        isStaff: false,
      });
      expect(result.url).toBe('https://spaces/signed');
      expect(result.expiresInSeconds).toBe(900);
    });

    it("refuses another contributor, as NotFound rather than Forbidden", async () => {
      // Someone probing ids should not learn that a licence exists under
      // another name.
      const { service } = makeService();
      await expect(
        service.getDownloadUrl({
          versionId: 'v1',
          kind: 'pdf',
          requesterId: 'someone-else',
          isStaff: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows staff, who sit in the middle and see both halves', async () => {
      const { service } = makeService();
      await expect(
        service.getDownloadUrl({
          versionId: 'v1',
          kind: 'pdf',
          requesterId: 'admin-1',
          isStaff: true,
        }),
      ).resolves.toMatchObject({ url: 'https://spaces/signed' });
    });

    it('reports honestly when a document was never issued', async () => {
      const { service } = makeService({ downloadVersion: downloadRow({ pdfKey: null }) });
      await expect(
        service.getDownloadUrl({
          versionId: 'v1',
          kind: 'pdf',
          requesterId: 'a1b2c3d4-0000-4000-8000-000000000001',
          isStaff: false,
        }),
      ).rejects.toThrow(/not been issued/i);
    });

    it('logs every download of a licence naming a real person', async () => {
      const { service, prisma } = makeService();
      await service.getDownloadUrl({
        versionId: 'v1',
        kind: 'pdf',
        requesterId: 'a1b2c3d4-0000-4000-8000-000000000001',
        isStaff: false,
      });
      expect(prisma.vdclAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'document_downloaded' }),
        }),
      );
    });

    it('still returns the link when the audit write fails', async () => {
      const { service, prisma } = makeService();
      prisma.vdclAuditEvent.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.getDownloadUrl({
          versionId: 'v1',
          kind: 'pdf',
          requesterId: 'a1b2c3d4-0000-4000-8000-000000000001',
          isStaff: false,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('json manifest', () => {
    it("refuses another contributor's manifest", async () => {
      // It lists recording ids, which are the contributor's own work.
      const { service } = makeService();
      await expect(
        service.getJsonManifest({
          versionId: 'v1',
          requesterId: 'someone-else',
          isStaff: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('serialises BigInt duration so the response can be JSON', async () => {
      const { service } = makeService();
      const result = await service.getJsonManifest({
        versionId: 'v1',
        requesterId: 'a1b2c3d4-0000-4000-8000-000000000001',
        isStaff: false,
      });
      expect(result.totalDurationMs).toBe('480000');
    });
  });
});

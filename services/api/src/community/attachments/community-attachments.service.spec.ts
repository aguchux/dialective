import { CommunityAttachmentsService } from './community-attachments.service';

describe('CommunityAttachmentsService', () => {
  function setup(attachmentsEnabled = true) {
    const storage = {
      createPresignedUploadUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://upload', expiresInSeconds: 900 }),
      getPublicObjectUrl: jest.fn().mockReturnValue('https://public/file'),
    };
    const settings = { isAttachmentsEnabled: jest.fn().mockResolvedValue(attachmentsEnabled) };
    const service = new CommunityAttachmentsService(storage as never, settings as never);
    return { service, storage, settings };
  }

  it('refuses to create an upload url when attachments are disabled', async () => {
    const { service, storage } = setup(false);

    await expect(
      service.createUploadUrl('user-1', { contentType: 'image/png' } as never),
    ).rejects.toThrow('Attachments are currently disabled');
    expect(storage.createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('creates an upload url when attachments are enabled', async () => {
    const { service, storage } = setup(true);

    const result = await service.createUploadUrl('user-1', { contentType: 'image/png' } as never);

    expect(storage.createPresignedUploadUrl).toHaveBeenCalled();
    expect(result.uploadUrl).toBe('https://upload');
  });

  // Regression test: iOS Safari's file/voice-memo picker produces
  // audio/mp4 (AAC in an M4A container), never audio/webm -- this used to
  // 400 before ever reaching this service (rejected by the DTO's @IsIn),
  // and even here would have looked up an undefined extension.
  it.each(['audio/mp4', 'audio/x-m4a'])(
    'accepts iOS-produced content type %s and builds a .m4a key',
    async (contentType) => {
      const { service, storage } = setup(true);

      await service.createUploadUrl('user-1', { contentType } as never);

      const [, key] = storage.createPresignedUploadUrl.mock.calls[0];
      expect(key).toMatch(/\.m4a$/);
    },
  );
});

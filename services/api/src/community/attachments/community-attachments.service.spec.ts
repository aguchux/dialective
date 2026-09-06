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
});

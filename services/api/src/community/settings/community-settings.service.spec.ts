import { CommunitySettingsService } from './community-settings.service';

describe('CommunitySettingsService', () => {
  function setup(rowOverrides: Partial<Record<string, unknown>> = {}) {
    const row = {
      id: 'default',
      postingEnabled: true,
      repliesEnabled: true,
      attachmentsEnabled: true,
      reactionsEnabled: true,
      newMemberPostingDelayMinutes: 0,
      requireApprovalForNewMembers: false,
      adsterraEnabled: false,
      adsterraSiteId: null,
      monetagEnabled: false,
      monetagZoneId: null,
      ...rowOverrides,
    };
    const prisma = {
      communitySettings: { upsert: jest.fn().mockResolvedValue(row) },
    };
    const service = new CommunitySettingsService(prisma as never);
    return { service, prisma, row };
  }

  it('upserts the default row on first read', async () => {
    const { service, prisma } = setup();

    const enabled = await service.isPostingEnabled();

    expect(prisma.communitySettings.upsert).toHaveBeenCalledWith({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    expect(enabled).toBe(true);
  });

  it('caches reads within the TTL window', async () => {
    const { service, prisma } = setup();

    await service.isPostingEnabled();
    await service.isRepliesEnabled();
    await service.isAttachmentsEnabled();

    expect(prisma.communitySettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('reflects a disabled gate', async () => {
    const { service } = setup({ postingEnabled: false });

    expect(await service.isPostingEnabled()).toBe(false);
  });

  it('returns the full admin shape', async () => {
    const { service, row } = setup();

    expect(await service.getForAdmin()).toEqual({
      postingEnabled: row.postingEnabled,
      repliesEnabled: row.repliesEnabled,
      attachmentsEnabled: row.attachmentsEnabled,
      reactionsEnabled: row.reactionsEnabled,
      newMemberPostingDelayMinutes: row.newMemberPostingDelayMinutes,
      requireApprovalForNewMembers: row.requireApprovalForNewMembers,
      adsterraEnabled: row.adsterraEnabled,
      adsterraSiteId: row.adsterraSiteId,
      monetagEnabled: row.monetagEnabled,
      monetagZoneId: row.monetagZoneId,
    });
  });

  describe('getPublicAdSettings', () => {
    it('withholds a network as disabled when the toggle is on but the ID is unset', async () => {
      const { service } = setup({ adsterraEnabled: true, adsterraSiteId: null });

      expect(await service.getPublicAdSettings()).toMatchObject({
        adsterra: { enabled: false, siteId: null },
      });
    });

    it('withholds a network as disabled when the ID is set but the toggle is off', async () => {
      const { service } = setup({ monetagEnabled: false, monetagZoneId: 'zone-1' });

      expect(await service.getPublicAdSettings()).toMatchObject({
        monetag: { enabled: false, zoneId: null },
      });
    });

    it('reports a fully-configured network as enabled with its ID', async () => {
      const { service } = setup({
        adsterraEnabled: true,
        adsterraSiteId: 'site-1',
        monetagEnabled: true,
        monetagZoneId: 'zone-1',
      });

      expect(await service.getPublicAdSettings()).toEqual({
        adsterra: { enabled: true, siteId: 'site-1' },
        monetag: { enabled: true, zoneId: 'zone-1' },
      });
    });
  });

  it('update() writes through and refreshes the cache immediately', async () => {
    const { service, prisma } = setup();
    prisma.communitySettings.upsert.mockResolvedValueOnce({
      id: 'default',
      postingEnabled: false,
      repliesEnabled: true,
      attachmentsEnabled: true,
      reactionsEnabled: true,
      newMemberPostingDelayMinutes: 0,
      requireApprovalForNewMembers: false,
      adsterraEnabled: false,
      adsterraSiteId: null,
      monetagEnabled: false,
      monetagZoneId: null,
    });

    const result = await service.update({ postingEnabled: false });

    expect(result.postingEnabled).toBe(false);
    expect(await service.isPostingEnabled()).toBe(false);
    expect(prisma.communitySettings.upsert).toHaveBeenCalledTimes(1);
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DykService } from './dyk.service';

const NOTICE_ID = 'notice-1';
const USER_ID = 'user-1';

function baseNotice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTICE_ID,
    content: 'Turn every shared photo into an invitation.',
    imageKey: 'dyk/abc-123.jpg',
    imageBucket: 'dialectiva-marketing',
    href: '/dashboard',
    stopCondition: 'CLICKED',
    targetId: null,
    active: true,
    sortOrder: 0,
    ...overrides,
  };
}

function setup(overrides: {
  settings?: Partial<Record<string, unknown>>;
  notices?: ReturnType<typeof baseNotice>[];
  state?: Partial<Record<string, unknown>> | null;
  course?: { id: string } | null;
} = {}) {
  const settings = {
    id: 'default',
    enabled: true,
    intervalMinutes: 60,
    maxDisplays: 3,
    ...overrides.settings,
  };
  const notices = overrides.notices ?? [baseNotice()];
  const stateByKey = new Map<string, Record<string, unknown>>();
  if (overrides.state) {
    stateByKey.set(`${USER_ID}:${NOTICE_ID}`, { userId: USER_ID, noticeId: NOTICE_ID, displays: 0, lastShownAt: null, clickedAt: null, ...overrides.state });
  }

  const prisma = {
    dykSettings: {
      upsert: jest.fn().mockResolvedValue(settings),
      findUnique: jest.fn().mockResolvedValue(settings),
    },
    dykNotice: {
      findMany: jest.fn().mockImplementation(({ where }: { where?: { active?: boolean } } = {}) => {
        const filtered = where?.active === undefined ? notices : notices.filter((n) => n.active === where.active);
        return Promise.resolve(
          filtered.map((n) => ({ ...n, states: overrides.state && n.id === NOTICE_ID ? [stateByKey.get(`${USER_ID}:${NOTICE_ID}`)] : [] })),
        );
      }),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(notices.find((n) => n.id === where.id) ?? null),
      ),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-notice', ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...notices.find((n) => n.id === where.id), ...data }),
      ),
      delete: jest.fn().mockResolvedValue({ id: NOTICE_ID }),
    },
    dykUserState: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(overrides.state ? stateByKey.get(`${USER_ID}:${NOTICE_ID}`) ?? null : null)),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { userId_noticeId: { userId: string; noticeId: string } } }) =>
        Promise.resolve(stateByKey.get(`${where.userId_noticeId.userId}:${where.userId_noticeId.noticeId}`) ?? null),
      ),
      upsert: jest.fn().mockImplementation(({ where, create, update }: { where: { userId_noticeId: { userId: string; noticeId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = `${where.userId_noticeId.userId}:${where.userId_noticeId.noticeId}`;
        const existing = stateByKey.get(key);
        const next = existing ? { ...existing, displays: (existing.displays as number) + 1, lastShownAt: new Date() } : { ...create };
        Object.assign(next, update.clickedAt !== undefined ? { clickedAt: update.clickedAt } : {});
        stateByKey.set(key, next);
        return Promise.resolve(next);
      }),
    },
    course: {
      findUnique: jest.fn().mockResolvedValue(overrides.course ?? null),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: USER_ID }]),
    $transaction: undefined as unknown as (fn: (tx: unknown) => unknown) => Promise<unknown>,
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(prisma)));

  const storage = {
    getPublicObjectUrl: jest.fn((bucket: string, key: string) => `https://cdn.example.com/${bucket}/${key}`),
    createPresignedUploadUrl: jest.fn().mockResolvedValue({ url: 'https://upload.example.com', key: 'dyk/new.jpg', expiresInSeconds: 900 }),
  };

  const service = new DykService(prisma as never, storage as never);
  return { service, prisma, storage, stateByKey };
}

describe('DykService.saveNotice validation', () => {
  it('rejects an image bucket that does not match the configured marketing bucket', async () => {
    const { service } = setup();
    await expect(
      service.saveNotice({
        content: 'x',
        imageKey: 'dyk/a.jpg',
        imageBucket: 'wrong-bucket',
        href: '/dashboard',
        stopCondition: 'CLICKED',
        active: true,
        sortOrder: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an href that is neither an internal route nor an approved HTTPS host', async () => {
    const { service } = setup();
    await expect(
      service.saveNotice({
        content: 'x',
        imageKey: 'dyk/a.jpg',
        imageBucket: 'dialectiva-marketing',
        href: 'https://evil.example.com/phish',
        stopCondition: 'CLICKED',
        active: true,
        sortOrder: 0,
      }),
    ).rejects.toThrow('Choose an internal route or approved HTTPS channel');
  });

  it('accepts an internal route', async () => {
    const { service, prisma } = setup();
    await service.saveNotice({
      content: 'x',
      imageKey: 'dyk/a.jpg',
      imageBucket: 'dialectiva-marketing',
      href: '/dashboard/payout-accounts',
      stopCondition: 'CLICKED',
      active: true,
      sortOrder: 0,
    });
    expect(prisma.dykNotice.create).toHaveBeenCalled();
  });

  it('accepts an approved external HTTPS host', async () => {
    const { service, prisma } = setup();
    await service.saveNotice({
      content: 'x',
      imageKey: 'dyk/a.jpg',
      imageBucket: 'dialectiva-marketing',
      href: 'https://wa.me/1234567890',
      stopCondition: 'CLICKED',
      active: true,
      sortOrder: 0,
    });
    expect(prisma.dykNotice.create).toHaveBeenCalled();
  });

  it('rejects a protocol-relative or javascript: style href masquerading as internal', async () => {
    const { service } = setup();
    await expect(
      service.saveNotice({
        content: 'x',
        imageKey: 'dyk/a.jpg',
        imageBucket: 'dialectiva-marketing',
        href: '//evil.example.com',
        stopCondition: 'CLICKED',
        active: true,
        sortOrder: 0,
      }),
    ).rejects.toThrow('Choose an internal route or approved HTTPS channel');
  });

  it('rejects empty content', async () => {
    const { service } = setup();
    await expect(
      service.saveNotice({
        content: '   ',
        imageKey: 'dyk/a.jpg',
        imageBucket: 'dialectiva-marketing',
        href: '/dashboard',
        stopCondition: 'CLICKED',
        active: true,
        sortOrder: 0,
      }),
    ).rejects.toThrow('Content is required');
  });

  it('rejects a COURSE stop condition whose targetId does not reference a real course', async () => {
    const { service } = setup({ course: null });
    await expect(
      service.saveNotice({
        content: 'x',
        imageKey: 'dyk/a.jpg',
        imageBucket: 'dialectiva-marketing',
        href: '/dashboard',
        stopCondition: 'COURSE',
        targetId: 'nonexistent-course',
        active: true,
        sortOrder: 0,
      }),
    ).rejects.toThrow('Choose an existing course ID');
  });

  it('accepts a COURSE stop condition with a real course', async () => {
    const { service, prisma } = setup({ course: { id: 'course-1' } });
    await service.saveNotice({
      content: 'x',
      imageKey: 'dyk/a.jpg',
      imageBucket: 'dialectiva-marketing',
      href: '/dashboard',
      stopCondition: 'COURSE',
      targetId: 'course-1',
      active: true,
      sortOrder: 0,
    });
    expect(prisma.dykNotice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetId: 'course-1' }) }),
    );
  });

  it('nulls out targetId for a non-COURSE stop condition even if one was submitted', async () => {
    const { service, prisma } = setup();
    await service.saveNotice({
      content: 'x',
      imageKey: 'dyk/a.jpg',
      imageBucket: 'dialectiva-marketing',
      href: '/dashboard',
      stopCondition: 'CLICKED',
      targetId: 'course-1',
      active: true,
      sortOrder: 0,
    });
    expect(prisma.dykNotice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetId: null }) }),
    );
  });
});

describe('DykService.feed', () => {
  it('returns nothing when the feature is disabled platform-wide', async () => {
    const { service } = setup({ settings: { enabled: false } });
    await expect(service.feed(USER_ID)).resolves.toEqual({ items: [], nextAt: null });
  });

  it('excludes a notice that has already hit its per-user display cap', async () => {
    const { service } = setup({ settings: { maxDisplays: 2 }, state: { displays: 2 } });
    const result = await service.feed(USER_ID);
    expect(result.items).toHaveLength(0);
  });

  it('excludes a CLICKED-stop notice the user has already clicked', async () => {
    const { service } = setup({ notices: [baseNotice({ stopCondition: 'CLICKED' })], state: { clickedAt: new Date() } });
    const result = await service.feed(USER_ID);
    expect(result.items).toHaveLength(0);
  });

  it('excludes a notice still inside its reminder interval', async () => {
    const { service } = setup({ settings: { intervalMinutes: 60 }, state: { lastShownAt: new Date() } });
    const result = await service.feed(USER_ID);
    expect(result.items).toHaveLength(0);
  });

  it('includes a notice once its interval has elapsed', async () => {
    const { service } = setup({
      settings: { intervalMinutes: 60 },
      state: { lastShownAt: new Date(Date.now() - 61 * 60_000) },
    });
    const result = await service.feed(USER_ID);
    expect(result.items).toHaveLength(1);
  });

  it('excludes a notice whose stop condition the trainer has already adopted', async () => {
    const { service, prisma } = setup({ notices: [baseNotice({ stopCondition: 'TRAINING' })] });
    prisma.dykNotice.findMany.mockResolvedValueOnce([
      { ...baseNotice({ stopCondition: 'TRAINING' }), states: [] },
    ]);
    (prisma as unknown as { wordRecording: { findFirst: jest.Mock } }).wordRecording = {
      findFirst: jest.fn().mockResolvedValue({ id: 'rec-1' }),
    };
    const result = await service.feed(USER_ID);
    expect(result.items).toHaveLength(0);
  });
});

describe('DykService.impression', () => {
  it('allows the first impression of a notice and records it', async () => {
    const { service, stateByKey } = setup();
    const result = await service.impression(USER_ID, NOTICE_ID);
    expect(result).toEqual({ allowed: true });
    expect(stateByKey.get(`${USER_ID}:${NOTICE_ID}`)).toMatchObject({ displays: 1 });
  });

  it('denies once the per-notice display cap is reached', async () => {
    const { service } = setup({ settings: { maxDisplays: 1 }, state: { displays: 1 } });
    await expect(service.impression(USER_ID, NOTICE_ID)).resolves.toEqual({ allowed: false });
  });

  it('denies a CLICKED-stop notice already clicked', async () => {
    const { service } = setup({ notices: [baseNotice({ stopCondition: 'CLICKED' })], state: { clickedAt: new Date() } });
    await expect(service.impression(USER_ID, NOTICE_ID)).resolves.toEqual({ allowed: false });
  });

  it('denies while still inside the reminder interval', async () => {
    const { service } = setup({ settings: { intervalMinutes: 60 }, state: { lastShownAt: new Date() } });
    await expect(service.impression(USER_ID, NOTICE_ID)).resolves.toEqual({ allowed: false });
  });

  it('denies when the feature is disabled platform-wide', async () => {
    const { service } = setup({ settings: { enabled: false } });
    await expect(service.impression(USER_ID, NOTICE_ID)).resolves.toEqual({ allowed: false });
  });

  it('denies when the notice is inactive', async () => {
    const { service } = setup({ notices: [baseNotice({ active: false })] });
    await expect(service.impression(USER_ID, NOTICE_ID)).resolves.toEqual({ allowed: false });
  });

  it('navigation=true bypasses the global cross-notice throttle', async () => {
    const { service, prisma } = setup();
    (prisma.dykUserState.findFirst as jest.Mock).mockResolvedValueOnce({ userId: USER_ID, noticeId: 'other-notice', lastShownAt: new Date() });
    const result = await service.impression(USER_ID, NOTICE_ID, true);
    expect(result).toEqual({ allowed: true });
  });
});

describe('DykService.click', () => {
  it('records the click and returns the href', async () => {
    const { service, stateByKey } = setup();
    const result = await service.click(USER_ID, NOTICE_ID);
    expect(result).toEqual({ href: '/dashboard' });
    expect(stateByKey.get(`${USER_ID}:${NOTICE_ID}`)?.clickedAt).toBeInstanceOf(Date);
  });

  it('404s for an inactive notice', async () => {
    const { service } = setup({ notices: [baseNotice({ active: false })] });
    await expect(service.click(USER_ID, NOTICE_ID)).rejects.toThrow(NotFoundException);
  });
});

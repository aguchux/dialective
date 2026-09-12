import { KycService } from './kyc.service';

function setup() {
  const kycVerification = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const prisma = { kycVerification };
  const didit = {};
  const selfHosted = {};
  const settings = {};
  const service = new KycService(prisma as never, didit as never, selfHosted as never, settings as never);
  return { service, prisma };
}

describe('KycService.adminList', () => {
  it('filters by status alone when no search term is given', async () => {
    const { service, prisma } = setup();

    await service.adminList({ status: 'IN_REVIEW' as never, page: 1, pageSize: 5 });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'IN_REVIEW' } }),
    );
    expect(prisma.kycVerification.count).toHaveBeenCalledWith({ where: { status: 'IN_REVIEW' } });
  });

  it('matches name, email, or mobile number on the verification\'s user, case-insensitively', async () => {
    const { service, prisma } = setup();

    await service.adminList({ search: 'Ada', page: 1, pageSize: 5 });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: {
            OR: [
              { email: { contains: 'Ada', mode: 'insensitive' } },
              { firstName: { contains: 'Ada', mode: 'insensitive' } },
              { lastName: { contains: 'Ada', mode: 'insensitive' } },
              { phoneNumber: { contains: 'Ada', mode: 'insensitive' } },
            ],
          },
        },
      }),
    );
  });

  it('combines a status filter and a search term', async () => {
    const { service, prisma } = setup();

    await service.adminList({ status: 'APPROVED' as never, search: '447700', page: 1, pageSize: 5 });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          user: expect.objectContaining({
            OR: expect.arrayContaining([
              { phoneNumber: { contains: '447700', mode: 'insensitive' } },
            ]),
          }),
        }),
      }),
    );
  });

  it('trims whitespace from the search term and ignores an empty/whitespace-only search', async () => {
    const { service, prisma } = setup();

    await service.adminList({ search: '   ', page: 1, pageSize: 5 });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('paginates using the given page/pageSize, defaulting to a page size the admin can request as low as 5', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.count.mockResolvedValue(12);

    const result = await service.adminList({ page: 2, pageSize: 5 });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(result).toMatchObject({ page: 2, pageSize: 5, total: 12, totalPages: 3 });
  });
});

import { FxRateService, parseFxRates } from './fx-rate.service';

describe('parseFxRates', () => {
  it('extracts positive numeric rates from a successful response', () => {
    expect(parseFxRates({ result: 'success', rates: { NGN: 1500, KES: 129, ZERO: 0 } })).toEqual({
      NGN: 1500,
      KES: 129,
    });
  });

  it('throws when result is not "success"', () => {
    expect(() => parseFxRates({ result: 'error', rates: {} })).toThrow();
  });

  it('throws on a non-object response', () => {
    expect(() => parseFxRates(null)).toThrow();
    expect(() => parseFxRates('nope')).toThrow();
  });
});

describe('FxRateService.run', () => {
  let prisma: any;
  let service: FxRateService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    prisma = {
      country: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new FxRateService(prisma as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('updates only LIVE-source countries whose currency is present in the API response', async () => {
    prisma.country.findMany.mockResolvedValue([
      { id: 'c-ng', currencyCode: 'NGN' },
      { id: 'c-us', currencyCode: 'USD' },
      { id: 'c-xx', currencyCode: 'ZZZ' },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', rates: { NGN: 1500 } }),
    }) as any;

    await service.run();

    expect(prisma.country.update).toHaveBeenCalledTimes(2);
    expect(prisma.country.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-ng' }, data: expect.objectContaining({ usdExchangeRate: 1500 }) }),
    );
    expect(prisma.country.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-us' }, data: expect.objectContaining({ usdExchangeRate: 1 }) }),
    );
  });

  it('skips the fetch entirely and touches no rows when there are no LIVE-source countries', async () => {
    prisma.country.findMany.mockResolvedValue([]);
    global.fetch = jest.fn() as any;

    await service.run();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.country.update).not.toHaveBeenCalled();
  });

  it('throws and touches no rows when the FX API request fails', async () => {
    prisma.country.findMany.mockResolvedValue([{ id: 'c-ng', currencyCode: 'NGN' }]);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }) as any;

    await expect(service.run()).rejects.toThrow('FX API request failed');
    expect(prisma.country.update).not.toHaveBeenCalled();
  });
});

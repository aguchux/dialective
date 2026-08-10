import { createHmac } from 'crypto';
import { NowPaymentsService } from './nowpayments.service';

describe('NowPaymentsService IPN verification', () => {
  const secret = 'test-ipn-secret';
  let service: NowPaymentsService;

  beforeEach(() => {
    process.env.NOWPAYMENTS_IPN_SECRET = secret;
    service = new NowPaymentsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NOWPAYMENTS_API_KEY;
    delete process.env.NOWPAYMENTS_IPN_SECRET;
  });

  it.each([
    ['USDT' as const, 'usdttrc20'],
    ['USDC' as const, 'usdc'],
  ])('maps %s to the merchant-enabled NOWPayments currency %s', async (payCurrency, providerCurrency) => {
    process.env.NOWPAYMENTS_API_KEY = 'test-api-key';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'invoice-id', invoice_url: 'https://nowpayments.io/payment/test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      service.createInvoice({
        usdAmount: 10,
        payCurrency,
        orderId: 'deposit-id',
        orderDescription: 'Test deposit',
        ipnCallbackUrl: 'https://api.example.com/api/v1/wallet/webhooks/nowpayments',
      }),
    ).resolves.toEqual({ invoiceId: 'invoice-id', invoiceUrl: 'https://nowpayments.io/payment/test' });

    const request = fetchSpy.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ pay_currency: providerCurrency });
  });

  it('accepts the HMAC-SHA512 signature of a recursively sorted payload', () => {
    const payload = {
      payment_status: 'finished',
      payment_id: 12345,
      fee: { serviceFee: 0, depositFee: 0.01 },
      order_id: 'deposit-id',
    };
    const canonical =
      '{"fee":{"depositFee":0.01,"serviceFee":0},"order_id":"deposit-id","payment_id":12345,"payment_status":"finished"}';
    const signature = createHmac('sha512', secret).update(canonical).digest('hex');

    expect(service.verifyIpnSignature(payload, signature)).toBe(true);
  });

  it.each([undefined, '', 'not-hex', '00'])('rejects a missing or malformed signature: %s', (signature) => {
    expect(service.verifyIpnSignature({ payment_id: 1 }, signature)).toBe(false);
  });

  it('produces the same event hash regardless of incoming key order', () => {
    expect(service.getIpnEventHash({ status: 'finished', id: 1, fee: { z: 2, a: 1 } })).toBe(
      service.getIpnEventHash({ fee: { a: 1, z: 2 }, id: 1, status: 'finished' }),
    );
  });

  it('does not create an invoice when the IPN secret is unavailable', async () => {
    delete process.env.NOWPAYMENTS_IPN_SECRET;
    process.env.NOWPAYMENTS_API_KEY = 'test-api-key';
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      service.createInvoice({
        usdAmount: 10,
        payCurrency: 'USDT',
        orderId: 'deposit-id',
        orderDescription: 'Test deposit',
        ipnCallbackUrl: 'https://api.example.com/api/v1/wallet/webhooks/nowpayments',
      }),
    ).rejects.toThrow('NOWPAYMENTS_IPN_SECRET is not set');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

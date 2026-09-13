import { MetaWhatsAppProvider } from './meta-whatsapp.provider';

function mockFetchOk() {
  return jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
}

describe('MetaWhatsAppProvider', () => {
  const originalFetch = global.fetch;
  const config = {
    accessToken: 'test-token',
    phoneNumberId: '123456789',
    templateName: 'otp_code',
    templateLanguage: 'en_US',
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to the Meta Graph API endpoint with the expected shape', async () => {
    const fetchMock = mockFetchOk();
    global.fetch = fetchMock as never;

    await new MetaWhatsAppProvider().send('+15559876543', '123456', config);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/123456789/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+15559876543',
      type: 'template',
      template: {
        name: 'otp_code',
        language: { code: 'en_US' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: '123456' }] }],
      },
    });
  });

  it('throws with the status and body text on a non-2xx response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid access token' }) as never;

    await expect(new MetaWhatsAppProvider().send('+15559876543', '123456', config)).rejects.toThrow(
      'Meta WhatsApp request failed: 401 invalid access token',
    );
  });
});

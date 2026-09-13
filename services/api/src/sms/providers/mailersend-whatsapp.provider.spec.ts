import { MailerSendWhatsAppProvider } from './mailersend-whatsapp.provider';

function mockFetchOk() {
  return jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
}

describe('MailerSendWhatsAppProvider', () => {
  const originalFetch = global.fetch;
  const config = { apiKey: 'test-key', senderId: '15550001234', templateId: 'otp_code' };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to the MailerSend WhatsApp endpoint with the expected shape', async () => {
    const fetchMock = mockFetchOk();
    global.fetch = fetchMock as never;

    await new MailerSendWhatsAppProvider().send('+15559876543', '123456', config);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mailersend.com/v1/whatsapp/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      from: '15550001234',
      to: ['+15559876543'],
      template_id: 'otp_code',
      personalization: [{ to: '+15559876543', data: { body: ['123456'] } }],
    });
  });

  it('throws with the status and body text on a non-2xx response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 422, text: async () => 'template not approved' }) as never;

    await expect(new MailerSendWhatsAppProvider().send('+15559876543', '123456', config)).rejects.toThrow(
      'MailerSend WhatsApp request failed: 422 template not approved',
    );
  });
});

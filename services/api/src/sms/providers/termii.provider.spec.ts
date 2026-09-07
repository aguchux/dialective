import { TermiiProvider } from './termii.provider';

function mockFetchOk() {
  return jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
}

describe('TermiiProvider channel selection', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, TERMII_API_KEY: 'key', TERMII_SENDER_ID: 'Sender' };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  function sentChannel(fetchMock: jest.Mock): string {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    return body.channel;
  }

  it('defaults to the generic channel when TERMII_CHANNEL is unset', async () => {
    const fetchMock = mockFetchOk();
    global.fetch = fetchMock as never;

    await new TermiiProvider().send('+15551234567', 'code');

    expect(sentChannel(fetchMock)).toBe('generic');
  });

  it('uses the dnd channel when TERMII_CHANNEL=dnd (bypasses Nigeria DND filtering)', async () => {
    process.env.TERMII_CHANNEL = 'dnd';
    const fetchMock = mockFetchOk();
    global.fetch = fetchMock as never;

    await new TermiiProvider().send('+2348012345678', 'code');

    expect(sentChannel(fetchMock)).toBe('dnd');
  });

  it('is case-insensitive and trims whitespace', async () => {
    process.env.TERMII_CHANNEL = '  DND  ';
    const fetchMock = mockFetchOk();
    global.fetch = fetchMock as never;

    await new TermiiProvider().send('+2348012345678', 'code');

    expect(sentChannel(fetchMock)).toBe('dnd');
  });

  it('falls back to generic for an unrecognized channel value', async () => {
    process.env.TERMII_CHANNEL = 'not-a-real-channel';
    const fetchMock = mockFetchOk();
    global.fetch = fetchMock as never;

    await new TermiiProvider().send('+2348012345678', 'code');

    expect(sentChannel(fetchMock)).toBe('generic');
  });
});

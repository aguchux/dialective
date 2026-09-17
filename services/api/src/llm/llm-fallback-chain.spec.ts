import { LlmFallbackChain } from './llm-fallback-chain';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';

function makeProvider(key: LlmProviderKey, opts: { imageCapable?: boolean } = {}): LlmProvider {
  const provider: LlmProvider = {
    key,
    normalize: jest.fn().mockResolvedValue(`${key}-text`),
  };
  if (opts.imageCapable) {
    provider.describeImage = jest.fn().mockResolvedValue(`${key}-image-text`);
  }
  return provider;
}

describe('LlmFallbackChain.describeImage', () => {
  it('skips providers that do not implement describeImage (e.g. deepseek) rather than calling and failing on them', async () => {
    const openai = makeProvider('openai', { imageCapable: true });
    const deepseek = makeProvider('deepseek'); // no describeImage
    const anthropic = makeProvider('anthropic', { imageCapable: true });
    const chain = new LlmFallbackChain({ openai, deepseek, anthropic });

    const result = await chain.describeImage('base64', 'image/jpeg', 'prompt', [
      'deepseek',
      'openai',
      'anthropic',
    ]);

    expect(result).toEqual({ text: 'openai-image-text', provider: 'openai' });
    expect(openai.describeImage).toHaveBeenCalledWith('base64', 'image/jpeg', 'prompt');
  });

  it('throws when no provider in the given order implements describeImage', async () => {
    const deepseek = makeProvider('deepseek');
    const chain = new LlmFallbackChain({
      openai: makeProvider('openai'),
      deepseek,
      anthropic: makeProvider('anthropic'),
    });

    await expect(chain.describeImage('b64', 'image/jpeg', 'prompt', ['deepseek'])).rejects.toThrow(
      /No image-capable/,
    );
  });

  it('falls through to the next image-capable provider on failure', async () => {
    const openai = makeProvider('openai', { imageCapable: true });
    (openai.describeImage as jest.Mock).mockRejectedValue(new Error('rate limited'));
    const anthropic = makeProvider('anthropic', { imageCapable: true });
    const chain = new LlmFallbackChain({ openai, deepseek: makeProvider('deepseek'), anthropic });

    const result = await chain.describeImage('b64', 'image/jpeg', 'prompt', [
      'openai',
      'anthropic',
    ]);

    expect(result.provider).toBe('anthropic');
  });
});

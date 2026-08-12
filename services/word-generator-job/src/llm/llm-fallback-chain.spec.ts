import { LlmFallbackChain } from './llm-fallback-chain';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';

function fakeProvider(key: LlmProviderKey, impl: () => Promise<string[]>): LlmProvider {
  return { key, generate: jest.fn(impl) };
}

describe('LlmFallbackChain', () => {
  it('uses the first provider when it succeeds, never calling the others', async () => {
    const openai = fakeProvider('openai', async () => ['a', 'b']);
    const deepseek = fakeProvider('deepseek', async () => ['x']);
    const anthropic = fakeProvider('anthropic', async () => ['y']);
    const chain = new LlmFallbackChain({ openai, deepseek, anthropic });

    const result = await chain.generate('prompt', ['openai', 'deepseek', 'anthropic']);

    expect(result).toEqual({ items: ['a', 'b'], provider: 'openai' });
    expect(openai.generate).toHaveBeenCalledTimes(1);
    expect(deepseek.generate).not.toHaveBeenCalled();
    expect(anthropic.generate).not.toHaveBeenCalled();
  });

  it('falls back to the second provider when the first throws, never calling the third', async () => {
    const openai = fakeProvider('openai', async () => {
      throw new Error('rate limited');
    });
    const deepseek = fakeProvider('deepseek', async () => ['ok']);
    const anthropic = fakeProvider('anthropic', async () => ['unused']);
    const chain = new LlmFallbackChain({ openai, deepseek, anthropic });

    const result = await chain.generate('prompt', ['openai', 'deepseek', 'anthropic']);

    expect(result).toEqual({ items: ['ok'], provider: 'deepseek' });
    expect(openai.generate).toHaveBeenCalledTimes(1);
    expect(deepseek.generate).toHaveBeenCalledTimes(1);
    expect(anthropic.generate).not.toHaveBeenCalled();
  });

  it('throws a combined error, with no unhandled rejection, when every provider fails', async () => {
    const openai = fakeProvider('openai', async () => {
      throw new Error('bad key');
    });
    const deepseek = fakeProvider('deepseek', async () => {
      throw new Error('timeout');
    });
    const anthropic = fakeProvider('anthropic', async () => {
      throw new Error('malformed json');
    });
    const chain = new LlmFallbackChain({ openai, deepseek, anthropic });

    await expect(chain.generate('prompt', ['openai', 'deepseek', 'anthropic'])).rejects.toThrow(
      /openai: bad key.*deepseek: timeout.*anthropic: malformed json/s,
    );
  });

  it('respects a custom (non-default) provider order', async () => {
    const openai = fakeProvider('openai', async () => ['unused']);
    const deepseek = fakeProvider('deepseek', async () => ['unused']);
    const anthropic = fakeProvider('anthropic', async () => ['first']);
    const chain = new LlmFallbackChain({ openai, deepseek, anthropic });

    const result = await chain.generate('prompt', ['anthropic', 'openai', 'deepseek']);

    expect(result).toEqual({ items: ['first'], provider: 'anthropic' });
    expect(openai.generate).not.toHaveBeenCalled();
    expect(deepseek.generate).not.toHaveBeenCalled();
  });
});

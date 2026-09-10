import { WordGeneratorService } from './word-generator.service';

describe('WordGeneratorService.isGeneratedConversationSentence', () => {
  function setup() {
    const prisma: any = {};
    const service = new WordGeneratorService(prisma as never);
    return service;
  }

  // Access the private method the same way this codebase's other specs
  // reach into services for unit-level coverage of non-exported logic
  // (see word-generator.composition.spec.ts).
  function callFilter(service: WordGeneratorService, text: string, wordCount: number): boolean {
    return (service as any).isGeneratedConversationSentence(text, wordCount);
  }

  it('accepts a sentence with exactly the configured word count', () => {
    const service = setup();
    expect(callFilter(service, 'What is your name?', 4)).toBe(true);
  });

  it('accepts a sentence with fewer words than the configured ceiling', () => {
    const service = setup();
    expect(callFilter(service, 'I am hungry.', 4)).toBe(true);
    expect(callFilter(service, 'Stop.', 4)).toBe(true);
  });

  it('rejects a sentence with more words than the configured ceiling', () => {
    const service = setup();
    expect(callFilter(service, 'I am going to the market to buy yam.', 4)).toBe(false);
  });

  it('rejects an empty or non-sentence string', () => {
    const service = setup();
    expect(callFilter(service, '', 4)).toBe(false);
  });

  it('rejects a sentence with a token longer than 15 characters', () => {
    const service = setup();
    expect(callFilter(service, 'This is antidisestablishmentarianism.', 4)).toBe(false);
  });

  it('rejects text missing terminal punctuation', () => {
    const service = setup();
    expect(callFilter(service, 'What is your name', 4)).toBe(false);
  });
});

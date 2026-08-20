import { countPromptWords } from './prompt-length.util';

describe('countPromptWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countPromptWords('hello world')).toBe(2);
    expect(countPromptWords('one two three four five')).toBe(5);
  });

  it('never returns less than 1, even for empty/whitespace-only text', () => {
    expect(countPromptWords('')).toBe(1);
    expect(countPromptWords('   ')).toBe(1);
  });

  it('collapses repeated whitespace/newlines between words', () => {
    expect(countPromptWords('hello   world\n\nagain')).toBe(3);
  });

  it('scales to a paragraph-length prompt', () => {
    const paragraph = Array.from({ length: 76 }, (_, i) => `word${i}`).join(' ');
    expect(countPromptWords(paragraph)).toBe(76);
  });
});

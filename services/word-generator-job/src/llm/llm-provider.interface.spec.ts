import { parseJsonStringArray } from './llm-provider.interface';

describe('parseJsonStringArray', () => {
  it('parses a bare JSON array of strings', () => {
    expect(parseJsonStringArray('["church", "market"]')).toEqual(['church', 'market']);
  });

  it('parses an { items: [...] } wrapper (OpenAI/DeepSeek json_object mode requires an object root)', () => {
    expect(parseJsonStringArray('{"items": ["one", "two"]}')).toEqual(['one', 'two']);
  });

  it('trims whitespace from each item', () => {
    expect(parseJsonStringArray('["  church  ", "market "]')).toEqual(['church', 'market']);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseJsonStringArray('not json')).toThrow('not valid JSON');
  });

  it('throws when the JSON is not an array or { items } wrapper', () => {
    expect(() => parseJsonStringArray('{"foo": "bar"}')).toThrow('was not an array');
  });

  it('throws when the array contains a non-string item', () => {
    expect(() => parseJsonStringArray('["ok", 5]')).toThrow('non-string or empty');
  });

  it('throws when the array contains an empty string', () => {
    expect(() => parseJsonStringArray('["ok", "  "]')).toThrow('non-string or empty');
  });
});

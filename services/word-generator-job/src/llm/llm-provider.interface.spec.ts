import { parseJsonStringArray, parsePosItemArray } from './llm-provider.interface';

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

describe('parsePosItemArray', () => {
  it('parses a bare JSON array of {text, partOfSpeech} items', () => {
    expect(parsePosItemArray('[{"text": "cat", "partOfSpeech": "NOUN"}]')).toEqual([{ text: 'cat', partOfSpeech: 'NOUN' }]);
  });

  it('parses an { items: [...] } wrapper', () => {
    expect(parsePosItemArray('{"items": [{"text": "run", "partOfSpeech": "VERB"}]}')).toEqual([{ text: 'run', partOfSpeech: 'VERB' }]);
  });

  it('trims text and normalizes partOfSpeech casing', () => {
    expect(parsePosItemArray('[{"text": "  cat  ", "partOfSpeech": "noun"}]')).toEqual([{ text: 'cat', partOfSpeech: 'NOUN' }]);
  });

  it('coerces an unrecognized partOfSpeech to OTHER instead of failing the batch', () => {
    expect(parsePosItemArray('[{"text": "cat", "partOfSpeech": "gerund"}]')).toEqual([{ text: 'cat', partOfSpeech: 'OTHER' }]);
  });

  it('coerces a missing partOfSpeech to OTHER', () => {
    expect(parsePosItemArray('[{"text": "cat"}]')).toEqual([{ text: 'cat', partOfSpeech: 'OTHER' }]);
  });

  it('skips items with missing/empty text without failing the whole batch', () => {
    expect(parsePosItemArray('[{"text": "cat", "partOfSpeech": "NOUN"}, {"partOfSpeech": "VERB"}, {"text": "  "}]')).toEqual([
      { text: 'cat', partOfSpeech: 'NOUN' },
    ]);
  });

  it('throws when every item is invalid', () => {
    expect(() => parsePosItemArray('[{"foo": "bar"}]')).toThrow('no valid');
  });

  it('throws on malformed JSON', () => {
    expect(() => parsePosItemArray('not json')).toThrow('not valid JSON');
  });
});

import { isFlaggedContent } from './content-filter';

describe('isFlaggedContent', () => {
  it('does not flag ordinary words', () => {
    expect(isFlaggedContent('church')).toBe(false);
    expect(isFlaggedContent('Go to the market')).toBe(false);
  });

  it('flags a known profane word', () => {
    expect(isFlaggedContent('fuck')).toBe(true);
  });
});

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** True if text (English source or a translation) matches the profanity/slur wordlist. */
export function isFlaggedContent(text: string): boolean {
  return matcher.hasMatch(text);
}

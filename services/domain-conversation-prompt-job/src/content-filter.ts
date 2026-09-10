import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** True if text (a generated domain/scenario/prompt variant) matches the profanity/slur wordlist. */
export function isFlaggedContent(text: string): boolean {
  return matcher.hasMatch(text);
}

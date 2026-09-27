import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Which dialect to publish as a deck.
 *
 * The tag, not a deck id, because the deck row does not exist until this call
 * creates it -- the contributor is choosing one of the dialect groupings their
 * signed manifest already covers.
 *
 * Deliberately no `name` field. The deck is named from the dialect's own full
 * name, resolved server-side: a contributor-supplied name would be free text
 * on a subscriber-facing surface, which is a route to putting their own name
 * on a deck that is meant to carry no identity at all.
 */
export class PublishContributorDeckDto {
  @IsString()
  @MaxLength(64)
  // Same shape as dialect tags elsewhere: lowercase alphanumerics with
  // hyphens/underscores. Constrained here so the value can be used in a
  // generated deck key without further escaping.
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message: 'dialectTag must be a lowercase dialect tag',
  })
  dialectTag!: string;
}

import { BadRequestException } from '@nestjs/common';
import { calculateReadMinutes, deriveExcerpt, validateEditorDocument } from './blog-content.util';

describe('blog content utilities', () => {
  it('derives a plain SEO excerpt from the first non-empty paragraph', () => {
    const document = validateEditorDocument({
      blocks: [
        { type: 'header', data: { text: 'Ignored heading', level: 2 } },
        { type: 'paragraph', data: { text: '  <b>Voice data</b> &amp; local dialects matter. ' } },
      ],
    });
    expect(deriveExcerpt(document)).toBe('Voice data & local dialects matter.');
  });

  it('rejects unsupported blocks', () => {
    expect(() => validateEditorDocument({ blocks: [{ type: 'script', data: {} }] })).toThrow(
      BadRequestException,
    );
  });

  it('limits excerpts to 160 characters', () => {
    const document = validateEditorDocument({
      blocks: [{ type: 'paragraph', data: { text: 'word '.repeat(60) } }],
    });
    expect(deriveExcerpt(document).length).toBeLessThanOrEqual(160);
  });

  it('calculates a minimum one-minute reading time', () => {
    const document = validateEditorDocument({
      blocks: [{ type: 'paragraph', data: { text: 'A short post.' } }],
    });
    expect(calculateReadMinutes(document)).toBe(1);
  });
});

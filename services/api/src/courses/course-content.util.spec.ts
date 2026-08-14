import { BadRequestException } from '@nestjs/common';
import { validateCourseDocument } from './course-content.util';

function textDoc(text: string) {
  return { blocks: [{ type: 'paragraph', data: { text } }] };
}

describe('course content utilities', () => {
  it('accepts a well-formed slide document and trims/strips empty optional fields', () => {
    const document = validateCourseDocument({
      slides: [
        { text: textDoc('Welcome to the course'), imageUrl: 'https://cdn.example.com/a.png', audioUrl: '' },
        { text: textDoc('Second slide') },
      ],
    });
    expect(document.slides).toEqual([
      { text: textDoc('Welcome to the course'), imageUrl: 'https://cdn.example.com/a.png' },
      { text: textDoc('Second slide') },
    ]);
  });

  it('rejects an empty slides array', () => {
    expect(() => validateCourseDocument({ slides: [] })).toThrow(BadRequestException);
  });

  it('rejects more than 50 slides', () => {
    const slides = Array.from({ length: 51 }, (_, i) => ({ text: textDoc(`slide ${i}`) }));
    expect(() => validateCourseDocument({ slides })).toThrow(BadRequestException);
  });

  it('rejects a slide with missing or empty-block text', () => {
    expect(() => validateCourseDocument({ slides: [{ text: { blocks: [] } }] })).toThrow(BadRequestException);
    expect(() => validateCourseDocument({ slides: [{}] })).toThrow(BadRequestException);
  });

  it('rejects a slide whose text contains an unsupported Editor.js block', () => {
    expect(() => validateCourseDocument({ slides: [{ text: { blocks: [{ type: 'script', data: {} }] } }] })).toThrow(BadRequestException);
  });

  it('rejects a slide with more than 30 blocks', () => {
    const blocks = Array.from({ length: 31 }, () => ({ type: 'paragraph', data: { text: 'x' } }));
    expect(() => validateCourseDocument({ slides: [{ text: { blocks } }] })).toThrow(BadRequestException);
  });

  it('rejects a slide with a non-string imageUrl', () => {
    expect(() => validateCourseDocument({ slides: [{ text: textDoc('ok'), imageUrl: 123 }] })).toThrow(BadRequestException);
  });

  it('rejects when slides is not an array', () => {
    expect(() => validateCourseDocument({ slides: 'nope' })).toThrow(BadRequestException);
  });
});

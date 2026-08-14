import { BadRequestException } from '@nestjs/common';
import { validateCourseDocument } from './course-content.util';

describe('course content utilities', () => {
  it('accepts a well-formed slide document and trims/strips empty optional fields', () => {
    const document = validateCourseDocument({
      slides: [
        { text: '  Welcome to the course  ', imageUrl: 'https://cdn.example.com/a.png', audioUrl: '' },
        { text: 'Second slide' },
      ],
    });
    expect(document.slides).toEqual([
      { text: 'Welcome to the course', imageUrl: 'https://cdn.example.com/a.png' },
      { text: 'Second slide' },
    ]);
  });

  it('rejects an empty slides array', () => {
    expect(() => validateCourseDocument({ slides: [] })).toThrow(BadRequestException);
  });

  it('rejects more than 50 slides', () => {
    const slides = Array.from({ length: 51 }, (_, i) => ({ text: `slide ${i}` }));
    expect(() => validateCourseDocument({ slides })).toThrow(BadRequestException);
  });

  it('rejects a slide with missing or blank text', () => {
    expect(() => validateCourseDocument({ slides: [{ text: '' }] })).toThrow(BadRequestException);
    expect(() => validateCourseDocument({ slides: [{}] })).toThrow(BadRequestException);
  });

  it('rejects a slide with a non-string imageUrl', () => {
    expect(() => validateCourseDocument({ slides: [{ text: 'ok', imageUrl: 123 }] })).toThrow(BadRequestException);
  });

  it('rejects when slides is not an array', () => {
    expect(() => validateCourseDocument({ slides: 'nope' })).toThrow(BadRequestException);
  });
});

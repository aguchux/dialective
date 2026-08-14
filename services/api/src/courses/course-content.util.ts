import { BadRequestException } from '@nestjs/common';

const MAX_SLIDES = 50;
const MAX_SLIDE_TEXT_LENGTH = 4000;

interface CourseSlideInput {
  imageUrl?: unknown;
  imageAlt?: unknown;
  text?: unknown;
  audioUrl?: unknown;
}

export interface CourseSlide {
  imageUrl?: string;
  imageAlt?: string;
  text: string;
  audioUrl?: string;
}

export interface CourseDocument {
  slides: CourseSlide[];
}

export function validateCourseDocument(value: Record<string, unknown>): CourseDocument {
  const serialized = JSON.stringify(value);
  if (serialized.length > 1_000_000) {
    throw new BadRequestException('Course content is too large');
  }

  if (!Array.isArray(value.slides) || value.slides.length === 0 || value.slides.length > MAX_SLIDES) {
    throw new BadRequestException(`Course content must contain between 1 and ${MAX_SLIDES} slides`);
  }

  const slides = (value.slides as CourseSlideInput[]).map((slide, index) => {
    if (!slide || typeof slide !== 'object') {
      throw new BadRequestException(`Slide ${index + 1} is invalid`);
    }
    if (typeof slide.text !== 'string' || !slide.text.trim() || slide.text.length > MAX_SLIDE_TEXT_LENGTH) {
      throw new BadRequestException(`Slide ${index + 1} must have text between 1 and ${MAX_SLIDE_TEXT_LENGTH} characters`);
    }
    if (slide.imageUrl !== undefined && typeof slide.imageUrl !== 'string') {
      throw new BadRequestException(`Slide ${index + 1} has an invalid imageUrl`);
    }
    if (slide.imageAlt !== undefined && typeof slide.imageAlt !== 'string') {
      throw new BadRequestException(`Slide ${index + 1} has an invalid imageAlt`);
    }
    if (slide.audioUrl !== undefined && typeof slide.audioUrl !== 'string') {
      throw new BadRequestException(`Slide ${index + 1} has an invalid audioUrl`);
    }

    const result: CourseSlide = { text: slide.text.trim() };
    if (typeof slide.imageUrl === 'string' && slide.imageUrl) result.imageUrl = slide.imageUrl;
    if (typeof slide.imageAlt === 'string' && slide.imageAlt) result.imageAlt = slide.imageAlt;
    if (typeof slide.audioUrl === 'string' && slide.audioUrl) result.audioUrl = slide.audioUrl;
    return result;
  });

  return { slides };
}

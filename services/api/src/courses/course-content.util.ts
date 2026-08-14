import { BadRequestException } from '@nestjs/common';
import { EditorDocument, validateEditorDocument } from '../blog/blog-content.util';

const MAX_SLIDES = 50;
// A slide is a short narrated caption, not a full article -- capped well
// below blog posts' 500-block ceiling (see validateEditorDocument).
const MAX_SLIDE_BLOCKS = 30;

interface CourseSlideInput {
  imageUrl?: unknown;
  imageAlt?: unknown;
  text?: unknown;
  audioUrl?: unknown;
}

export interface CourseSlide {
  imageUrl?: string;
  imageAlt?: string;
  // Editor.js document, same block-JSON shape as BlogPost.content -- reuses
  // validateEditorDocument/BlogContent.tsx's renderer rather than a
  // duplicate plain-text/rich-text implementation.
  text: EditorDocument;
  audioUrl?: string;
}

export interface CourseDocument {
  slides: CourseSlide[];
}

function hasNonEmptyBlocks(document: EditorDocument): boolean {
  return document.blocks.length > 0;
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
    if (!slide.text || typeof slide.text !== 'object') {
      throw new BadRequestException(`Slide ${index + 1} must have text`);
    }
    let text: EditorDocument;
    try {
      text = validateEditorDocument(slide.text as Record<string, unknown>);
    } catch {
      throw new BadRequestException(`Slide ${index + 1} has invalid text content`);
    }
    if (text.blocks.length > MAX_SLIDE_BLOCKS) {
      throw new BadRequestException(`Slide ${index + 1} must contain at most ${MAX_SLIDE_BLOCKS} blocks`);
    }
    if (!hasNonEmptyBlocks(text)) {
      throw new BadRequestException(`Slide ${index + 1} must have text`);
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

    const result: CourseSlide = { text };
    if (typeof slide.imageUrl === 'string' && slide.imageUrl) result.imageUrl = slide.imageUrl;
    if (typeof slide.imageAlt === 'string' && slide.imageAlt) result.imageAlt = slide.imageAlt;
    if (typeof slide.audioUrl === 'string' && slide.audioUrl) result.audioUrl = slide.audioUrl;
    return result;
  });

  return { slides };
}

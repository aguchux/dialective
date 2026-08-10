import { BadRequestException } from '@nestjs/common';

const ALLOWED_BLOCKS = new Set([
  'paragraph', 'header', 'list', 'checklist', 'quote', 'table', 'image',
  'video', 'embed', 'delimiter', 'code', 'raw', 'button',
]);

interface EditorBlock {
  type?: unknown;
  data?: unknown;
}

export interface EditorDocument {
  time?: number;
  version?: string;
  blocks: EditorBlock[];
}

export function validateEditorDocument(value: Record<string, unknown>): EditorDocument {
  const serialized = JSON.stringify(value);
  if (serialized.length > 2_000_000) {
    throw new BadRequestException('Blog content is too large');
  }

  if (!Array.isArray(value.blocks) || value.blocks.length > 500) {
    throw new BadRequestException('Blog content must contain at most 500 blocks');
  }

  for (const block of value.blocks as EditorBlock[]) {
    if (!block || typeof block !== 'object' || typeof block.type !== 'string' || !ALLOWED_BLOCKS.has(block.type)) {
      throw new BadRequestException('Blog content contains an unsupported block');
    }
    if (!block.data || typeof block.data !== 'object' || Array.isArray(block.data)) {
      throw new BadRequestException(`Blog ${block.type} block has invalid data`);
    }
  }

  return value as unknown as EditorDocument;
}

export function deriveExcerpt(document: EditorDocument): string {
  const paragraph = document.blocks.find((block) => {
    if (block.type !== 'paragraph' || !block.data || typeof block.data !== 'object') return false;
    const text = (block.data as { text?: unknown }).text;
    return typeof text === 'string' && stripHtml(text).length > 0;
  });

  if (!paragraph?.data || typeof paragraph.data !== 'object') return '';
  return truncateAtWord(stripHtml(String((paragraph.data as { text?: unknown }).text ?? '')), 160);
}

export function calculateReadMinutes(document: EditorDocument): number {
  const text = JSON.stringify(document.blocks).replace(/<[^>]*>/g, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim();
  return Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 200));
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const contentLimit = limit - 3;
  const shortened = value.slice(0, contentLimit + 1);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > 100 ? lastSpace : contentLimit).trim()}...`;
}

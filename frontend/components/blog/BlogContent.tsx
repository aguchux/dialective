import Image from 'next/image';
import sanitizeHtml from 'sanitize-html';
import type { PublicEditorBlock } from '@/lib/blog-api';

const inlineSanitize: sanitizeHtml.IOptions = {
  allowedTags: ['strong', 'b', 'em', 'i', 'u', 's', 'mark', 'code', 'a', 'br'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

const rawSanitize: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'div', 'span', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'code', 'pre', 'a', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'button'],
  allowedAttributes: { a: ['href', 'target', 'rel'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], button: ['type'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

export function BlogContent({ blocks }: { blocks: PublicEditorBlock[] }) {
  return <div className="blog-prose">{blocks.map((block, index) => <BlogBlock block={block} key={block.id ?? `${block.type}-${index}`} />)}</div>;
}

function BlogBlock({ block }: { block: PublicEditorBlock }) {
  const data = block.data;
  switch (block.type) {
    case 'paragraph':
      return <p dangerouslySetInnerHTML={{ __html: inline(data.text) }} />;
    case 'header': {
      const level = Number(data.level);
      const html = { __html: inline(data.text) };
      if (level === 3) return <h3 dangerouslySetInnerHTML={html} />;
      if (level === 4) return <h4 dangerouslySetInnerHTML={html} />;
      return <h2 dangerouslySetInnerHTML={html} />;
    }
    case 'list':
      return <RichList items={Array.isArray(data.items) ? data.items : []} ordered={data.style === 'ordered'} />;
    case 'checklist':
      return <ul className="blog-checklist">{(Array.isArray(data.items) ? data.items : []).map((item, index) => {
        const entry = item as { text?: unknown; checked?: unknown };
        return <li key={index}><span aria-hidden="true" className={entry.checked ? 'is-checked' : ''}>{entry.checked ? '\u2713' : ''}</span><div dangerouslySetInnerHTML={{ __html: inline(entry.text) }} /></li>;
      })}</ul>;
    case 'quote':
      return <blockquote><div dangerouslySetInnerHTML={{ __html: inline(data.text) }} />{data.caption ? <cite dangerouslySetInnerHTML={{ __html: inline(data.caption) }} /> : null}</blockquote>;
    case 'table':
      return <BlogTable content={Array.isArray(data.content) ? data.content : []} withHeadings={Boolean(data.withHeadings)} />;
    case 'image': {
      const file = data.file as { url?: unknown } | undefined;
      const url = safeMediaUrl(file?.url);
      if (!url) return null;
      return <figure><Image alt={plain(data.caption)} className="blog-media" height={675} sizes="(max-width: 768px) 100vw, 760px" src={url} width={1200} />{data.caption ? <figcaption dangerouslySetInnerHTML={{ __html: inline(data.caption) }} /> : null}</figure>;
    }
    case 'video': {
      const url = safeMediaUrl(data.url);
      if (!url) return null;
      return <figure><video className="blog-media" controls preload="metadata" src={url} />{data.caption ? <figcaption dangerouslySetInnerHTML={{ __html: inline(data.caption) }} /> : null}</figure>;
    }
    case 'embed': {
      const url = safeEmbedUrl(data.embed);
      if (!url) return null;
      return <figure><div className="blog-embed"><iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" src={url} title={plain(data.caption) || 'Embedded video'} /></div>{data.caption ? <figcaption dangerouslySetInnerHTML={{ __html: inline(data.caption) }} /> : null}</figure>;
    }
    case 'delimiter':
      return <hr />;
    case 'code':
      return <pre><code>{String(data.code ?? '')}</code></pre>;
    case 'raw':
      return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(data.html ?? ''), rawSanitize) }} />;
    case 'button': {
      const href = safeHref(data.url);
      if (!href) return null;
      return <p className="blog-button-row"><a className={data.variant === 'secondary' ? 'secondary' : ''} href={href}>{plain(data.text) || 'Learn more'}</a></p>;
    }
    default:
      return null;
  }
}

function RichList({ items, ordered }: { items: unknown[]; ordered: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag>{items.map((item, index) => {
    const nested = typeof item === 'object' && item ? item as { content?: unknown; items?: unknown } : null;
    const content = nested ? nested.content : item;
    const children = nested && Array.isArray(nested.items) ? nested.items : [];
    return <li key={index}><span dangerouslySetInnerHTML={{ __html: inline(content) }} />{children.length > 0 && <RichList items={children} ordered={ordered} />}</li>;
  })}</Tag>;
}

function BlogTable({ content, withHeadings }: { content: unknown[]; withHeadings: boolean }) {
  return <div className="blog-table-wrap"><table><tbody>{content.map((row, rowIndex) => <tr key={rowIndex}>{(Array.isArray(row) ? row : []).map((cell, cellIndex) => {
    const Cell = withHeadings && rowIndex === 0 ? 'th' : 'td';
    return <Cell dangerouslySetInnerHTML={{ __html: inline(cell) }} key={cellIndex} />;
  })}</tr>)}</tbody></table></div>;
}

function inline(value: unknown) { return sanitizeHtml(String(value ?? ''), inlineSanitize); }
function plain(value: unknown) { return sanitizeHtml(String(value ?? ''), { allowedTags: [], allowedAttributes: {} }).trim(); }
function safeMediaUrl(value: unknown) { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null; } catch { return null; } }
function safeHref(value: unknown) { const raw = String(value ?? '').trim(); if (raw.startsWith('/')) return raw; try { const url = new URL(raw); return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null; } catch { return null; } }
function safeEmbedUrl(value: unknown) { const url = safeMediaUrl(value); if (!url) return null; const host = new URL(url).hostname.replace(/^www\./, ''); return ['youtube.com', 'youtube-nocookie.com', 'player.vimeo.com'].includes(host) ? url : null; }

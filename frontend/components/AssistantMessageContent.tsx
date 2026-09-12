import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';

// Assistant replies are Markdown text from the LLM, never trusted HTML --
// this renders a small, safe subset (headings, bold/italic, lists,
// allowlisted links) as real React elements. No dangerouslySetInnerHTML
// anywhere: an untrusted string can only become plain text or one of the
// element types explicitly constructed below, never arbitrary markup.

const SITE_URL = 'https://www.dialectlibrary.com';
const SITE_ORIGINS = ['https://www.dialectlibrary.com', 'https://dialectlibrary.com'];
const APPROVED_EXTERNAL_HREFS = new Set([
  'https://www.youtube.com/@DialectLibrary',
  'https://wa.me/447424448030',
  'mailto:hello@dialectlibrary.com',
]);
const LINK_PATTERN =
  /(\[[^\]]+\]\((?:\/[A-Za-z0-9_/?=&-]*|https:\/\/(?:www\.)?dialectlibrary\.com(?:\/[A-Za-z0-9_/?=&-]*)?|https:\/\/(?:www\.youtube\.com\/@DialectLibrary|wa\.me\/447424448030)|mailto:hello@dialectlibrary\.com)\))/g;

/** Returns the relative path for an approved internal link, or null if href isn't one. */
function toApprovedInternalPath(href: string): string | null {
  if (/^\/[A-Za-z0-9_/?=&-]*$/.test(href)) return href;
  const origin = SITE_ORIGINS.find((candidate) => href.startsWith(candidate));
  if (!origin) return null;
  const path = href.slice(origin.length) || '/';
  return /^\/[A-Za-z0-9_/?=&-]*$/.test(path) ? path : null;
}

function isApprovedExternalHref(href: string) {
  return APPROVED_EXTERNAL_HREFS.has(href);
}

/** Splits inline text on Markdown links, rendering only approved dialectlibrary.com routes or the three named external exceptions -- anything else stays literal text so an untrusted/hallucinated URL is never clickable. */
function renderLinks(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(LINK_PATTERN);
  return parts.map((part, index) => {
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    const key = `${keyPrefix}-${index}`;
    if (!match) return <Fragment key={key}>{part}</Fragment>;
    const internalPath = toApprovedInternalPath(match[2]);
    if (internalPath === null && !isApprovedExternalHref(match[2])) {
      return <Fragment key={key}>{part}</Fragment>;
    }
    if (internalPath === null) {
      return (
        <a className="font-bold underline" href={match[2]} key={key} rel="noreferrer" target="_blank">
          {match[1]}
        </a>
      );
    }
    // The href stays relative so Link keeps this an instant client-side
    // navigation, but the visible label is always the full
    // https://www.dialectlibrary.com/... address -- a reader should always
    // see a complete, unambiguous URL, not a bare path.
    return (
      <Link className="font-bold underline" href={internalPath} key={key}>
        {`${SITE_URL}${internalPath}`}
      </Link>
    );
  });
}

/** Renders **bold** and *italic* spans within already-link-split text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  const result: ReactNode[] = [];
  segments.forEach((segment, index) => {
    const key = `${keyPrefix}-inline-${index}`;
    const bold = /^\*\*([^*]+)\*\*$/.exec(segment);
    if (bold) {
      result.push(<strong key={key}>{renderLinks(bold[1], key)}</strong>);
      return;
    }
    const italic = /^\*([^*]+)\*$/.exec(segment);
    if (italic) {
      result.push(<em key={key}>{renderLinks(italic[1], key)}</em>);
      return;
    }
    result.push(...renderLinks(segment, key));
  });
  return result;
}

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string };

/** Splits assistant Markdown into block-level chunks: headings, list groups, and paragraphs. */
function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(' ').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
    paragraphLines = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ kind: 'list', ordered: listOrdered, items: listItems });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1].length === 2 ? 2 : 3, text: heading[2] });
      continue;
    }
    if (bullet || numbered) {
      flushParagraph();
      const isOrdered = Boolean(numbered);
      if (listItems.length > 0 && listOrdered !== isOrdered) flushList();
      listOrdered = isOrdered;
      listItems.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Renders an assistant chat message as lightweight rich text -- headings,
 * bold/italic, and lists on top of the existing strict link allowlist.
 * Shared by the trainer-facing chat widget and the admin conversation
 * viewer so both surfaces render assistant replies identically.
 */
export function AssistantMessageContent({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  if (blocks.length === 0) return null;
  return (
    <div className="grid gap-2">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.kind === 'heading') {
          const className = block.level === 2 ? 'text-base font-black' : 'text-sm font-extrabold';
          return block.level === 2 ? (
            <h4 className={className} key={key}>
              {renderInline(block.text, key)}
            </h4>
          ) : (
            <h5 className={className} key={key}>
              {renderInline(block.text, key)}
            </h5>
          );
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag className={block.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'} key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={key}>{renderInline(block.text, key)}</p>;
      })}
    </div>
  );
}

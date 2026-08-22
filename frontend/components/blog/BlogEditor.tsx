'use client';

import { useEffect, useRef } from 'react';
import EditorJS, { type OutputData, type ToolConstructable } from '@editorjs/editorjs';
import Header from '@editorjs/header';
import EditorList from '@editorjs/list';
import Checklist from '@editorjs/checklist';
import Quote from '@editorjs/quote';
import Table from '@editorjs/table';
import ImageTool from '@editorjs/image';
import Embed from '@editorjs/embed';
import Delimiter from '@editorjs/delimiter';
import CodeTool from '@editorjs/code';
import RawTool from '@editorjs/raw';
import DragDrop from 'editorjs-drag-drop';
import type { EditorDocument } from '@/store/api';

export interface BlogEditorHandle {
  save: () => Promise<EditorDocument>;
}

interface BlogEditorProps {
  data: EditorDocument;
  uploadMedia: (file: File, kind: 'IMAGE' | 'VIDEO') => Promise<string>;
  onChange?: (data: EditorDocument) => void;
  onReady: (handle: BlogEditorHandle | null) => void;
}

export function BlogEditor({ data, uploadMedia, onChange, onReady }: BlogEditorProps) {
  const holderId = useRef(`blog-editor-${Math.random().toString(36).slice(2)}`);
  const editorRef = useRef<EditorJS | null>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (editorRef.current) return;

    const editor = new EditorJS({
      holder: holderId.current,
      data: data as OutputData,
      autofocus: false,
      placeholder: 'Start writing...',
      minHeight: 420,
      inlineToolbar: ['bold', 'italic', 'link'],
      tools: {
        header: {
          class: Header as unknown as ToolConstructable,
          inlineToolbar: true,
          config: { levels: [2, 3, 4], defaultLevel: 2 },
        },
        list: { class: EditorList as unknown as ToolConstructable, inlineToolbar: true },
        checklist: { class: Checklist as unknown as ToolConstructable, inlineToolbar: true },
        quote: { class: Quote as unknown as ToolConstructable, inlineToolbar: true },
        table: {
          class: Table as unknown as ToolConstructable,
          inlineToolbar: true,
          config: { rows: 2, cols: 3 },
        },
        image: {
          class: ImageTool as unknown as ToolConstructable,
          config: {
            uploader: {
              uploadByFile: async (file: File) => ({
                success: 1,
                file: { url: await uploadMedia(file, 'IMAGE') },
              }),
            },
          },
        },
        video: { class: VideoBlock as unknown as ToolConstructable, config: { uploadMedia } },
        embed: {
          class: Embed as unknown as ToolConstructable,
          config: { services: { youtube: true, vimeo: true } },
        },
        delimiter: Delimiter as unknown as ToolConstructable,
        code: CodeTool as unknown as ToolConstructable,
        raw: RawTool as unknown as ToolConstructable,
        button: ButtonBlock as unknown as ToolConstructable,
      },
      onReady: () => {
        new DragDrop(editor);
        onReady({ save: async () => (await editor.save()) as EditorDocument });
      },
      onChange: () => {
        if (!onChange) return;
        clearTimeout(changeTimer.current);
        changeTimer.current = setTimeout(
          async () => onChange((await editor.save()) as EditorDocument),
          450,
        );
      },
    });

    editorRef.current = editor;
    return () => {
      clearTimeout(changeTimer.current);
      onReady(null);
      editorRef.current = null;
      void editor.isReady.then(() => editor.destroy()).catch(() => undefined);
    };
  }, [data, onChange, onReady, uploadMedia]);

  return (
    <div
      className="blog-editor min-h-105 rounded-lg border border-line bg-white px-2 py-5"
      id={holderId.current}
    />
  );
}

class ButtonBlock {
  private data: { text?: string; url?: string; variant?: string };
  private wrapper?: HTMLDivElement;

  static get toolbox() {
    return {
      title: 'Button',
      icon: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="5" width="14" height="8" rx="2" fill="none" stroke="currentColor"/><path d="M6 9h6" stroke="currentColor"/></svg>',
    };
  }

  constructor({ data }: { data: { text?: string; url?: string; variant?: string } }) {
    this.data = data ?? {};
  }

  render() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'editor-button-block';
    this.wrapper.innerHTML = `
      <input class="editor-tool-input" data-field="text" aria-label="Button label" placeholder="Button label" value="${escapeAttribute(this.data.text ?? '')}">
      <input class="editor-tool-input" data-field="url" aria-label="Button URL" placeholder="https://example.com" value="${escapeAttribute(this.data.url ?? '')}">
      <select class="editor-tool-input" data-field="variant" aria-label="Button style">
        <option value="primary" ${this.data.variant !== 'secondary' ? 'selected' : ''}>Primary</option>
        <option value="secondary" ${this.data.variant === 'secondary' ? 'selected' : ''}>Secondary</option>
      </select>`;
    return this.wrapper;
  }

  save() {
    const value = (field: string) =>
      (this.wrapper?.querySelector(`[data-field="${field}"]`) as HTMLInputElement)?.value.trim();
    return { text: value('text'), url: value('url'), variant: value('variant') };
  }
}

class VideoBlock {
  private data: { url?: string; caption?: string };
  private wrapper?: HTMLDivElement;
  private uploadMedia: BlogEditorProps['uploadMedia'];

  static get toolbox() {
    return {
      title: 'Video',
      icon: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="12" rx="2" fill="none" stroke="currentColor"/><path d="m7 6 5 3-5 3Z" fill="currentColor"/></svg>',
    };
  }

  constructor({
    data,
    config,
  }: {
    data: { url?: string; caption?: string };
    config: { uploadMedia: BlogEditorProps['uploadMedia'] };
  }) {
    this.data = data ?? {};
    this.uploadMedia = config.uploadMedia;
  }

  render() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'editor-video-block';
    this.draw();
    return this.wrapper;
  }

  save() {
    const caption =
      (this.wrapper?.querySelector('[data-field="caption"]') as HTMLInputElement)?.value.trim() ??
      '';
    return { url: this.data.url ?? '', caption };
  }

  private draw() {
    if (!this.wrapper) return;
    this.wrapper.innerHTML = this.data.url
      ? `<video controls preload="metadata" src="${escapeAttribute(this.data.url)}"></video><input class="editor-tool-input" data-field="caption" aria-label="Video caption" placeholder="Caption" value="${escapeAttribute(this.data.caption ?? '')}">`
      : '<label class="editor-video-picker"><span>Choose video</span><input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime"></label>';
    const input = this.wrapper.querySelector('input[type="file"]') as HTMLInputElement | null;
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.disabled = true;
      this.wrapper!.querySelector('span')!.textContent = 'Uploading...';
      this.data.url = await this.uploadMedia(file, 'VIDEO');
      this.draw();
    });
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

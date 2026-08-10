'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { BlogEditorHandle } from './BlogEditor';
import { ActionButton, ActionSpinner } from '@/components/ui/ActionButton';
import {
  type BlogPost,
  type BlogPostStatus,
  type EditorDocument,
  normalizeErrorMessage,
  useCreateBlogMediaUploadMutation,
  useCreateBlogPostMutation,
  useUpdateBlogPostMutation,
} from '@/store/api';

const BlogEditor = dynamic(() => import('./BlogEditor').then((module) => module.BlogEditor), {
  ssr: false,
  loading: () => <div className="min-h-105 rounded-lg border border-line bg-white p-6 text-muted">Loading editor...</div>,
});

const emptyDocument: EditorDocument = { time: Date.now(), blocks: [], version: '2.31.6' };
const fieldClass = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';

export function BlogEditorForm({ post }: { post?: BlogPost }) {
  const router = useRouter();
  const editorRef = useRef<BlogEditorHandle>(null);
  const [title, setTitle] = useState(post?.title ?? '');
  const [slugPreview, setSlugPreview] = useState(post?.slug ?? '');
  const [status, setStatus] = useState<BlogPostStatus>(post?.status ?? 'DRAFT');
  const [coverImageUrl, setCoverImageUrl] = useState(post?.coverImageUrl ?? '');
  const [coverImageKey, setCoverImageKey] = useState(post?.coverImageKey ?? '');
  const [coverImageAlt, setCoverImageAlt] = useState(post?.coverImageAlt ?? '');
  const [seoExcerpt, setSeoExcerpt] = useState(post?.excerpt ?? '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [createPost] = useCreateBlogPostMutation();
  const [updatePost] = useUpdateBlogPostMutation();
  const [createUpload] = useCreateBlogMediaUploadMutation();
  const initialData = useMemo(() => post?.content ?? emptyDocument, [post?.content]);

  const uploadMedia = useCallback(async (file: File, kind: 'IMAGE' | 'VIDEO') => {
    const maxBytes = kind === 'VIDEO' ? 250 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(kind === 'VIDEO' ? 'Videos must be 250 MB or smaller' : 'Images must be 10 MB or smaller');
    const signed = await createUpload({ fileName: file.name, contentType: file.type, kind }).unwrap();
    const response = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!response.ok) throw new Error('Media upload failed');
    return signed.publicUrl;
  }, [createUpload]);

  const handleCover = async (file?: File) => {
    if (!file) return;
    setError('');
    setIsUploadingCover(true);
    try {
      const url = await uploadMedia(file, 'IMAGE');
      setCoverImageUrl(url);
      setCoverImageKey(new URL(url).pathname.slice(1));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Cover upload failed');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleTitle = (value: string) => {
    setTitle(value);
    if (!post) setSlugPreview(toSlug(value));
  };

  const updateSeoPreview = useCallback((document: EditorDocument) => {
    setSeoExcerpt(excerptFrom(document));
  }, []);

  const save = async () => {
    setError('');
    if (!title.trim()) return setError('Title is required');
    const content = await editorRef.current?.save();
    if (!content) return setError('The editor is still loading');
    setIsSaving(true);
    try {
      const body = {
        title: title.trim(), content,
        coverImageUrl: coverImageUrl || undefined, coverImageKey: coverImageKey || undefined,
        coverImageAlt: coverImageAlt || undefined, status,
      };
      if (post) {
        const saved = await updatePost({ id: post.id, body }).unwrap();
        setSlugPreview(saved.slug);
      } else {
        await createPost(body).unwrap();
      }
      router.push('/admin/blog');
      router.refresh();
    } catch (saveError) {
      setError(normalizeErrorMessage(saveError, 'Could not save this post.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm font-bold text-accent no-underline hover:text-accent-dark" href="/admin/blog">&larr; Blog posts</Link>
          <h1 className="mt-1 text-3xl font-black">{post ? 'Edit post' : 'Create post'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {post?.status === 'PUBLISHED' && <Link className="rounded-lg border border-line bg-white px-4 py-2 font-bold text-ink no-underline hover:bg-surface-muted" href={`/blog/${post.slug}`} target="_blank">View</Link>}
          <ActionButton className="min-h-10 rounded-lg bg-accent px-5 py-2 font-extrabold text-white disabled:opacity-60" disabled={isUploadingCover} onClick={save} pending={isSaving} pendingLabel="Saving post" type="button">
            Save post
          </ActionButton>
        </div>
      </header>

      {error && <p className="rounded-lg border border-[#e8b8bd] bg-[#fff1f2] px-4 py-3 font-semibold text-[#a3242f]" role="alert">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-5">
          <section className="grid gap-4 rounded-lg border border-line bg-white p-5">
            <label className="grid gap-1.5 font-bold">Title<input className={`${fieldClass} text-xl font-extrabold`} maxLength={180} onChange={(event) => handleTitle(event.target.value)} value={title} /></label>
            <p className="text-sm text-muted">
              Slug: <span className="font-mono">{post ? `${slugPreview || 'post'}` : `${toSlug(title) || 'post'}-<id>`}</span>
              {' '}&mdash; generated automatically from the title, updates whenever the title changes.
            </p>
          </section>

          <BlogEditor ref={editorRef} data={initialData} onChange={updateSeoPreview} uploadMedia={uploadMedia} />
        </div>

        <aside className="grid content-start gap-5">
          <section className="grid gap-3 rounded-lg border border-line bg-white p-4">
            <h2 className="text-base font-black">Publishing</h2>
            <div className="grid grid-cols-2 rounded-lg border border-line bg-surface-muted p-1" role="group" aria-label="Post status">
              {(['DRAFT', 'PUBLISHED'] as const).map((option) => <button className={`rounded-md px-3 py-2 text-sm font-extrabold ${status === option ? 'bg-white text-accent shadow-sm' : 'text-muted'}`} key={option} onClick={() => setStatus(option)} type="button">{option === 'DRAFT' ? 'Draft' : 'Published'}</button>)}
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border border-line bg-white p-4">
            <h2 className="text-base font-black">Cover image</h2>
            {coverImageUrl && <img alt={coverImageAlt || ''} className="aspect-video w-full rounded-lg border border-line object-cover" src={coverImageUrl} />}
            <label className="grid min-h-24 cursor-pointer place-items-center rounded-lg border border-dashed border-line bg-surface-muted px-3 text-center text-sm font-bold text-muted hover:border-accent">
              {isUploadingCover ? <span className="inline-flex items-center gap-2"><ActionSpinner />Uploading</span> : coverImageUrl ? 'Replace image' : 'Choose image'}
              <input className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={isUploadingCover} onChange={(event) => handleCover(event.target.files?.[0])} type="file" />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">Alt text<input className={fieldClass} maxLength={180} onChange={(event) => setCoverImageAlt(event.target.value)} value={coverImageAlt} /></label>
          </section>

          <section className="grid gap-2 rounded-lg border border-line bg-white p-4">
            <h2 className="text-base font-black">Search preview</h2>
            <p className="truncate text-sm text-[#2463c5]">dialectlibrary.com/blog/{post ? slugPreview || 'post' : `${toSlug(title) || 'post'}-...`}</p>
            <p className="font-extrabold leading-snug">{title || 'Post title'}</p>
            <p className="text-sm leading-relaxed text-muted">{seoExcerpt || 'The first paragraph becomes the search description.'}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function toSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 190);
}

function excerptFrom(document: EditorDocument): string {
  const block = document.blocks.find((item) => item.type === 'paragraph' && typeof item.data.text === 'string' && item.data.text);
  const text = String(block?.data.text ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157).trim()}...` : text;
}

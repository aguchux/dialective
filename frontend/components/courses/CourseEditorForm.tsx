'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { BlogEditorHandle } from '@/components/blog/BlogEditor';
import { ActionButton, ActionSpinner } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import {
  type Course,
  type CourseSlide,
  type EditorDocument,
  normalizeErrorMessage,
  useCreateCourseMediaUploadMutation,
  useCreateCourseMutation,
  useDeleteCourseMutation,
  useUpdateCourseMutation,
} from '@/store/api';

const BlogEditor = dynamic(() => import('@/components/blog/BlogEditor').then((module) => module.BlogEditor), {
  ssr: false,
  loading: () => <div className="min-h-40 rounded-lg border border-line bg-white p-4 text-sm text-muted">Loading editor...</div>,
});

const fieldClass = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const emptyEditorDocument: EditorDocument = { blocks: [] };

let nextSlideKeyId = 0;
function nextSlideKey() {
  nextSlideKeyId += 1;
  return `slide-${nextSlideKeyId}`;
}

// A slide paired with a stable client-only key -- separate from its array
// index so add/remove/reorder never reassigns which slide a given
// SlideTextEditor/Editor.js instance belongs to (see SlideTextEditor's
// comment for why identity, not position, has to be the cache key here).
interface KeyedSlide {
  key: string;
  slide: CourseSlide;
}

function emptyKeyedSlide(): KeyedSlide {
  return { key: nextSlideKey(), slide: { text: emptyEditorDocument } };
}

/**
 * Isolates each slide's Editor.js instance from the rest of the form's
 * state. Without this, typing in the Title field re-renders
 * CourseEditorForm, which would hand BlogEditor a brand-new inline onReady
 * closure and a fresh `data` object on every keystroke -- BlogEditor's
 * setup effect depends on both, so it would tear down and reconstruct the
 * underlying Editor.js instance on every keystroke anywhere in the form,
 * stealing focus/cursor position (including in the Title field itself,
 * since the whole tree re-renders together). memo() plus a stable
 * per-slide-key onReady callback (see getOnReadyCallback below) keeps this
 * subtree from re-rendering when unrelated form state changes.
 * `initialData` is intentionally captured once in local state and never
 * re-synced from props, so BlogEditor's own `data` dependency also stays
 * referentially stable across re-renders of this component.
 */
const SlideTextEditor = memo(function SlideTextEditor({
  initialData,
  onReady,
  uploadMedia,
}: {
  initialData: EditorDocument;
  onReady: (handle: BlogEditorHandle | null) => void;
  uploadMedia: (file: File, kind: 'IMAGE' | 'VIDEO') => Promise<string>;
}) {
  const [stableData] = useState(initialData);
  return <BlogEditor data={stableData} onReady={onReady} uploadMedia={uploadMedia} />;
});

export function CourseEditorForm({ course }: { course?: Course }) {
  const router = useRouter();
  const [title, setTitle] = useState(course?.title ?? '');
  const [slugPreview, setSlugPreview] = useState(course?.slug ?? '');
  const [summary, setSummary] = useState(course?.summary ?? '');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>(course?.status ?? 'DRAFT');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(course?.visibility ?? 'PRIVATE');
  const [required, setRequired] = useState(course?.required ?? false);
  const [completionRewardTokens, setCompletionRewardTokens] = useState(course?.completionRewardTokens ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(course?.coverImageUrl ?? '');
  const [coverImageKey, setCoverImageKey] = useState(course?.coverImageKey ?? '');
  const [coverImageAlt, setCoverImageAlt] = useState(course?.coverImageAlt ?? '');
  const [slides, setSlides] = useState<KeyedSlide[]>(() =>
    course?.slides.slides.length
      ? course.slides.slides.map((slide) => ({ key: nextSlideKey(), slide }))
      : [emptyKeyedSlide()],
  );
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadingSlideKey, setUploadingSlideKey] = useState<{ key: string; kind: 'image' | 'audio' } | null>(null);
  const [createCourse] = useCreateCourseMutation();
  const [updateCourse] = useUpdateCourseMutation();
  const [deleteCourse, { isLoading: isDeleting }] = useDeleteCourseMutation();
  const [createUpload] = useCreateCourseMediaUploadMutation();

  // Each slide's Editor.js instance saves its own document asynchronously
  // (editorHandle.save(), same as BlogEditorForm) -- keyed by the slide's
  // stable key so handleSave can await every slide's current content in
  // one pass, and so a removed slide's stale handle never gets read.
  const editorHandlesRef = useRef<Map<string, BlogEditorHandle>>(new Map());

  // One stable onReady closure per slide key, cached across renders -- this
  // is what lets SlideTextEditor's memo() actually skip re-rendering when
  // unrelated form state (e.g. Title) changes.
  const onReadyCallbacksRef = useRef<Map<string, (handle: BlogEditorHandle | null) => void>>(new Map());
  function getOnReadyCallback(key: string) {
    const cached = onReadyCallbacksRef.current.get(key);
    if (cached) return cached;
    const callback = (handle: BlogEditorHandle | null) => {
      if (handle) editorHandlesRef.current.set(key, handle);
      else editorHandlesRef.current.delete(key);
    };
    onReadyCallbacksRef.current.set(key, callback);
    return callback;
  }

  const uploadMedia = useCallback(async (file: File, kind: 'IMAGE' | 'AUDIO') => {
    const maxBytes = kind === 'AUDIO' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) throw new Error(kind === 'AUDIO' ? 'Audio files must be 15 MB or smaller' : 'Images must be 10 MB or smaller');
    const signed = await createUpload({ fileName: file.name, contentType: file.type, kind }).unwrap();
    let response: Response;
    try {
      response = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    } catch {
      throw new Error('Could not reach media storage. Please retry.');
    }
    if (!response.ok) throw new Error('Media upload failed');
    return signed.publicUrl;
  }, [createUpload]);

  // BlogEditor's image tool needs a 'IMAGE' | 'VIDEO' uploader -- courses
  // don't support video, so this adapter satisfies that signature while
  // only ever forwarding IMAGE uploads to the course media endpoint.
  const uploadSlideMedia = useCallback(async (file: File, kind: 'IMAGE' | 'VIDEO') => {
    if (kind === 'VIDEO') throw new Error('Video is not supported in course slides');
    return uploadMedia(file, 'IMAGE');
  }, [uploadMedia]);

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
    if (!course) setSlugPreview(toSlug(value));
  };

  function updateSlide(key: string, patch: Partial<CourseSlide>) {
    setSlides((current) => current.map((entry) => (entry.key === key ? { key, slide: { ...entry.slide, ...patch } } : entry)));
  }

  function addSlide() {
    setSlides((current) => [...current, emptyKeyedSlide()]);
  }

  function removeSlide(key: string) {
    setSlides((current) => {
      if (current.length <= 1) return current;
      editorHandlesRef.current.delete(key);
      onReadyCallbacksRef.current.delete(key);
      return current.filter((entry) => entry.key !== key);
    });
  }

  function moveSlide(index: number, direction: -1 | 1) {
    setSlides((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSlideImage(key: string, file?: File) {
    if (!file) return;
    setError('');
    setUploadingSlideKey({ key, kind: 'image' });
    try {
      const url = await uploadMedia(file, 'IMAGE');
      updateSlide(key, { imageUrl: url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Slide image upload failed');
    } finally {
      setUploadingSlideKey(null);
    }
  }

  async function handleSlideAudio(key: string, file?: File) {
    if (!file) return;
    setError('');
    setUploadingSlideKey({ key, kind: 'audio' });
    try {
      const url = await uploadMedia(file, 'AUDIO');
      updateSlide(key, { audioUrl: url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Slide narration upload failed');
    } finally {
      setUploadingSlideKey(null);
    }
  }

  const save = async () => {
    setError('');
    if (!title.trim()) return setError('Title is required');
    if (!summary.trim()) return setError('Summary is required');
    const rewardValue = completionRewardTokens.trim();
    if (rewardValue && (Number.isNaN(Number(rewardValue)) || Number(rewardValue) < 0)) {
      return setError('Completion reward must be a positive number of DL, or left blank');
    }

    setIsSaving(true);
    try {
      const savedSlides = await Promise.all(slides.map(async ({ key, slide }) => {
        const handle = editorHandlesRef.current.get(key);
        const text = handle ? await handle.save() : slide.text;
        return { ...slide, text };
      }));
      const cleanSlides = savedSlides.filter((slide) => slide.text.blocks.length > 0);
      if (cleanSlides.length === 0) return setError('At least one slide with text is required');

      const body = {
        title: title.trim(),
        summary: summary.trim(),
        content: { slides: cleanSlides },
        coverImageUrl: coverImageUrl || undefined,
        coverImageKey: coverImageKey || undefined,
        coverImageAlt: coverImageAlt || undefined,
        status,
        visibility,
        required,
        completionRewardTokens: rewardValue ? Number(rewardValue) : undefined,
      };
      if (course) {
        const saved = await updateCourse({ id: course.id, body }).unwrap();
        setSlugPreview(saved.slug);
      } else {
        await createCourse(body).unwrap();
      }
      router.push('/admin/courses');
      router.refresh();
    } catch (saveError) {
      setError(normalizeErrorMessage(saveError, 'Could not save this course.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!course) return;
    setError('');
    try {
      await deleteCourse(course.id).unwrap();
      router.push('/admin/courses');
      router.refresh();
    } catch (deleteError) {
      setError(normalizeErrorMessage(deleteError, 'Could not delete this course.'));
    }
  };

  const anyUploading = isUploadingCover || uploadingSlideKey !== null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm font-bold text-accent no-underline hover:text-accent-dark" href="/admin/courses">&larr; Courses</Link>
          <h1 className="mt-1 text-3xl font-black">{course ? 'Edit course' : 'Create course'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {course?.status === 'PUBLISHED' && <Link className="rounded-lg border border-line bg-white px-4 py-2 font-bold text-ink no-underline hover:bg-surface-muted" href={`/learn/${course.slug}`} target="_blank">View</Link>}
          {course && (
            <Dialog>
              <DialogTrigger className="min-h-10 rounded-lg border border-line bg-white px-4 py-2 font-bold text-danger transition-colors hover:bg-[#fde8e8]" type="button">
                Delete
              </DialogTrigger>
              <DialogContent title="Delete this course?" description="This permanently removes the course and its slides. This cannot be undone.">
                <div className="flex justify-end gap-2">
                  <DialogClose className="min-h-10 rounded-lg border border-line bg-white px-4 py-2 font-bold text-ink hover:bg-surface-muted" type="button">
                    Cancel
                  </DialogClose>
                  <ActionButton
                    className="min-h-10 rounded-lg bg-danger px-4 py-2 font-extrabold text-white disabled:opacity-60"
                    onClick={handleDelete}
                    pending={isDeleting}
                    pendingLabel="Deleting"
                    type="button"
                  >
                    Delete course
                  </ActionButton>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <ActionButton className="min-h-10 rounded-lg bg-accent px-5 py-2 font-extrabold text-white disabled:opacity-60" disabled={anyUploading} onClick={save} pending={isSaving} pendingLabel="Saving course" type="button">
            Save course
          </ActionButton>
        </div>
      </header>

      {error && <p className="rounded-lg border border-[#e8b8bd] bg-[#fff1f2] px-4 py-3 font-semibold text-[#a3242f]" role="alert">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-5">
          <section className="grid gap-4 rounded-lg border border-line bg-white p-5">
            <label className="grid gap-1.5 font-bold">Title<input className={`${fieldClass} text-xl font-extrabold`} maxLength={180} onChange={(event) => handleTitle(event.target.value)} value={title} /></label>
            <p className="text-sm text-muted">
              Slug: <span className="font-mono">{course ? `${slugPreview || 'course'}` : `${toSlug(title) || 'course'}-<id>`}</span>
              {' '}&mdash; generated automatically from the title, updates whenever the title changes.
            </p>
            <label className="grid gap-1.5 font-bold">Summary<textarea className={`${fieldClass} min-h-20`} maxLength={500} onChange={(event) => setSummary(event.target.value)} value={summary} /></label>
          </section>

          <section className="grid gap-4 rounded-lg border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Slides</h2>
              <button className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-bold hover:bg-surface-muted" onClick={addSlide} type="button">+ Add slide</button>
            </div>

            {slides.map(({ key, slide }, index) => (
              <div className="grid gap-3 rounded-lg border border-line bg-surface p-4" key={key}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-muted">Slide {index + 1}</p>
                  <div className="flex items-center gap-1">
                    <button aria-label="Move slide up" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" disabled={index === 0} onClick={() => moveSlide(index, -1)} type="button"><ArrowUp className="size-4" aria-hidden="true" /></button>
                    <button aria-label="Move slide down" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" disabled={index === slides.length - 1} onClick={() => moveSlide(index, 1)} type="button"><ArrowDown className="size-4" aria-hidden="true" /></button>
                    <button aria-label="Remove slide" className="grid size-8 place-items-center rounded-md text-[#a3242f] hover:bg-[#fff1f2] disabled:cursor-not-allowed disabled:opacity-30" disabled={slides.length <= 1} onClick={() => removeSlide(key)} type="button"><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                </div>

                <div className="grid gap-1.5 text-sm font-bold">
                  Text
                  <SlideTextEditor initialData={slide.text} onReady={getOnReadyCallback(key)} uploadMedia={uploadSlideMedia} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <p className="text-sm font-bold">Image</p>
                    {slide.imageUrl && <img alt={slide.imageAlt || ''} className="aspect-video w-full rounded-lg border border-line object-cover" src={slide.imageUrl} />}
                    <label className="grid min-h-16 cursor-pointer place-items-center rounded-lg border border-dashed border-line bg-white px-3 text-center text-sm font-bold text-muted hover:border-accent">
                      {uploadingSlideKey?.key === key && uploadingSlideKey.kind === 'image' ? <span className="inline-flex items-center gap-2"><ActionSpinner />Uploading</span> : slide.imageUrl ? 'Replace image' : 'Choose image'}
                      <input className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={anyUploading} onChange={(event) => handleSlideImage(key, event.target.files?.[0])} type="file" />
                    </label>
                  </div>
                  <div className="grid gap-1.5">
                    <p className="text-sm font-bold">Narration audio</p>
                    {slide.audioUrl && <audio className="w-full" controls src={slide.audioUrl} />}
                    <label className="grid min-h-16 cursor-pointer place-items-center rounded-lg border border-dashed border-line bg-white px-3 text-center text-sm font-bold text-muted hover:border-accent">
                      {uploadingSlideKey?.key === key && uploadingSlideKey.kind === 'audio' ? <span className="inline-flex items-center gap-2"><ActionSpinner />Uploading</span> : slide.audioUrl ? 'Replace audio' : 'Choose audio'}
                      <input className="sr-only" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm" disabled={anyUploading} onChange={(event) => handleSlideAudio(key, event.target.files?.[0])} type="file" />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside className="grid content-start gap-5">
          <section className="grid gap-3 rounded-lg border border-line bg-white p-4">
            <h2 className="text-base font-black">Publishing</h2>
            <div className="grid grid-cols-2 rounded-lg border border-line bg-surface-muted p-1" role="group" aria-label="Course status">
              {(['DRAFT', 'PUBLISHED'] as const).map((option) => <button className={`rounded-md px-3 py-2 text-sm font-extrabold ${status === option ? 'bg-white text-accent shadow-sm' : 'text-muted'}`} key={option} onClick={() => setStatus(option)} type="button">{option === 'DRAFT' ? 'Draft' : 'Published'}</button>)}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-bold">Visibility</p>
              <div className="grid grid-cols-2 rounded-lg border border-line bg-surface-muted p-1" role="group" aria-label="Course visibility">
                {(['PRIVATE', 'PUBLIC'] as const).map((option) => (
                  <button
                    className={`rounded-md px-3 py-2 text-sm font-extrabold ${visibility === option ? 'bg-white text-accent shadow-sm' : 'text-muted'}`}
                    key={option}
                    onClick={() => setVisibility(option)}
                    type="button"
                  >
                    {option === 'PRIVATE' ? 'Login required' : 'Public'}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {visibility === 'PUBLIC'
                  ? 'Anyone can view this course at /learn without an account.'
                  : 'Trainers must log in to view this course.'}
              </p>
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border border-line bg-white p-4">
            <h2 className="text-base font-black">Compliance & reward</h2>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3">
              <input checked={required} className="mt-0.5 size-5 accent-accent" onChange={(event) => setRequired(event.target.checked)} type="checkbox" />
              <span>
                <span className="block text-sm font-extrabold">Required to train</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  Trainers must complete this course before they can start a training session or submit a task. Only enforced once this course is Published.
                </span>
              </span>
            </label>

            <label className="grid gap-1.5 text-sm font-bold">
              Completion reward (DL, optional)
              <input
                className={fieldClass}
                inputMode="decimal"
                min={0}
                onChange={(event) => setCompletionRewardTokens(event.target.value)}
                placeholder="e.g. 5"
                step="any"
                type="number"
                value={completionRewardTokens}
              />
              <span className="text-xs font-normal leading-relaxed text-muted">
                Credited once to a trainer&rsquo;s DL balance the first time they complete this course. Leave blank for no reward -- trainers still get a completion email either way.
              </span>
            </label>
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
            <h2 className="text-base font-black">Catalog preview</h2>
            <p className="truncate text-sm text-[#2463c5]">dialectlibrary.com/learn/{course ? slugPreview || 'course' : `${toSlug(title) || 'course'}-...`}</p>
            <p className="font-extrabold leading-snug">{title || 'Course title'}</p>
            <p className="text-sm leading-relaxed text-muted">{summary || 'A short description shown on the catalog card.'}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function toSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 190);
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { ActionButton, ActionSpinner } from '@/components/ui/ActionButton';
import {
  type Course,
  type CourseSlide,
  normalizeErrorMessage,
  useCreateCourseMediaUploadMutation,
  useCreateCourseMutation,
  useUpdateCourseMutation,
} from '@/store/api';

const fieldClass = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function emptySlide(): CourseSlide {
  return { text: '' };
}

export function CourseEditorForm({ course }: { course?: Course }) {
  const router = useRouter();
  const [title, setTitle] = useState(course?.title ?? '');
  const [slugPreview, setSlugPreview] = useState(course?.slug ?? '');
  const [summary, setSummary] = useState(course?.summary ?? '');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>(course?.status ?? 'DRAFT');
  const [coverImageUrl, setCoverImageUrl] = useState(course?.coverImageUrl ?? '');
  const [coverImageKey, setCoverImageKey] = useState(course?.coverImageKey ?? '');
  const [coverImageAlt, setCoverImageAlt] = useState(course?.coverImageAlt ?? '');
  const [slides, setSlides] = useState<CourseSlide[]>(course?.slides.slides.length ? course.slides.slides : [emptySlide()]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadingSlideIndex, setUploadingSlideIndex] = useState<{ index: number; kind: 'image' | 'audio' } | null>(null);
  const [createCourse] = useCreateCourseMutation();
  const [updateCourse] = useUpdateCourseMutation();
  const [createUpload] = useCreateCourseMediaUploadMutation();

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

  function updateSlide(index: number, patch: Partial<CourseSlide>) {
    setSlides((current) => current.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
  }

  function addSlide() {
    setSlides((current) => [...current, emptySlide()]);
  }

  function removeSlide(index: number) {
    setSlides((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
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

  async function handleSlideImage(index: number, file?: File) {
    if (!file) return;
    setError('');
    setUploadingSlideIndex({ index, kind: 'image' });
    try {
      const url = await uploadMedia(file, 'IMAGE');
      updateSlide(index, { imageUrl: url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Slide image upload failed');
    } finally {
      setUploadingSlideIndex(null);
    }
  }

  async function handleSlideAudio(index: number, file?: File) {
    if (!file) return;
    setError('');
    setUploadingSlideIndex({ index, kind: 'audio' });
    try {
      const url = await uploadMedia(file, 'AUDIO');
      updateSlide(index, { audioUrl: url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Slide narration upload failed');
    } finally {
      setUploadingSlideIndex(null);
    }
  }

  const save = async () => {
    setError('');
    if (!title.trim()) return setError('Title is required');
    if (!summary.trim()) return setError('Summary is required');
    const cleanSlides = slides.filter((slide) => slide.text.trim());
    if (cleanSlides.length === 0) return setError('At least one slide with text is required');

    setIsSaving(true);
    try {
      const body = {
        title: title.trim(),
        summary: summary.trim(),
        content: { slides: cleanSlides.map((slide) => ({ ...slide, text: slide.text.trim() })) },
        coverImageUrl: coverImageUrl || undefined,
        coverImageKey: coverImageKey || undefined,
        coverImageAlt: coverImageAlt || undefined,
        status,
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

  const anyUploading = isUploadingCover || uploadingSlideIndex !== null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm font-bold text-accent no-underline hover:text-accent-dark" href="/admin/courses">&larr; Courses</Link>
          <h1 className="mt-1 text-3xl font-black">{course ? 'Edit course' : 'Create course'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {course?.status === 'PUBLISHED' && <Link className="rounded-lg border border-line bg-white px-4 py-2 font-bold text-ink no-underline hover:bg-surface-muted" href={`/learn/${course.slug}`} target="_blank">View</Link>}
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

            {slides.map((slide, index) => (
              <div className="grid gap-3 rounded-lg border border-line bg-surface p-4" key={index}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-muted">Slide {index + 1}</p>
                  <div className="flex items-center gap-1">
                    <button aria-label="Move slide up" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" disabled={index === 0} onClick={() => moveSlide(index, -1)} type="button"><ArrowUp className="size-4" aria-hidden="true" /></button>
                    <button aria-label="Move slide down" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" disabled={index === slides.length - 1} onClick={() => moveSlide(index, 1)} type="button"><ArrowDown className="size-4" aria-hidden="true" /></button>
                    <button aria-label="Remove slide" className="grid size-8 place-items-center rounded-md text-[#a3242f] hover:bg-[#fff1f2] disabled:cursor-not-allowed disabled:opacity-30" disabled={slides.length <= 1} onClick={() => removeSlide(index)} type="button"><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                </div>

                <label className="grid gap-1.5 text-sm font-bold">Text<textarea className={`${fieldClass} min-h-24`} maxLength={4000} onChange={(event) => updateSlide(index, { text: event.target.value })} value={slide.text} /></label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <p className="text-sm font-bold">Image</p>
                    {slide.imageUrl && <img alt={slide.imageAlt || ''} className="aspect-video w-full rounded-lg border border-line object-cover" src={slide.imageUrl} />}
                    <label className="grid min-h-16 cursor-pointer place-items-center rounded-lg border border-dashed border-line bg-white px-3 text-center text-sm font-bold text-muted hover:border-accent">
                      {uploadingSlideIndex?.index === index && uploadingSlideIndex.kind === 'image' ? <span className="inline-flex items-center gap-2"><ActionSpinner />Uploading</span> : slide.imageUrl ? 'Replace image' : 'Choose image'}
                      <input className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={anyUploading} onChange={(event) => handleSlideImage(index, event.target.files?.[0])} type="file" />
                    </label>
                  </div>
                  <div className="grid gap-1.5">
                    <p className="text-sm font-bold">Narration audio</p>
                    {slide.audioUrl && <audio className="w-full" controls src={slide.audioUrl} />}
                    <label className="grid min-h-16 cursor-pointer place-items-center rounded-lg border border-dashed border-line bg-white px-3 text-center text-sm font-bold text-muted hover:border-accent">
                      {uploadingSlideIndex?.index === index && uploadingSlideIndex.kind === 'audio' ? <span className="inline-flex items-center gap-2"><ActionSpinner />Uploading</span> : slide.audioUrl ? 'Replace audio' : 'Choose audio'}
                      <input className="sr-only" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm" disabled={anyUploading} onChange={(event) => handleSlideAudio(index, event.target.files?.[0])} type="file" />
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

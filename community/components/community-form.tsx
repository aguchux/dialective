'use client';

import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Mic2, X } from 'lucide-react';
import {
  useCreateAttachmentUploadUrlMutation,
  type CommunityAttachmentContentType,
  type CommunityAttachmentInput,
  type CommunityReportReason,
} from '@/store/api';
import { ErrorText, IconButton, Modal, PrimaryButton, Select, StatusBanner, TextArea } from './ui';

const REPORT_REASONS: { value: CommunityReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'ABUSE_HARASSMENT', label: 'Abuse or harassment' },
  { value: 'MISINFORMATION', label: 'Misinformation' },
  { value: 'OFF_TOPIC', label: 'Off-topic' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
  { value: 'IMPERSONATION', label: 'Impersonation' },
  { value: 'COPYRIGHT', label: 'Copyright' },
  { value: 'OTHER', label: 'Other' },
];

export function ReportDialog({
  onClose,
  onSubmit,
  submitting = false,
}: {
  onClose: () => void;
  onSubmit: (input: { reason: CommunityReportReason; notes?: string }) => void;
  submitting?: boolean;
}) {
  const [reason, setReason] = useState<CommunityReportReason>('SPAM');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title="Report content">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          onSubmit({ reason, notes: notes.trim() || undefined });
        }}
      >
        <div>
          <label className="mb-1.5 block text-sm font-extrabold text-ink" htmlFor="report-reason">
            Reason
          </label>
          <Select
            id="report-reason"
            onChange={(event) => setReason(event.target.value as CommunityReportReason)}
            value={reason}
          >
            {REPORT_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-extrabold text-ink" htmlFor="report-notes">
            Additional details (optional)
          </label>
          <TextArea
            id="report-notes"
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything that helps a moderator review this"
            rows={3}
            value={notes}
          />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="min-h-11 rounded-lg border border-line px-4 text-sm font-extrabold text-ink hover:bg-surface-muted"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <PrimaryButton pending={submitting} pendingLabel="Submitting" type="submit">
            Submit report
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export function TagInput({
  tags,
  onChange,
  suggestions = [],
  hashPrefix = true,
  maxItems = 5,
  placeholder,
  helperText,
  ariaLabel = 'Add tags',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: { id: string; name: string }[];
  /** Set false for plain word lists (languages/dialects) that shouldn't render with a leading #. */
  hashPrefix?: boolean;
  maxItems?: number;
  placeholder?: string;
  helperText?: string;
  ariaLabel?: string;
}) {
  const [value, setValue] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, '').replace(/\s+/g, ' ');
    if (
      !tag ||
      tags.length >= maxItems ||
      tags.some((item) => item.toLowerCase() === tag.toLowerCase())
    )
      return;
    onChange([...tags, tag]);
    setValue('');
  }

  return (
    <div>
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-dark"
            key={tag}
          >
            {hashPrefix ? `#${tag}` : tag}
            <IconButton
              className="-mr-1 size-8 rounded-full"
              label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              <X aria-hidden="true" className="size-3" />
            </IconButton>
          </span>
        ))}
        <input
          aria-label={ariaLabel}
          className="min-w-32 flex-1 border-0 bg-transparent py-1 text-base text-ink outline-none placeholder:text-muted/75"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addTag(value);
            }
            if (event.key === 'Backspace' && !value && tags.length) onChange(tags.slice(0, -1));
          }}
          placeholder={
            placeholder ?? (tags.length ? 'Add another' : 'Add tags e.g. Igbo, Recording Tips')
          }
          value={value}
        />
      </div>
      {!!value && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Suggested tags">
          {suggestions.slice(0, 5).map((suggestion) => (
            <button
              className="min-h-10 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-muted hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              key={suggestion.id}
              onClick={() => addTag(suggestion.name)}
              type="button"
            >
              #{suggestion.name.replace(/^#/, '')}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted">
        {helperText ?? `Press Enter to add. Add up to ${maxItems}.`}
      </p>
    </div>
  );
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ACCEPT_BY_KIND: Record<
  'image' | 'audio' | 'document',
  { accept: string; label: string; icon: typeof ImageIcon }
> = {
  image: { accept: 'image/jpeg,image/png,image/webp', label: 'Image', icon: ImageIcon },
  // audio/mp4 and audio/x-m4a cover iOS Safari's file/voice-memo picker,
  // which never produces audio/webm -- without these, every iOS audio
  // attachment was silently excluded by the OS picker or rejected server-side.
  audio: {
    accept: 'audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/x-m4a',
    label: 'Audio',
    icon: Mic2,
  },
  document: { accept: 'application/pdf', label: 'Document', icon: FileText },
};

export interface PendingAttachment extends CommunityAttachmentInput {
  /** Local id for list rendering/removal -- distinct from the server storage key. */
  localId: string;
}

/**
 * Real attachment picker (image/audio/document, up to 5 files, 10MB each)
 * replacing the earlier permanently-disabled stub -- uploads directly to
 * Spaces via a presigned URL (CommunityAttachmentsService.createUploadUrl),
 * same two-step flow used everywhere else in this repo, then hands the
 * resulting metadata back to the caller to submit alongside the post/reply.
 */
export function AttachmentPicker({
  attachments,
  onChange,
}: {
  attachments: PendingAttachment[];
  onChange: (attachments: PendingAttachment[]) => void;
}) {
  const [createUploadUrl] = useCreateAttachmentUploadUrlMutation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = {
    image: useRef<HTMLInputElement>(null),
    audio: useRef<HTMLInputElement>(null),
    document: useRef<HTMLInputElement>(null),
  };

  async function handleFile(file: File, contentType: CommunityAttachmentContentType) {
    setError(null);
    if (attachments.length >= MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Each file must be 10 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const { uploadUrl, key, bucket } = await createUploadUrl({ contentType }).unwrap();
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!putResponse.ok) throw new Error('Upload failed');
      onChange([
        ...attachments,
        {
          localId: key,
          key,
          bucket,
          contentType,
          size: file.size,
          originalName: file.name,
        },
      ]);
    } catch {
      setError('Could not upload this file. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(ACCEPT_BY_KIND) as Array<keyof typeof ACCEPT_BY_KIND>).map((kind) => {
          const { accept, label, icon: Icon } = ACCEPT_BY_KIND[kind];
          return (
            <div key={kind}>
              <input
                accept={accept}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void handleFile(file, file.type as CommunityAttachmentContentType);
                }}
                ref={inputRefs[kind]}
                type="file"
              />
              <button
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-extrabold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => inputRefs[kind].current?.click()}
                type="button"
              >
                {uploading ? (
                  <Loader2 aria-hidden="true" className="size-5 animate-spin" />
                ) : (
                  <Icon aria-hidden="true" className="size-5" />
                )}
                {label}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Up to {MAX_ATTACHMENTS} files. Max 10 MB each.</p>
      {error && (
        <div className="mt-2">
          <StatusBanner tone="danger">{error}</StatusBanner>
        </div>
      )}
      {attachments.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {attachments.map((attachment) => (
            <li
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-bold text-ink"
              key={attachment.localId}
            >
              <span className="min-w-0 flex-1 truncate">{attachment.originalName}</span>
              <IconButton
                label={`Remove ${attachment.originalName}`}
                onClick={() =>
                  onChange(attachments.filter((item) => item.localId !== attachment.localId))
                }
              >
                <X aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

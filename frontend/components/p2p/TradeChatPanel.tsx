'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Paperclip, ShieldAlert, Send, X } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatDateTime } from '@/components/dashboard/shared';
import { formatCompactNumber } from '@/lib/format';
import {
  P2PTrade,
  normalizeErrorMessage,
  useCreateP2PChatUploadUrlMutation,
  useLazyGetP2PChatAttachmentUrlQuery,
  useListP2PTradeMessagesQuery,
  useRaiseP2PDisputeMutation,
  useSendP2PTradeMessageMutation,
} from '@/store/api';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function tradePartyName(party: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return [party.firstName, party.lastName].filter(Boolean).join(' ') || party.email;
}

/**
 * The trade details screen: a shared chat thread for the two trade
 * participants (payment coordination, proof-of-payment uploads), plus a
 * dispute trigger. Once a dispute is raised, admins gain read/post access
 * to this SAME thread server-side (see P2PChatService.requireAccess) -- no
 * separate admin view needed, this component works unmodified for an admin
 * viewer too (isViewerAdmin only changes the sender-side bubble styling).
 */
export function TradeChatPanel({
  trade,
  viewerId,
  isViewerAdmin,
  onClose,
}: {
  trade: P2PTrade;
  viewerId: string | undefined;
  isViewerAdmin: boolean;
  onClose: () => void;
}) {
  const { data: messages = [], isLoading } = useListP2PTradeMessagesQuery(trade.id, {
    pollingInterval: 6000,
  });
  const [sendMessage, { isLoading: sending }] = useSendP2PTradeMessageMutation();
  const [createUploadUrl, { isLoading: uploading }] = useCreateP2PChatUploadUrlMutation();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isOpen = !['RELEASED', 'CANCELLED', 'EXPIRED'].includes(trade.status);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setError('');
    try {
      await sendMessage({ tradeId: trade.id, body }).unwrap();
      setInput('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send message'));
    }
  }

  async function handleFile(file: File) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, WEBP, or PDF files are supported');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('File is too large (max 8MB)');
      return;
    }
    setError('');
    try {
      const { uploadUrl, key } = await createUploadUrl({
        tradeId: trade.id,
        contentType: file.type,
      }).unwrap();
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error('Upload failed');
      await sendMessage({
        tradeId: trade.id,
        attachmentKey: key,
        attachmentContentType: file.type,
      }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not upload attachment'));
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-1000 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
    >
      <div className="flex h-[min(88dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-line bg-white shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-black">
              {tradePartyName(trade.seller)} <span aria-hidden="true">&rArr;</span>{' '}
              {tradePartyName(trade.buyer)}
            </p>
            <p className="text-xs font-bold text-muted">
              {formatCompactNumber(trade.tokenAmount)} DL ·{' '}
              {Number(trade.fiatAmount).toLocaleString()} {trade.fiatCurrency}
            </p>
          </div>
          <button
            aria-label="Close"
            className="shrink-0 rounded p-1 hover:bg-white"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </header>

        {trade.status === 'DISPUTED' && (
          <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            This trade is disputed. An admin can see and post in this conversation.
          </div>
        )}

        <div
          className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-relaxed"
          ref={transcriptRef}
        >
          {isLoading && <p className="text-muted">Loading conversation…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-muted">
              No messages yet. Use this thread to coordinate payment and share proof.
            </p>
          )}
          {messages.map((message) => {
            const isMine = message.senderId === viewerId;
            return (
              <div
                className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}
                key={message.id}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    message.isFromAdmin
                      ? 'border border-red-200 bg-red-50 text-red-900'
                      : isMine
                        ? 'bg-accent text-white'
                        : 'bg-surface-muted text-ink'
                  }`}
                >
                  {message.isFromAdmin && (
                    <p className="mb-0.5 text-xs font-black uppercase tracking-wide">Admin</p>
                  )}
                  {message.body && <p>{message.body}</p>}
                  {message.hasAttachment && (
                    <AttachmentPreview tradeId={trade.id} messageId={message.id} />
                  )}
                </div>
                <span className="px-1 text-xs text-muted">
                  {message.sender.firstName ?? message.sender.email} ·{' '}
                  {formatDateTime(message.createdAt)}
                </span>
              </div>
            );
          })}
        </div>

        {error && <p className="px-4 pb-1 text-sm font-bold text-danger">{error}</p>}

        {showDisputeForm ? (
          <DisputeForm tradeId={trade.id} onCancel={() => setShowDisputeForm(false)} />
        ) : (
          <div className="border-t border-line p-3">
            {isOpen ? (
              <>
                <form className="flex gap-2" onSubmit={submit}>
                  <input
                    accept={ALLOWED_ATTACHMENT_TYPES.join(',')}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                      event.target.value = '';
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    aria-label="Attach proof of payment"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line hover:bg-surface-muted disabled:opacity-50"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Paperclip className="size-4" aria-hidden="true" />
                    )}
                  </button>
                  <input
                    aria-label="Message"
                    className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2"
                    maxLength={2000}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Message the other party…"
                    value={input}
                  />
                  <ActionButton
                    aria-label="Send"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-60"
                    pending={sending}
                    pendingLabel=""
                    type="submit"
                  >
                    <Send className="size-4" aria-hidden="true" />
                  </ActionButton>
                </form>
                {!isViewerAdmin && trade.status !== 'DISPUTED' && (
                  <button
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:underline"
                    onClick={() => setShowDisputeForm(true)}
                    type="button"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden="true" /> Raise a dispute
                  </button>
                )}
              </>
            ) : (
              <p className="text-center text-sm text-muted">
                This trade is {trade.status.toLowerCase().replace('_', ' ')} -- the conversation is
                closed to new messages.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DisputeForm({ tradeId, onCancel }: { tradeId: string; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [raiseDispute, { isLoading }] = useRaiseP2PDisputeMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Please describe the issue');
      return;
    }
    setError('');
    try {
      await raiseDispute({ id: tradeId, reason: reason.trim() }).unwrap();
      onCancel();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not raise dispute'));
    }
  }

  return (
    <form className="border-t border-red-200 bg-red-50 p-3" onSubmit={submit}>
      <p className="mb-2 text-sm font-black text-red-800">Raise a dispute</p>
      <textarea
        className="w-full rounded-lg border border-red-200 bg-white p-2 text-sm"
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explain what went wrong -- an admin will review this conversation and any proof shared above."
        rows={3}
        value={reason}
      />
      {error && <p className="mt-1 text-xs font-bold text-danger">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="min-h-9 rounded-lg border border-line bg-white px-3 text-sm font-extrabold"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <ActionButton
          className="min-h-9 rounded-lg bg-red-700 px-3 text-sm font-extrabold text-white disabled:opacity-60"
          pending={isLoading}
          pendingLabel="Raising"
          type="submit"
        >
          Submit dispute
        </ActionButton>
      </div>
    </form>
  );
}

function AttachmentPreview({ tradeId, messageId }: { tradeId: string; messageId: string }) {
  const [fetchUrl, { data, isFetching }] = useLazyGetP2PChatAttachmentUrlQuery();

  if (data) {
    return (
      <a
        className="mt-1 inline-flex items-center gap-1 text-xs font-bold underline"
        href={data.url}
        rel="noreferrer"
        target="_blank"
      >
        View attachment
      </a>
    );
  }

  return (
    <button
      className="mt-1 inline-flex items-center gap-1 text-xs font-bold underline disabled:opacity-60"
      disabled={isFetching}
      onClick={() => void fetchUrl({ tradeId, messageId })}
      type="button"
    >
      <Paperclip className="size-3" aria-hidden="true" />
      {isFetching ? 'Loading…' : 'View attachment'}
    </button>
  );
}

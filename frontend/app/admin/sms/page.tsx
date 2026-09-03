'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, MessageSquare, Search, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminSmsContact,
  AdminSmsMessage,
  normalizeErrorMessage,
  useListAdminSmsContactsQuery,
  useListAdminSmsMessagesQuery,
  useSendAdminSmsMutation,
} from '@/store/api';

const MESSAGE_LIMIT = 480;
const WARN_AT_REMAINING = 40;

export default function AdminSmsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Only meaningful below the lg breakpoint -- desktop always shows both
  // panes side by side regardless of this value (see the aside/section
  // classNames below).
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, refetch } = useListAdminSmsContactsQuery({
    page,
    pageSize: 30,
    ...(search ? { search } : {}),
  });
  const contacts = data?.items ?? [];
  const selected = useMemo(
    () => contacts.find((contact) => contact.id === selectedId) ?? null,
    [contacts, selectedId],
  );

  function selectContact(contact: AdminSmsContact) {
    setSelectedId(contact.id);
    setMobileView('thread');
    setNotice(null);
    setError(null);
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">SMS</h1>
            <p className="mt-2 max-w-3xl text-muted">
              Send a direct transactional message to a user with a saved mobile number, and review
              the full history of what&apos;s been sent to them.
            </p>
          </div>
          <p className="text-sm font-semibold text-muted">
            {data?.total ?? 0} contact{(data?.total ?? 0) === 1 ? '' : 's'} with mobile numbers
          </p>
        </header>

        <div className="grid h-[calc(100vh-260px)] min-h-[520px] overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)] lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]">
          <aside
            className={`min-h-0 flex-col border-line lg:flex lg:border-b-0 lg:border-r ${
              mobileView === 'list' ? 'flex' : 'hidden'
            }`}
          >
            <div className="border-b border-line p-4">
              <label className="relative block">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <input
                  aria-label="Search SMS contacts"
                  className="min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search name, email, or phone"
                  value={searchInput}
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="p-5 text-sm text-muted">Loading contacts...</p>
              ) : isError ? (
                <div className="grid place-items-center gap-3 px-5 py-14 text-center text-muted">
                  <AlertCircle aria-hidden="true" className="size-6 text-danger" />
                  <p className="font-bold text-danger">Could not load contacts.</p>
                  <button
                    className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted"
                    onClick={() => void refetch()}
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              ) : contacts.length === 0 ? (
                <div className="grid place-items-center gap-2 px-5 py-14 text-center text-muted">
                  <Smartphone aria-hidden="true" className="size-6" />
                  <p className="font-bold">
                    {search ? 'No contacts match your search' : 'No contacts with mobile numbers'}
                  </p>
                </div>
              ) : (
                contacts.map((contact) => (
                  <ContactRow
                    contact={contact}
                    key={contact.id}
                    onSelect={() => selectContact(contact)}
                    selected={selected?.id === contact.id}
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">
                {isFetching ? 'Refreshing' : `Page ${data?.page ?? page} of ${data?.totalPages ?? 1}`}
              </span>
              <div className="flex gap-2">
                <button
                  className="min-h-9 rounded-lg border border-line px-3 font-bold disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="min-h-9 rounded-lg border border-line px-3 font-bold disabled:opacity-50"
                  disabled={page >= (data?.totalPages ?? 1)}
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </aside>

          <section
            className={`min-h-0 flex-col lg:flex ${mobileView === 'thread' ? 'flex' : 'hidden'}`}
          >
            {selected ? (
              <ThreadPane
                contact={selected}
                error={error}
                message={message}
                notice={notice}
                onBack={() => setMobileView('list')}
                onMessageChange={setMessage}
                setError={setError}
                setMessage={setMessage}
                setNotice={setNotice}
              />
            ) : (
              <div className="grid flex-1 place-items-center gap-3 p-8 text-center text-muted">
                <MessageSquare aria-hidden="true" className="size-8" />
                <p className="font-bold">Select a contact to view or start a conversation</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

function ThreadPane({
  contact,
  message,
  notice,
  error,
  onBack,
  onMessageChange,
  setMessage,
  setNotice,
  setError,
}: {
  contact: AdminSmsContact;
  message: string;
  notice: string | null;
  error: string | null;
  onBack: () => void;
  onMessageChange: (value: string) => void;
  setMessage: (value: string) => void;
  setNotice: (value: string | null) => void;
  setError: (value: string | null) => void;
}) {
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useListAdminSmsMessagesQuery({ contactId: contact.id, pageSize: 50 });
  const [sendSms, { isLoading: sending }] = useSendAdminSmsMutation();
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const messages = history?.items ?? [];

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, contact.id]);

  const remaining = MESSAGE_LIMIT - message.length;
  const canSend = message.trim().length > 0 && !sending;

  async function send() {
    if (!message.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const result = await sendSms({ recipientId: contact.id, message: message.trim() }).unwrap();
      setMessage('');
      setNotice(`Delivered to ${result.provider}.`);
    } catch (sendError) {
      setError(normalizeErrorMessage(sendError, 'Unable to send SMS.'));
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
        <button
          aria-label="Back to contacts"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-line hover:bg-surface-muted lg:hidden"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </button>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-dark">
          <MessageSquare aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black">{contactName(contact)}</h2>
          <p className="truncate text-sm text-muted">{contact.phoneNumber}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold">
            <span className={contact.phoneVerified ? 'text-emerald-700' : 'text-amber-700'}>
              {contact.phoneVerified ? 'Phone verified' : 'Phone unverified'}
            </span>
            {!contact.smsNotificationsEnabled && (
              <span className="text-amber-700">SMS preference off</span>
            )}
            {contact.status !== 'ACTIVE' && <span className="text-danger">{contact.status}</span>}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-muted/40 px-4 py-4 sm:px-5">
        {historyLoading ? (
          <p className="text-center text-sm text-muted">Loading conversation...</p>
        ) : historyError ? (
          <div className="grid place-items-center gap-3 py-10 text-center text-muted">
            <AlertCircle aria-hidden="true" className="size-6 text-danger" />
            <p className="font-bold text-danger">Could not load message history.</p>
            <button
              className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold hover:bg-white"
              onClick={() => void refetchHistory()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="grid place-items-center gap-2 py-10 text-center text-muted">
            <MessageSquare aria-hidden="true" className="size-6" />
            <p className="font-bold">No messages sent to this contact yet</p>
            <p className="text-sm">Write a message below to start the conversation.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {messages.map((item) => (
              <MessageBubble key={item.id} message={item} />
            ))}
            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t border-line p-4 sm:p-5">
        <label className="grid gap-2 text-sm font-bold" htmlFor="sms-compose">
          Message
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border border-line bg-white p-3 text-base font-normal text-ink outline-none focus:border-accent"
            id="sms-compose"
            maxLength={MESSAGE_LIMIT}
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a concise message... (Ctrl/Cmd + Enter to send)"
            value={message}
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${remaining <= WARN_AT_REMAINING ? 'font-bold text-amber-700' : 'text-muted'}`}>
            {message.length}/{MESSAGE_LIMIT} characters
          </p>
          <ActionButton
            className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-60"
            disabled={!canSend}
            onClick={() => void send()}
            pending={sending}
            pendingLabel="Sending"
            type="button"
          >
            <Send aria-hidden="true" className="size-4" />
            Send SMS
          </ActionButton>
        </div>
        {notice && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {notice}
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: AdminSmsMessage }) {
  const failed = message.status === 'FAILED';
  const time = new Date(message.createdAt);
  const senderName = message.sender
    ? [message.sender.firstName, message.sender.lastName].filter(Boolean).join(' ') ||
      message.sender.email
    : 'Deleted admin';

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={`max-w-[85%] rounded-lg rounded-tr-sm px-3.5 py-2.5 sm:max-w-[70%] ${
          failed ? 'border border-red-200 bg-red-50' : 'bg-accent text-white'
        }`}
      >
        <p className={`whitespace-pre-wrap break-words text-sm ${failed ? 'text-ink' : ''}`}>
          {message.body}
        </p>
        {failed && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-danger">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Delivery failed{message.failureReason ? `: ${message.failureReason}` : ''}
          </p>
        )}
        {!failed && message.provider && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-white/80">
            <Check aria-hidden="true" className="size-3" />
            Accepted by {message.provider}
          </p>
        )}
      </div>
      <p className="px-1 text-xs text-muted">
        {senderName} &middot; {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

function ContactRow({
  contact,
  selected,
  onSelect,
}: {
  contact: AdminSmsContact;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`w-full border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-muted ${
        selected ? 'bg-accent-soft' : 'bg-white'
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="truncate font-black">{contactName(contact)}</div>
      <div className="mt-0.5 truncate text-sm text-muted">{contact.phoneNumber}</div>
      <div className="mt-1 truncate text-xs text-muted">{contact.email}</div>
    </button>
  );
}

function contactName(contact: Pick<AdminSmsContact, 'firstName' | 'lastName' | 'email'>) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email;
}

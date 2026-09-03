'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Search, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminSmsContact,
  normalizeErrorMessage,
  useListAdminSmsContactsQuery,
  useSendAdminSmsMutation,
} from '@/store/api';

const MESSAGE_LIMIT = 480;

export default function AdminSmsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const { data, isLoading, isFetching } = useListAdminSmsContactsQuery({
    page,
    pageSize: 30,
    ...(search ? { search } : {}),
  });
  const contacts = data?.items ?? [];
  const selected = useMemo(
    () => contacts.find((contact) => contact.id === selectedId) ?? contacts[0] ?? null,
    [contacts, selectedId],
  );
  const [sendSms, { isLoading: sending }] = useSendAdminSmsMutation();

  async function send() {
    if (!selected || !message.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const result = await sendSms({ recipientId: selected.id, message: message.trim() }).unwrap();
      setMessage('');
      setNotice(`SMS accepted by ${result.provider}.`);
    } catch (sendError) {
      setError(normalizeErrorMessage(sendError, 'Unable to send SMS.'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">SMS</h1>
            <p className="mt-2 max-w-3xl text-muted">
              Send a direct transactional message to a user with a saved mobile number.
            </p>
          </div>
          <p className="text-sm font-semibold text-muted">
            {data?.total ?? 0} contact{(data?.total ?? 0) === 1 ? '' : 's'} with mobile numbers
          </p>
        </header>

        <div className="grid min-h-[620px] overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)] lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.6fr)]">
          <aside className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            <div className="border-b border-line p-4">
              <label className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
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
              ) : contacts.length === 0 ? (
                <div className="grid place-items-center gap-2 px-5 py-14 text-center text-muted">
                  <Smartphone aria-hidden="true" className="size-6" />
                  <p className="font-bold">No matching contacts</p>
                </div>
              ) : (
                contacts.map((contact) => (
                  <ContactRow
                    contact={contact}
                    key={contact.id}
                    onSelect={() => {
                      setSelectedId(contact.id);
                      setNotice(null);
                      setError(null);
                    }}
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

          <section className="flex min-h-0 flex-col">
            {selected ? (
              <>
                <div className="border-b border-line px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-dark">
                      <MessageSquare aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-black">{contactName(selected)}</h2>
                      <p className="truncate text-sm text-muted">{selected.phoneNumber}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                        <span className={selected.phoneVerified ? 'text-emerald-700' : 'text-amber-700'}>
                          {selected.phoneVerified ? 'Phone verified' : 'Phone unverified'}
                        </span>
                        {!selected.smsNotificationsEnabled && (
                          <span className="text-amber-700">SMS preference off</span>
                        )}
                        {selected.status !== 'ACTIVE' && <span className="text-danger">{selected.status}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-end gap-4 p-5">
                  <div className="rounded-lg border border-line bg-surface-muted p-4 text-sm text-muted">
                    This sends a direct operational SMS. Provider acceptance is logged; handset delivery may still depend on the recipient&apos;s network.
                  </div>
                  <label className="grid gap-2 text-sm font-bold">
                    Message
                    <textarea
                      className="min-h-40 w-full resize-y rounded-lg border border-line bg-white p-3 text-base font-normal text-ink outline-none focus:border-accent"
                      maxLength={MESSAGE_LIMIT}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Write a concise message..."
                      value={message}
                    />
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted">{message.length}/{MESSAGE_LIMIT} characters</p>
                    <ActionButton
                      className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-60"
                      disabled={!message.trim()}
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
                  {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">{error}</p>}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center gap-3 p-8 text-center text-muted">
                <MessageSquare aria-hidden="true" className="size-8" />
                <p className="font-bold">Select a contact to send an SMS</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
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

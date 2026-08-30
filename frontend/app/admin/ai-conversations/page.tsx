'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquareText, Search, UserRound } from 'lucide-react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { formatDateTime } from '@/components/dashboard/shared';
import {
  AdminAssistantConversationSummary,
  useGetAdminAssistantConversationQuery,
  useGetAdminAssistantConversationsQuery,
} from '@/store/api';

const PAGE_SIZE = 20;

function userName(user: AdminAssistantConversationSummary['user']) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export default function AdminAiConversationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const { data, isFetching, isLoading, isError } = useGetAdminAssistantConversationsQuery({
    page,
    pageSize: PAGE_SIZE,
    search: deferredSearch || undefined,
  });
  const { data: conversation, isFetching: isLoadingConversation } =
    useGetAdminAssistantConversationQuery(selectedId ?? skipToken);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [deferredSearch]);

  useEffect(() => {
    if (!selectedId && data?.items[0]) setSelectedId(data.items[0].id);
  }, [data, selectedId]);

  function changePage(nextPage: number) {
    setSelectedId(null);
    setPage(nextPage);
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header>
          <h1 className="text-3xl font-black">AI Conversations</h1>
          <p className="mt-1 text-muted">
            Read-only monitoring of AI assistant threads created by signed-in users.
          </p>
        </header>

        <div className="grid min-h-[640px] overflow-hidden rounded-lg border border-line bg-white xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b border-line xl:border-b-0 xl:border-r">
            <div className="border-b border-line p-4">
              <label className="sr-only" htmlFor="assistant-conversation-search">
                Search conversations
              </label>
              <div className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3">
                <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  id="assistant-conversation-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or email"
                  type="search"
                  value={search}
                />
              </div>
            </div>

            <div className="min-h-[260px] flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="p-4 text-sm font-bold text-muted">Loading conversations...</p>
              ) : isError ? (
                <p className="p-4 text-sm font-bold text-danger">
                  Could not load AI conversations.
                </p>
              ) : data?.items.length ? (
                data.items.map((item) => {
                  const selected = selectedId === item.id;
                  return (
                    <button
                      className={`block w-full border-b border-line px-4 py-3 text-left transition-colors ${
                        selected ? 'bg-accent-soft' : 'hover:bg-surface-muted'
                      }`}
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <p className="truncate font-extrabold">{userName(item.user)}</p>
                        <span className="shrink-0 text-xs text-muted">
                          {item._count.messages.toLocaleString()} messages
                        </span>
                      </div>
                      <p className="truncate text-sm text-muted">{item.user.email}</p>
                      {item.latestMessage && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted">
                          {item.latestMessage.role === 'user' ? 'User: ' : 'Assistant: '}
                          {item.latestMessage.content}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted">{formatDateTime(item.updatedAt)}</p>
                    </button>
                  );
                })
              ) : (
                <div className="grid min-h-[260px] place-items-center p-5 text-center text-sm font-bold text-muted">
                  No persisted AI conversations found.
                </div>
              )}
            </div>

            {data && data.total > 0 && (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
                <span>
                  {data.total.toLocaleString()} thread{data.total === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Previous conversation page"
                    className="grid size-9 place-items-center rounded-lg border border-line disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={page <= 1 || isFetching}
                    onClick={() => changePage(page - 1)}
                    type="button"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </button>
                  <span>
                    {data.page}/{data.totalPages}
                  </span>
                  <button
                    aria-label="Next conversation page"
                    className="grid size-9 place-items-center rounded-lg border border-line disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={page >= data.totalPages || isFetching}
                    onClick={() => changePage(page + 1)}
                    type="button"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="flex min-h-[440px] min-w-0 flex-col bg-surface-muted">
            {isLoadingConversation ? (
              <div className="grid flex-1 place-items-center p-6 text-sm font-bold text-muted">
                Loading conversation...
              </div>
            ) : conversation ? (
              <>
                <header className="border-b border-line bg-white p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                      <UserRound className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-black">{userName(conversation.user)}</h2>
                      <p className="truncate text-sm text-muted">{conversation.user.email}</p>
                    </div>
                    <span className="ml-auto shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-black text-muted">
                      Read only
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {conversation._count.messages.toLocaleString()} messages &middot; Last activity{' '}
                    {formatDateTime(conversation.updatedAt)}
                  </p>
                  {conversation.truncated && (
                    <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                      Showing the latest 500 messages from this thread.
                    </p>
                  )}
                </header>
                <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
                  {conversation.messages.map((message) => (
                    <article
                      className={`max-w-[88%] rounded-lg px-4 py-3 shadow-sm ${
                        message.role === 'user'
                          ? 'ml-auto bg-accent text-white'
                          : 'border border-line bg-white text-ink'
                      }`}
                      key={message.id}
                    >
                      <p
                        className={`mb-1 text-xs font-black uppercase ${
                          message.role === 'user' ? 'text-white/75' : 'text-muted'
                        }`}
                      >
                        {message.role === 'user' ? 'User' : 'AI assistant'}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.content}
                      </p>
                      <time
                        className={`mt-2 block text-xs ${
                          message.role === 'user' ? 'text-white/75' : 'text-muted'
                        }`}
                        dateTime={message.createdAt}
                      >
                        {formatDateTime(message.createdAt)}
                      </time>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <MessageSquareText className="mx-auto size-8 text-muted" aria-hidden="true" />
                  <p className="mt-3 font-black">Select a conversation</p>
                  <p className="mt-1 text-sm text-muted">
                    Messages are available to administrators for monitoring only.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

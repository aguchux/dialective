'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  useChatWithAssistantMutation,
  useGetAssistantThreadQuery,
  useGetPublicClientSettingsQuery,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';
import { Avatar } from '@/components/dashboard/shared';

type ChatMessage = { role: 'user' | 'assistant'; content: string; createdAt: string };

const AUTH_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/magic-link',
]);

export function AiAssistantWidget() {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const { data: settings } = useGetPublicClientSettingsQuery();
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [send, { isLoading, error }] = useChatWithAssistantMutation();
  const { data: thread } = useGetAssistantThreadQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const transcriptRef = useRef<HTMLDivElement>(null);
  const enabled = settings?.supportChatMode === 'AI' && !AUTH_PATHS.has(pathname);
  // TrainerDashboard's MobileNavigation (fixed bottom tab bar, h-16 == 4rem)
  // only renders on /dashboard itself -- everywhere else the widget should
  // sit flush at the true viewport bottom, not leave a phantom gap for a
  // nav bar that isn't there.
  const clearsBottomNav = pathname === '/dashboard';
  const prompt = useMemo(() => input.trim(), [input]);

  useEffect(() => {
    if (status === 'authenticated' && thread) {
      setChat(
        thread.messages.map(({ role, content, createdAt }) => ({ role, content, createdAt })),
      );
    }
  }, [status, thread]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [chat, isLoading]);

  if (!enabled) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt || isLoading) return;
    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    const next = [...chat, userMessage];
    setChat(next);
    setInput('');
    try {
      const response = await send({
        message: prompt,
        history: chat.slice(-8).map(({ role, content }) => ({ role, content })),
      }).unwrap();
      setChat((current) => [
        ...current,
        { role: 'assistant', content: response.message, createdAt: new Date().toISOString() },
      ]);
    } catch {
      // The error is shown inline, while the user message remains available
      // for a deliberate retry instead of being silently discarded.
    }
  }

  const launcherBottomClass = clearsBottomNav
    ? 'bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)]'
    : 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]';
  const panelBottomClass = clearsBottomNav
    ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))]'
    : 'bottom-[env(safe-area-inset-bottom)]';

  return (
    // z-1000: above LandingHeader's z-900 (the highest header/nav z-index
    // in the app) -- this widget is a floating overlay and must never render
    // underneath page chrome, on any route.
    <div
      className={`fixed right-4 z-1000 flex items-end gap-3 lg:bottom-6 lg:right-6 ${launcherBottomClass}`}
    >
      <section
        aria-hidden={!open}
        aria-label="Dialect Library assistant"
        className={`fixed inset-x-0 z-1000 flex h-[min(78dvh,680px)] flex-col overflow-hidden rounded-t-xl border border-line bg-white shadow-2xl transition-transform duration-300 ease-out lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:w-[min(520px,42vw)] lg:rounded-none lg:border-y-0 ${panelBottomClass} ${
          open
            ? 'translate-x-0 translate-y-0'
            : 'invisible pointer-events-none translate-x-0 translate-y-full lg:translate-x-full lg:translate-y-0'
        }`}
      >
        <header className="flex items-center justify-between border-b border-line bg-surface-muted px-4 py-3">
          <div className="flex items-center gap-2 font-black">
            <Bot className="size-5 text-accent" />
            Dialect Library assistant
          </div>
          <button
            aria-label="Close assistant"
            className="rounded p-1 hover:bg-white"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X className="size-5" />
          </button>
        </header>
        <div
          className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-relaxed"
          ref={transcriptRef}
        >
          {chat.length === 0 && (
            <p className="text-muted">
              Ask about getting started, training, earnings, courses, or platform navigation.
            </p>
          )}
          {chat.map((item, index) => {
            const isUser = item.role === 'user';
            return (
              <div
                key={`${item.role}-${index}`}
                className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                {isUser ? (
                  <Avatar email={session?.user?.email ?? 'You'} image={session?.user?.image} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white"
                  >
                    <Bot className="size-4" />
                  </span>
                )}
                <div
                  className={`flex max-w-[80%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={
                      isUser
                        ? 'rounded-lg bg-accent px-3 py-2 text-white'
                        : 'rounded-lg bg-surface-muted px-3 py-2 text-ink'
                    }
                  >
                    {renderMessage(item.content)}
                  </div>
                  <span className="px-1 text-xs text-muted">{formatTime(item.createdAt)}</span>
                </div>
              </div>
            );
          })}
          {isLoading && <p className="text-muted">Thinking...</p>}
          {Boolean(error) && (
            <p className="text-danger">The assistant could not respond. Please try again.</p>
          )}
        </div>
        <form className="flex gap-2 border-t border-line p-3" onSubmit={submit}>
          <input
            aria-label="Ask a question"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2"
            maxLength={1600}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask a question"
            value={input}
          />
          <ActionButton
            aria-label="Send message"
            className="inline-flex size-10 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-60"
            pending={isLoading}
            pendingLabel=""
            type="submit"
          >
            <Send className="size-4" />
          </ActionButton>
        </form>
      </section>
      <button
        aria-label="Open assistant"
        className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent-dark"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <MessageCircle className="size-6" />
      </button>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function renderMessage(content: string) {
  const parts = content.split(
    /(\[[^\]]+\]\((?:\/[A-Za-z0-9_/?=&-]*|https:\/\/(?:www\.youtube\.com\/@DialectLibrary|wa\.me\/447424448030|www\.dialectlibrary\.com\/faq)|mailto:hello@dialectlibrary\.com)\))/g,
  );
  return parts.map((part, index) => {
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (!match) return <span key={index}>{part}</span>;
    if (!isApprovedAssistantHref(match[2])) return <span key={index}>{part}</span>;
    if (!match[2].startsWith('/')) {
      return (
        <a
          className="font-bold underline"
          href={match[2]}
          key={index}
          rel="noreferrer"
          target="_blank"
        >
          {match[1]}
        </a>
      );
    }
    return (
      <Link className="font-bold underline" href={match[2]} key={index}>
        {match[1]}
      </Link>
    );
  });
}

function isApprovedAssistantHref(href: string) {
  return (
    /^\/[A-Za-z0-9_/?=&-]*$/.test(href) ||
    href === 'https://www.youtube.com/@DialectLibrary' ||
    href === 'https://wa.me/447424448030' ||
    href === 'https://www.dialectlibrary.com/faq' ||
    href === 'mailto:hello@dialectlibrary.com'
  );
}

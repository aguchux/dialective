'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { DykNotice, useClickDykMutation, useDykImpressionMutation, useLazyDykFeedQuery } from '@/store/dyk-api';

export function DykPrompt() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const eligible = status === 'authenticated' && ['TRAINER', 'DISTRIBUTOR'].includes(session?.user?.role ?? '') && /^\/(dashboard|distributor)(\/|$)/.test(pathname);
  return eligible ? <ActivePrompt key={session?.user?.id} /> : null;
}

function ActivePrompt() {
  const [feed] = useLazyDykFeedQuery();
  const [impression] = useDykImpressionMutation();
  const [click] = useClickDykMutation();
  const router = useRouter();
  const [items, setItems] = useState<DykNotice[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = useRef(false);
  const visited = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let checking = false;
    const check = async () => {
      if (checking || open.current || document.hidden || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      checking = true;
      try {
        const result = await feed().unwrap();
        if (!alive.current || !result.items.length || (result.nextAt && Date.parse(result.nextAt) > Date.now())) return;
        if (document.hidden || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
        const first = result.items[0];
        const claim = await impression({ id: first.id }).unwrap();
        if (!alive.current || !claim.allowed || document.hidden || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
        visited.current = new Set([first.id]);
        open.current = true;
        setIndex(0); setError(''); setItems(result.items);
      } catch { /* Optional notices must never block dashboard use. */ }
      finally { checking = false; }
    };
    const first = setTimeout(check, 20000);
    const timer = setInterval(check, 60000);
    return () => { alive.current = false; clearTimeout(first); clearInterval(timer); };
  }, [feed, impression]);
  const close = () => { open.current = false; setItems([]); setError(''); };
  const navigate = async (step: number) => {
    if (busy) return;
    const next = (index + step + items.length) % items.length;
    const notice = items[next];
    setBusy(true); setError('');
    try {
      if (!visited.current.has(notice.id)) {
        const result = await impression({ id: notice.id, navigation: true }).unwrap();
        if (!result.allowed) { setError('This notice is no longer available.'); return; }
        visited.current.add(notice.id);
      }
      setIndex(next);
    } catch { setError('Unable to load the next notice. Please try again.'); }
    finally { setBusy(false); }
  };
  const follow = async () => {
    setBusy(true); setError('');
    try {
      const { href } = await click(items[index].id).unwrap();
      close();
      if (href.startsWith('/')) router.push(href);
      else window.location.assign(href);
    } catch { setError('Unable to open this notice. Please try again.'); }
    finally { setBusy(false); }
  };
  const notice = items[index];
  return notice ? <Dialog.Root open onOpenChange={value => { if (!value) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(94vw,960px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-neutral-950 text-white shadow-2xl focus:outline-none">
        <div className="relative aspect-[3/2] min-h-[360px] max-h-[90dvh] overflow-y-auto sm:min-h-0">
          {/* Uploaded creative remains visible behind the readable copy overlay. */}
          <img src={notice.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative flex min-h-full flex-col justify-end bg-gradient-to-t from-black via-black/50 to-transparent px-12 pb-8 pt-20 sm:px-20 sm:pb-12">
            <Dialog.Title className="text-2xl font-black sm:text-4xl">Do you know?</Dialog.Title>
            <Dialog.Description className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white sm:text-lg">{notice.content}</Dialog.Description>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button disabled={busy} onClick={follow} className="flex min-h-11 items-center gap-2 rounded-md bg-purple-700 px-5 py-2 font-bold text-white disabled:opacity-60">{busy && <Loader2 className="size-4 animate-spin" />}Try it Now</button>
              <button onClick={close} className="min-h-11 rounded-md px-3 py-2 font-semibold hover:bg-white/10">Not now</button>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-red-200">{error}</p>}
          </div>
          {items.length > 1 && <>
            <button title="Previous notice" aria-label="Previous notice" disabled={busy} onClick={() => navigate(-1)} className="absolute left-2 top-1/3 grid size-9 place-items-center rounded-full bg-black/60 disabled:opacity-50 sm:left-4 sm:size-11"><ChevronLeft /></button>
            <button title="Next notice" aria-label="Next notice" disabled={busy} onClick={() => navigate(1)} className="absolute right-2 top-1/3 grid size-9 place-items-center rounded-full bg-black/60 disabled:opacity-50 sm:right-4 sm:size-11"><ChevronRight /></button>
          </>}
        </div>
        <span aria-live="polite" className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/80">{index + 1} / {items.length}</span>
        <Dialog.Close aria-label="Close notice" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/50"><X /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root> : null;
}

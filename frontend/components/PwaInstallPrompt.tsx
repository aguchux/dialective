'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  useGetPublicClientSettingsQuery,
  useGetMeQuery,
  useRecordPwaInstallationMutation,
} from '@/store/api';

const INSTALL_REQUEST_EVENT = 'dialectlibrary:pwa-install-request';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Opens the shared install dialog from a dashboard account menu. */
export function requestPwaInstall(): void {
  window.dispatchEvent(new Event(INSTALL_REQUEST_EVENT));
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function localKey(userId: string, key: 'dismissed' | 'installed'): string {
  return `dialect-library:pwa:${userId}:${key}`;
}

export function PwaInstallPrompt() {
  const { data: session, status } = useSession();
  const { data: settings } = useGetPublicClientSettingsQuery();
  const { data: profile, isLoading: isProfileLoading } = useGetMeQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const [recordInstallation] = useRecordPwaInstallationMutation();
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [lastDismissedAt, setLastDismissedAt] = useState<number | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);

  const userId = session?.user?.id;
  const reminderMs = Math.max(60, settings?.pwaInstallPromptReminderMinutes ?? 60) * 60_000;
  const promptEnabled = settings?.pwaInstallPromptEnabled ?? true;

  function persistInstalled() {
    if (!userId) return;
    localStorage.setItem(localKey(userId, 'installed'), new Date().toISOString());
    localStorage.removeItem(localKey(userId, 'dismissed'));
    setInstalled(true);
    setOpen(false);
    void recordInstallation()
      .unwrap()
      .catch(() => undefined);
  }

  function dismiss() {
    if (!userId) return;
    const now = Date.now();
    localStorage.setItem(localKey(userId, 'dismissed'), String(now));
    setLastDismissedAt(now);
    setOpen(false);
  }

  function mayShowAutomatically() {
    if (!userId || isProfileLoading || installed || !promptEnabled || isStandalone()) return false;
    if (!deferredPrompt.current && !isAppleMobile()) return false;
    const dismissedAt = Number(localStorage.getItem(localKey(userId, 'dismissed')) ?? '0');
    return !dismissedAt || Date.now() - dismissedAt >= reminderMs;
  }

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    const previouslyInstalled = Boolean(localStorage.getItem(localKey(userId, 'installed')));
    if (profile?.pwaInstalledAt) {
      localStorage.setItem(localKey(userId, 'installed'), profile.pwaInstalledAt);
      setInstalled(true);
      return;
    }
    if (previouslyInstalled || isStandalone()) {
      persistInstalled();
      return;
    }
    const dismissedAt = Number(localStorage.getItem(localKey(userId, 'dismissed')) ?? '0');
    setLastDismissedAt(dismissedAt || null);
  }, [profile?.pwaInstalledAt, status, userId]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
      if (mayShowAutomatically()) setOpen(true);
    };
    const onInstalled = () => persistInstalled();
    const onInstallRequest = () => {
      if (!installed) setOpen(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(INSTALL_REQUEST_EVENT, onInstallRequest);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(INSTALL_REQUEST_EVENT, onInstallRequest);
    };
  });

  useEffect(() => {
    if (mayShowAutomatically()) setOpen(true);
    // A deferred install event can precede session/settings hydration. This
    // second check opens the prompt once both are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInstall, installed, isProfileLoading, lastDismissedAt, promptEnabled, reminderMs, userId]);

  useEffect(() => {
    if (!userId || installed || !promptEnabled || !lastDismissedAt) return;
    const remaining = reminderMs - (Date.now() - lastDismissedAt);
    if (remaining <= 0) {
      if (mayShowAutomatically()) setOpen(true);
      return;
    }
    const timer = window.setTimeout(() => {
      if (mayShowAutomatically()) setOpen(true);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [installed, isProfileLoading, lastDismissedAt, promptEnabled, reminderMs, userId]);

  async function install() {
    if (!deferredPrompt.current) return;
    setInstalling(true);
    try {
      await deferredPrompt.current.prompt();
      const choice = await deferredPrompt.current.userChoice;
      if (choice.outcome === 'accepted') persistInstalled();
      else dismiss();
    } finally {
      deferredPrompt.current = null;
      setCanInstall(false);
      setInstalling(false);
    }
  }

  if (status !== 'authenticated' || !userId || installed) return null;

  const showAppleSteps = !canInstall && isAppleMobile();
  const installUnavailable = !canInstall && !showAppleSteps;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : dismiss())}>
      <DialogContent
        title="Install Dialect Library"
        description="Keep Dialect Library one tap away with an app-like workspace and an offline-ready shell for your next session."
      >
        <div className="grid gap-4">
          {showAppleSteps ? (
            <div className="rounded-lg border border-line bg-surface-muted p-4 text-sm leading-relaxed text-muted">
              <div className="mb-2 flex items-center gap-2 font-bold text-ink">
                <Share className="size-4 text-accent" aria-hidden="true" /> Add it from Safari
              </div>
              Tap Share, choose <strong>Add to Home Screen</strong>, then confirm{' '}
              <strong>Add</strong>.
            </div>
          ) : installUnavailable ? (
            <div className="rounded-lg border border-line bg-surface-muted p-4 text-sm leading-relaxed text-muted">
              Installation is not available in this browser. Open this page in Chrome, Edge, or
              Safari on your mobile device to add Dialect Library to your home screen.
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted p-4">
              <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
                <Smartphone className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm leading-relaxed text-muted">
                Install once to open the platform directly from your phone or desktop like a native
                app.
              </p>
            </div>
          )}
          {canInstall && (
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void install()}
              pending={installing}
              pendingLabel="Opening install"
              type="button"
            >
              <Download className="size-4" aria-hidden="true" /> Install app
            </ActionButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

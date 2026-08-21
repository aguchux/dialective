'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useGetPublicClientSettingsQuery } from '@/store/api';
import { onFullScreenOverlay } from '@/lib/recording-signal';

const SCRIPT_ID = 'tawkto-widget-script';
const AUTHENTICATION_SHELL_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/magic-link',
  '/onboarding',
]);

interface TawkApi {
  onLoad?: () => void;
  setAttributes?: (attributes: Record<string, string>, callback?: (error?: unknown) => void) => void;
  hideWidget?: () => void;
  showWidget?: () => void;
  visitor?: { name?: string; email?: string };
}

declare global {
  interface Window {
    Tawk_API?: TawkApi;
  }
}

/**
 * Tawk_API only exists once the embed script has finished loading, which
 * can happen well after other effects in this component want to call it --
 * polls briefly rather than assuming load order. Capped at 20 tries (~10s)
 * so a disabled/blocked widget doesn't retry forever.
 */
function whenTawkReady(run: (api: TawkApi) => void): () => void {
  let cancelled = false;
  let attempts = 0;
  const attempt = () => {
    if (cancelled) return;
    const api = window.Tawk_API;
    if (api) {
      run(api);
    } else if (attempts < 20) {
      attempts += 1;
      window.setTimeout(attempt, 500);
    }
  };
  attempt();
  return () => {
    cancelled = true;
  };
}

/**
 * Loads the Tawk.to live-chat embed script once, only when an admin has
 * enabled it and set both IDs (Settings -> General -- see
 * PlatformSettingsService.getTawkToWidget, which already withholds the IDs
 * from the public API response unless the widget is fully configured, so
 * this component never needs to re-check that itself). Injected imperatively
 * rather than via next/script because the property/widget IDs only become
 * known after this query resolves, and Tawk.to's own snippet is a
 * self-invoking loader, not something with react-friendly src/onLoad props.
 *
 * Once a session exists, the visitor's name/email are pushed into Tawk.to
 * via setAttributes so a chat agent sees who they're talking to instead of
 * an anonymous "Visitor" -- guests keep the default anonymous widget.
 */
export function TawkToWidget() {
  const pathname = usePathname();
  const { data: settings } = useGetPublicClientSettingsQuery();
  const { data: session, status } = useSession();
  const enabled = settings?.tawkToEnabled ?? false;
  const propertyId = settings?.tawkToPropertyId ?? null;
  const widgetId = settings?.tawkToWidgetId ?? null;
  const isDashboardRoute =
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/distributor' ||
    pathname.startsWith('/distributor/') ||
    pathname === '/notifications';
  const isAuthenticationShellRoute = AUTHENTICATION_SHELL_PATHS.has(pathname);
  const shouldShowWidget = enabled && !isDashboardRoute && !isAuthenticationShellRoute;

  // The embed is global so it can persist after client-side navigation. Hide
  // an already-loaded widget immediately when a user enters any role dashboard.
  useEffect(() => {
    if (!enabled) return;
    if (shouldShowWidget) {
      return whenTawkReady((api) => api.showWidget?.());
    }

    return whenTawkReady((api) => api.hideWidget?.());
  }, [enabled, shouldShowWidget]);

  useEffect(() => {
    if (!shouldShowWidget || !propertyId || !widgetId) return;
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.body.appendChild(script);
  }, [propertyId, shouldShowWidget, widgetId]);

  useEffect(() => {
    if (!shouldShowWidget || status !== 'authenticated' || !session.user) return;

    const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') || session.user.email || undefined;
    const email = session.user.email ?? undefined;
    if (!name && !email) return;

    return whenTawkReady((api) => {
      api.setAttributes?.({ ...(name ? { name } : {}), ...(email ? { email } : {}) }, () => {});
    });
  }, [shouldShowWidget, status, session?.user]);

  // Hides the floating bubble for the duration of a WordTrainingDialog
  // session or an open CourseSlideViewer -- both are full-screen overlays
  // that use the same bottom-right corner the bubble floats in and would
  // otherwise overlap/steal taps. See lib/recording-signal.ts.
  useEffect(() => {
    if (!shouldShowWidget) return;
    let cancelWait: (() => void) | undefined;
    let hidden = false;
    const unsubscribe = onFullScreenOverlay((active) => {
      cancelWait?.();
      hidden = active;
      cancelWait = whenTawkReady((api) => (active ? api.hideWidget?.() : api.showWidget?.()));
    });
    return () => {
      cancelWait?.();
      unsubscribe();
      // If an overlay was still open when this unmounted/disabled (e.g. an
      // admin flips tawkToEnabled off while a dialog is open), don't leave
      // the widget permanently hidden -- restore it.
      if (hidden) whenTawkReady((api) => api.showWidget?.());
    };
  }, [shouldShowWidget]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useGetPublicClientSettingsQuery } from '@/store/api';

const SCRIPT_ID = 'tawkto-widget-script';

interface TawkApi {
  onLoad?: () => void;
  setAttributes?: (attributes: Record<string, string>, callback?: (error?: unknown) => void) => void;
  visitor?: { name?: string; email?: string };
}

declare global {
  interface Window {
    Tawk_API?: TawkApi;
  }
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
  const { data: settings } = useGetPublicClientSettingsQuery();
  const { data: session, status } = useSession();
  const enabled = settings?.tawkToEnabled ?? false;
  const propertyId = settings?.tawkToPropertyId ?? null;
  const widgetId = settings?.tawkToWidgetId ?? null;

  useEffect(() => {
    if (!enabled || !propertyId || !widgetId) return;
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.body.appendChild(script);
  }, [enabled, propertyId, widgetId]);

  useEffect(() => {
    if (!enabled || status !== 'authenticated' || !session.user) return;

    const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') || session.user.email || undefined;
    const email = session.user.email ?? undefined;
    if (!name && !email) return;

    // Tawk_API only exists once the embed script (above) has finished
    // loading, which can happen well after this session becomes available --
    // poll briefly rather than assuming load order between the two effects.
    // Capped at 20 tries (~10s) so a disabled/blocked widget doesn't retry
    // forever for the rest of the session.
    let cancelled = false;
    let attempts = 0;
    const attempt = () => {
      if (cancelled) return;
      const api = window.Tawk_API;
      if (api?.setAttributes) {
        api.setAttributes({ ...(name ? { name } : {}), ...(email ? { email } : {}) }, () => {});
      } else if (attempts < 20) {
        attempts += 1;
        window.setTimeout(attempt, 500);
      }
    };
    attempt();

    return () => {
      cancelled = true;
    };
  }, [enabled, status, session?.user]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useGetPublicAdSettingsQuery } from '@/store/api';

const ADSTERRA_SCRIPT_ID = 'adsterra-network-script';
const MONETAG_SCRIPT_ID = 'monetag-network-script';

// Account/settings pages are excluded -- a member editing their profile or
// changing settings shouldn't be interrupted by a popunder/social-bar ad.
// Everywhere else (feed, posts, spaces, search) is fair game. Community has
// no login/register pages of its own (middleware.ts bounces those to the
// main frontend app), so there's no auth-shell route list to mirror here.
const EXCLUDED_PATH_PREFIXES = ['/settings', '/me'];

function isExcludedRoute(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function injectScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.body.appendChild(script);
}

function removeScript(id: string) {
  document.getElementById(id)?.remove();
}

/**
 * Site-wide Adsterra/Monetag popunder+social-bar embeds, gated by
 * CommunitySettingsService.getPublicAdSettings (Settings -> Community ->
 * Ad networks). Each network only loads once BOTH admin-enabled AND its
 * script URL are set -- the backend already withholds the URL otherwise, so
 * `enabled` here can be trusted at face value. The admin-entered URL is the
 * exact <script src> from that network's own "Get code" panel (a Social Bar
 * unit needs nothing else -- no container div, self-mounting). Injected
 * imperatively (not next/script) because the URL is only known after this
 * query resolves, mirroring frontend/components/TawkToWidget.tsx's pattern
 * for the same reason.
 */
export function AdNetworkScripts() {
  const pathname = usePathname();
  const { data: settings } = useGetPublicAdSettingsQuery();
  const excluded = isExcludedRoute(pathname);

  const adsterraActive = !excluded && !!settings?.adsterra.enabled && !!settings.adsterra.scriptUrl;
  const monetagActive = !excluded && !!settings?.monetag.enabled && !!settings.monetag.scriptUrl;

  useEffect(() => {
    if (!adsterraActive || !settings?.adsterra.scriptUrl) {
      removeScript(ADSTERRA_SCRIPT_ID);
      return;
    }
    injectScript(ADSTERRA_SCRIPT_ID, settings.adsterra.scriptUrl);
    return () => removeScript(ADSTERRA_SCRIPT_ID);
  }, [adsterraActive, settings?.adsterra.scriptUrl]);

  useEffect(() => {
    if (!monetagActive || !settings?.monetag.scriptUrl) {
      removeScript(MONETAG_SCRIPT_ID);
      return;
    }
    injectScript(MONETAG_SCRIPT_ID, settings.monetag.scriptUrl);
    return () => removeScript(MONETAG_SCRIPT_ID);
  }, [monetagActive, settings?.monetag.scriptUrl]);

  return null;
}

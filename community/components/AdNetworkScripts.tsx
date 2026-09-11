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

// PLACEHOLDER -- not a verified Adsterra URL. Replace with the exact embed
// snippet's src from the Adsterra dashboard (Site ID `siteId`, chosen ad
// format) once available.
function buildAdsterraSrc(siteId: string): string {
  return `https://www.profitableratecpm.com/${siteId}/invoke.js`;
}

// PLACEHOLDER -- not a verified Monetag URL. Replace with the exact embed
// snippet's src from the Monetag dashboard (Zone ID `zoneId`, chosen ad
// format) once available.
function buildMonetagSrc(zoneId: string): string {
  return `https://groleegni.net/tag.min.js?z=${zoneId}`;
}

/**
 * Site-wide Adsterra/Monetag popunder+social-bar embeds, gated by
 * CommunitySettingsService.getPublicAdSettings (Settings -> Community ->
 * Ad networks). Each network only loads once BOTH admin-enabled AND its
 * site/zone ID are set -- the backend already withholds the ID otherwise,
 * so `enabled` here can be trusted at face value. Injected imperatively
 * (not next/script) because the IDs are only known after this query
 * resolves, mirroring frontend/components/TawkToWidget.tsx's pattern for
 * the same reason.
 */
export function AdNetworkScripts() {
  const pathname = usePathname();
  const { data: settings } = useGetPublicAdSettingsQuery();
  const excluded = isExcludedRoute(pathname);

  const adsterraActive = !excluded && !!settings?.adsterra.enabled && !!settings.adsterra.siteId;
  const monetagActive = !excluded && !!settings?.monetag.enabled && !!settings.monetag.zoneId;

  useEffect(() => {
    if (!adsterraActive || !settings?.adsterra.siteId) {
      removeScript(ADSTERRA_SCRIPT_ID);
      return;
    }
    // TODO: replace with the exact invoke-script URL from the Adsterra
    // dashboard for the chosen ad format (popunder/social bar) -- the
    // format below is a placeholder, not a verified current URL. Adsterra
    // typically gives a <script> snippet per zone; adapt buildAdsterraSrc.
    injectScript(ADSTERRA_SCRIPT_ID, buildAdsterraSrc(settings.adsterra.siteId));
    return () => removeScript(ADSTERRA_SCRIPT_ID);
  }, [adsterraActive, settings?.adsterra.siteId]);

  useEffect(() => {
    if (!monetagActive || !settings?.monetag.zoneId) {
      removeScript(MONETAG_SCRIPT_ID);
      return;
    }
    // TODO: replace with the exact tag URL from the Monetag dashboard for
    // the chosen ad format -- the format below is a placeholder, not a
    // verified current URL. Adapt buildMonetagSrc once the real snippet is
    // available.
    injectScript(MONETAG_SCRIPT_ID, buildMonetagSrc(settings.monetag.zoneId));
    return () => removeScript(MONETAG_SCRIPT_ID);
  }, [monetagActive, settings?.monetag.zoneId]);

  return null;
}

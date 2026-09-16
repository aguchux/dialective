'use client';

import { useEffect, useState } from 'react';
import { useGetPublicClientSettingsQuery } from '@/store/api';
import { hasConsented, onCookieConsentGiven } from '@/lib/cookie-consent-signal';

const SCRIPT_ID = 'google-analytics-gtag-script';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Loads Google Analytics (gtag.js) once, only when an admin has enabled it
 * and set a measurement ID (Settings -> Analytics & Metrics -- see
 * PlatformSettingsService.getGoogleAnalyticsSettings, which already
 * withholds the measurement ID from the public API response unless fully
 * configured, so this component never needs to re-check that itself), AND
 * only after the visitor has acknowledged the cookie consent banner --
 * loading an analytics/tracking script before consent would make
 * CookieConsentBanner's copy false. Mirrors TawkToWidget.tsx's imperative
 * script-injection approach for the same reason: the measurement ID only
 * becomes known after this query resolves, and gtag.js's own snippet
 * initializes global state (window.dataLayer/gtag) rather than exposing
 * react-friendly src/onLoad props.
 */
export function GoogleAnalytics() {
  const { data: settings } = useGetPublicClientSettingsQuery();
  const [consented, setConsented] = useState(false);
  const enabled = settings?.googleAnalyticsEnabled ?? false;
  const measurementId = settings?.googleAnalyticsMeasurementId ?? null;

  useEffect(() => {
    setConsented(hasConsented());
    return onCookieConsentGiven(() => setConsented(true));
  }, []);

  useEffect(() => {
    if (!enabled || !measurementId || !consented) return;
    if (document.getElementById(SCRIPT_ID)) return;

    const loader = document.createElement('script');
    loader.id = SCRIPT_ID;
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(loader);

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
  }, [consented, enabled, measurementId]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { useGetPublicClientSettingsQuery } from '@/store/api';

const SCRIPT_ID = 'tawkto-widget-script';

/**
 * Loads the Tawk.to live-chat embed script once, only when an admin has
 * enabled it and set both IDs (Settings -> General -- see
 * PlatformSettingsService.getTawkToWidget, which already withholds the IDs
 * from the public API response unless the widget is fully configured, so
 * this component never needs to re-check that itself). Injected imperatively
 * rather than via next/script because the property/widget IDs only become
 * known after this query resolves, and Tawk.to's own snippet is a
 * self-invoking loader, not something with react-friendly src/onLoad props.
 */
export function TawkToWidget() {
  const { data: settings } = useGetPublicClientSettingsQuery();
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

  return null;
}

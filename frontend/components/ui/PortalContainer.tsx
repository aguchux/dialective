'use client';

import { createContext, useContext } from 'react';

/**
 * Radix portals (Dialog, DropdownMenu) render to document.body by default,
 * which sits outside any scoped theme wrapper. The trainer dashboard is the
 * only surface where dark mode is allowed to apply (see globals.css's
 * `.dashboard-theme.dark` scoping), so its portals need to render inside
 * that wrapper instead of body -- otherwise dialogs/dropdowns opened from
 * the dashboard would silently ignore dark mode. Admin and landing pages
 * never provide this context, so they keep the default (document.body).
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: React.ReactNode;
}) {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>;
}

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}

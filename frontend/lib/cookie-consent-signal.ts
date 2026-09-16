/**
 * Analytics/tracking scripts (Google Analytics) must not load until the
 * visitor has acknowledged the cookie consent banner (CookieConsentBanner.tsx)
 * -- mirrors recording-signal.ts's pub/sub pattern since GoogleAnalytics.tsx
 * has no reference to the globally-mounted banner and shouldn't need one.
 * hasConsented() reads the same localStorage key the banner itself uses, so
 * a component that mounts after consent was already given (e.g. a fresh
 * page load on a later visit) sees the right state immediately without
 * waiting for a notify() call that will never come this session.
 */
const CONSENT_STORAGE_KEY = 'dialectiva_cookie_consent';

type Listener = () => void;

const listeners = new Set<Listener>();

export function hasConsented(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === '1';
  } catch {
    // Storage unavailable (private browsing, disabled cookies) -- treat as
    // not consented, same as the banner treating it as "never acknowledged".
    return false;
  }
}

export function notifyCookieConsentGiven(): void {
  listeners.forEach((listener) => listener());
}

export function onCookieConsentGiven(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

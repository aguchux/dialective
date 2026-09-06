/**
 * Mirrors frontend/lib/auth-maintenance-signal.ts -- a single authenticated
 * API call failing with the AuthMaintenance error (503, see backend
 * AuthMaintenanceException) means an admin just turned on
 * authMaintenanceBlockSessions -- every active session, not just this one
 * request, needs to be logged out. community/store/api.ts's base query
 * calls notifyAuthMaintenance() the moment it sees that shape; providers.tsx
 * subscribes once at the app root and drives the actual signOut/redirect.
 */
export interface AuthMaintenanceDetail {
  until: string | null;
  message: string | null;
}

type Listener = (detail: AuthMaintenanceDetail) => void;

const listeners = new Set<Listener>();

export function notifyAuthMaintenance(detail: AuthMaintenanceDetail): void {
  listeners.forEach((listener) => listener(detail));
}

export function onAuthMaintenance(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

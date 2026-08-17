/**
 * Tawk.to's floating chat bubble sits bottom-right, the same corner
 * WordTrainingDialog's record button/audio controls live in -- visually
 * colliding with (and stealing taps from) the recording UI. WordTrainingDialog
 * calls notifyRecordingSession() whenever it opens/closes; TawkToWidget
 * subscribes and calls the widget's own hideWidget()/showWidget() API.
 * Mirrors the auth-maintenance-signal.ts pattern for the same reason: the
 * dialog has no reference to the globally-mounted widget component (and
 * shouldn't need one), so a tiny pub/sub module is the connection between them.
 */
type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();

export function notifyRecordingSession(active: boolean): void {
  listeners.forEach((listener) => listener(active));
}

export function onRecordingSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

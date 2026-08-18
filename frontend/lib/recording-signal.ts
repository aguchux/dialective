/**
 * Tawk.to's floating chat bubble sits bottom-right and floats above
 * everything (outside React's DOM tree, high z-index) -- it visually
 * collides with any full-screen overlay that also uses that corner:
 * WordTrainingDialog's record button/audio controls, and CourseSlideViewer's
 * mobile prev/next + narration bar. Both call notifyFullScreenOverlay()
 * whenever they open/close; TawkToWidget subscribes and calls the widget's
 * own hideWidget()/showWidget() API. Mirrors the auth-maintenance-signal.ts
 * pattern for the same reason: neither overlay has a reference to the
 * globally-mounted widget component (and shouldn't need one), so a tiny
 * pub/sub module is the connection between them. Named around what it
 * signals (a full-screen overlay is open), not the first caller that used
 * it (recording) -- kept as notifyRecordingSession's true successor rather
 * than a recording-specific concept now that a second, non-recording caller
 * needs the exact same behavior.
 */
type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();

export function notifyFullScreenOverlay(active: boolean): void {
  listeners.forEach((listener) => listener(active));
}

export function onFullScreenOverlay(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

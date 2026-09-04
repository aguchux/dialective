'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
const HEARTBEAT_MIN_INTERVAL_MS = 2 * 60_000;

/**
 * Bumps the JWT's lastActiveAt claim (via useSession().update, which round-
 * trips through auth-options.ts's jwt() callback's trigger==='update'
 * branch) whenever the trainer/admin is genuinely interacting with the
 * page -- throttled to at most once every HEARTBEAT_MIN_INTERVAL_MS so a
 * continuously-active tab doesn't spam the session endpoint on every
 * mousemove. This is the client-side half of session idle-timeout
 * enforcement; frontend/proxy.ts's comparison against lastActiveAt on every
 * protected-route request is the half that actually can't be bypassed by
 * disabling this component's JS -- this only makes an active session live
 * as long as it should, it isn't itself a security boundary.
 */
export function SessionActivityTracker() {
  const { status, update } = useSession();
  const lastHeartbeatAtRef = useRef(0);

  useEffect(() => {
    if (status !== 'authenticated') return;

    function onActivity() {
      const now = Date.now();
      if (now - lastHeartbeatAtRef.current < HEARTBEAT_MIN_INTERVAL_MS) return;
      lastHeartbeatAtRef.current = now;
      void update({ lastActiveAt: now });
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [status, update]);

  return null;
}

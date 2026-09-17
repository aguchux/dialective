'use client';

import { useCallback, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AuthGateDialog } from './AuthGateDialog';

/**
 * Gates navigation to protected stream-catalogue routes behind a real
 * NextAuth session check. Already-authenticated clicks pass straight
 * through `run`; unauthenticated clicks open a centered sign-in dialog and
 * only call `run` once the dialog's OTP flow completes.
 */
export function useAuthGate() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const pendingRun = useRef<(() => void) | null>(null);

  const guard = useCallback(
    (_href: string, run: () => void) => {
      if (status === 'authenticated') {
        run();
        return;
      }
      pendingRun.current = run;
      setOpen(true);
    },
    [status],
  );

  const close = useCallback(() => {
    setOpen(false);
    pendingRun.current = null;
  }, []);

  const handleSuccess = useCallback(() => {
    const run = pendingRun.current;
    pendingRun.current = null;
    setOpen(false);
    run?.();
  }, []);

  const dialog = <AuthGateDialog onClose={close} onSuccess={handleSuccess} open={open} />;

  return { guard, dialog, isAuthenticated: status === 'authenticated' };
}

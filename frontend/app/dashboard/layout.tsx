'use client';

import { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { GenderGateDialog } from '@/components/trainer/GenderGateDialog';

/**
 * Wraps every /dashboard/* route (the main dashboard plus reports,
 * payout-accounts, held-in-review, learn/*, etc. -- each of these renders
 * its own copy of DashboardHeader/MobileNavigation independently, so this
 * layout is the one place common to all of them). Only job here is the
 * gender backfill gate: trainers who completed onboarding before gender
 * collection existed (onboardingComplete true, gender still null) see a
 * blocking dialog on top of whichever page they land on. Everyone else
 * (non-TRAINER roles, or a TRAINER who already has gender set) renders
 * children untouched.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const needsGenderGate =
    status === 'authenticated' &&
    session?.user?.role === 'TRAINER' &&
    session.user.onboardingComplete &&
    !session.user.gender;

  return (
    <>
      {children}
      {needsGenderGate && <GenderGateDialog />}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { normalizeErrorMessage, useUpdateProfileMutation } from '@/store/api';

const optionClass =
  'flex min-h-14 flex-1 items-center justify-center rounded-lg border-2 border-line bg-white px-4 text-base font-bold text-ink transition-colors hover:border-accent dark:bg-surface-muted';
const selectedOptionClass =
  'flex min-h-14 flex-1 items-center justify-center rounded-lg border-2 border-accent bg-accent-soft px-4 text-base font-bold text-accent-dark transition-colors dark:bg-surface-muted';

/**
 * Backfill gate for trainers who completed onboarding before gender
 * collection existed -- session.user.onboardingComplete is true but
 * session.user.gender is still null. Mounted once in dashboard/layout.tsx so
 * it covers every /dashboard/* route, not just the main dashboard page.
 * Deliberately no skip/dismiss affordance (preventClose on DialogContent):
 * this is a one-time hard block, not a reminder.
 */
export function GenderGateDialog() {
  const { update } = useSession();
  const [selected, setSelected] = useState<'MALE' | 'FEMALE' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  async function handleSubmit() {
    if (!selected) {
      setError('Select an option to continue.');
      return;
    }
    setError(null);
    try {
      const profile = await updateProfile({ gender: selected }).unwrap();
      await update({ gender: profile.gender });
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save your selection.'));
    }
  }

  return (
    <Dialog open>
      <DialogContent
        description="We're updating trainer profiles. Please select your gender to continue."
        preventClose
        title="Quick profile update"
      >
        <div className="grid gap-3">
          <div className="flex gap-3">
            <button
              className={selected === 'MALE' ? selectedOptionClass : optionClass}
              onClick={() => setSelected('MALE')}
              type="button"
            >
              Male
            </button>
            <button
              className={selected === 'FEMALE' ? selectedOptionClass : optionClass}
              onClick={() => setSelected('FEMALE')}
              type="button"
            >
              Female
            </button>
          </div>
          {error && (
            <p className="text-sm font-semibold text-danger" role="alert">
              {error}
            </p>
          )}
          <ActionButton
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSubmit}
            pending={isLoading}
            pendingLabel="Saving"
            type="button"
          >
            Continue
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

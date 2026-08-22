'use client';

import { useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ActionButton } from '@/components/ui/ActionButton';
import { normalizeErrorMessage, useUpdateProfileMutation } from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Magic-link sign-in never collects a name (email-only by design), and
 * password registration's own name fields predate this account's creation
 * in some edge cases (e.g. rows created before that field existed). Rather
 * than only gate this at /onboarding -- which a TRAINER with
 * onboardingComplete=true never revisits, and which ADMIN/DISTRIBUTOR/
 * PARTNER never see at all -- this mounts globally in Providers and blocks
 * every authenticated surface with an undismissable dialog until a name is
 * on file. No escape key, no overlay-click-to-close, no visible close
 * button: this is a hard gate, not a dismissible prompt.
 */
export function RequireNameDialog() {
  const { data: session, status, update } = useSession();
  const pathname = usePathname();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  // /onboarding already collects the name inline as part of its own form
  // (see app/onboarding/page.tsx) -- skip there so a TRAINER mid-onboarding
  // doesn't see two name prompts stacked on top of each other.
  const skip = pathname === '/onboarding';
  const open =
    !skip && status === 'authenticated' && (!session.user?.firstName || !session.user?.lastName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name to continue.');
      return;
    }
    try {
      const profile = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      }).unwrap();
      await update({
        firstName: profile.firstName,
        lastName: profile.lastName,
        onboardingComplete: profile.onboardingComplete,
      });
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save your name.'));
    }
  }

  if (!open) return null;

  return (
    <RadixDialog.Root open modal>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-100 bg-black/60 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <RadixDialog.Content
          className="fixed left-1/2 top-1/2 z-101 grid w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-white p-6 shadow-[0_20px_50px_rgba(27,31,27,0.3)] focus:outline-none data-[state=open]:animate-[scaleIn_150ms_ease-out] dark:bg-surface"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="grid gap-1">
            <RadixDialog.Title className="text-xl font-black">
              Complete your profile
            </RadixDialog.Title>
            <RadixDialog.Description className="text-sm text-muted">
              We need your name before you can continue.
            </RadixDialog.Description>
          </div>

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <div className="grid gap-1">
              <label className="text-sm font-bold" htmlFor="require-name-first">
                First name
              </label>
              <input
                autoComplete="given-name"
                autoFocus
                className={inputClass}
                id="require-name-first"
                maxLength={80}
                onChange={(e) => setFirstName(e.target.value)}
                required
                value={firstName}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-bold" htmlFor="require-name-last">
                Last name
              </label>
              <input
                autoComplete="family-name"
                className={inputClass}
                id="require-name-last"
                maxLength={80}
                onChange={(e) => setLastName(e.target.value)}
                required
                value={lastName}
              />
            </div>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <ActionButton
              className={primaryButtonClass}
              pending={isLoading}
              pendingLabel="Saving"
              type="submit"
            >
              Continue
            </ActionButton>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

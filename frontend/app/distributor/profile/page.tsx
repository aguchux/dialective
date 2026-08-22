'use client';

import { useEffect, useState } from 'react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { NotificationPreferencesPanel } from '@/components/notifications/NotificationPreferencesPanel';
import { normalizeErrorMessage, useGetMeQuery, useUpdateProfileMutation } from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export default function DistributorProfilePage() {
  const { data: me, isLoading } = useGetMeQuery();
  const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName ?? '');
    setLastName(me.lastName ?? '');
  }, [me]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updateProfile({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      }).unwrap();
      setMessage('Profile saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save profile.'));
    }
  }

  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-black">Profile</h1>
          <p className="mt-2 max-w-4xl text-muted">Your distributor account details.</p>
        </div>

        <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          {isLoading && <p className="text-muted">Loading...</p>}
          {!isLoading && (
            <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
              <div className="grid gap-1">
                <label className="font-bold" htmlFor="distributor-email">
                  Email
                </label>
                <input
                  className={inputClass}
                  id="distributor-email"
                  value={me?.email ?? ''}
                  disabled
                  readOnly
                />
              </div>

              <div className="grid gap-1">
                <label className="font-bold" htmlFor="distributor-first-name">
                  First name
                </label>
                <input
                  className={inputClass}
                  id="distributor-first-name"
                  maxLength={80}
                  onChange={(e) => setFirstName(e.target.value)}
                  value={firstName}
                />
              </div>

              <div className="grid gap-1">
                <label className="font-bold" htmlFor="distributor-last-name">
                  Last name
                </label>
                <input
                  className={inputClass}
                  id="distributor-last-name"
                  maxLength={80}
                  onChange={(e) => setLastName(e.target.value)}
                  value={lastName}
                />
              </div>

              <div>
                <ActionButton
                  className={primaryButtonClass}
                  type="submit"
                  pending={isSaving}
                  pendingLabel="Saving"
                >
                  Save profile
                </ActionButton>
              </div>
            </form>
          )}

          {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
        </section>

        <NotificationPreferencesPanel />
      </div>
    </DistributorShell>
  );
}

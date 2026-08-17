'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { normalizeErrorMessage, useGetMeQuery, useUpdateProfileMutation } from '@/store/api';

/**
 * Blog/Course notification opt-in toggles -- the same two switches
 * TrainerDashboard.tsx's ProfileView renders inline, extracted so admin and
 * distributor accounts (which never render that trainer-only view) have
 * somewhere to control blogNewsNotificationsEnabled/courseNotificationsEnabled
 * too. Every role can receive a BLOG/COURSE-kind SystemUpdate notification
 * (see NotificationsService.recipientWhere), so every role needs a way to
 * opt in, not just trainers.
 */

type PreferenceKey = 'blogNewsNotificationsEnabled' | 'courseNotificationsEnabled';

export function NotificationPreferencesPanel() {
  const { data: me } = useGetMeQuery();
  const [updateProfile] = useUpdateProfileMutation();
  const [prefs, setPrefs] = useState({ blogNewsNotificationsEnabled: false, courseNotificationsEnabled: false });
  const [saving, setSaving] = useState<PreferenceKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setPrefs({
      blogNewsNotificationsEnabled: me.blogNewsNotificationsEnabled,
      courseNotificationsEnabled: me.courseNotificationsEnabled,
    });
  }, [me?.blogNewsNotificationsEnabled, me?.courseNotificationsEnabled]);

  async function toggle(key: PreferenceKey, value: boolean) {
    setMessage(null);
    setError(null);
    setSaving(key);
    const previous = prefs[key];
    setPrefs((current) => ({ ...current, [key]: value }));
    try {
      await updateProfile({ [key]: value }).unwrap();
      setMessage('Notification preferences updated.');
    } catch (err) {
      setPrefs((current) => ({ ...current, [key]: previous }));
      setError(normalizeErrorMessage(err, 'Could not update notification preferences.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Notifications</h2>
        <p className="leading-relaxed text-muted">Choose which platform updates land in your notification inbox.</p>
      </div>

      <div className="grid divide-y divide-line overflow-hidden rounded-lg border border-line">
        <ToggleRow
          checked={prefs.blogNewsNotificationsEnabled}
          disabled={saving !== null}
          label="Blog & News"
          loading={saving === 'blogNewsNotificationsEnabled'}
          onChange={(checked) => void toggle('blogNewsNotificationsEnabled', checked)}
          subtitle="New articles and platform news."
        />
        <ToggleRow
          checked={prefs.courseNotificationsEnabled}
          disabled={saving !== null}
          label="Courses"
          loading={saving === 'courseNotificationsEnabled'}
          onChange={(checked) => void toggle('courseNotificationsEnabled', checked)}
          subtitle="New learning courses and training guides."
        />
      </div>

      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ToggleRow({
  checked,
  disabled,
  label,
  loading,
  onChange,
  subtitle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  loading: boolean;
  onChange: (checked: boolean) => void;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="font-extrabold text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>
      <button
        aria-checked={checked}
        aria-label={`${checked ? 'Disable' : 'Enable'} ${label} notifications`}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'border-accent bg-accent' : 'border-line bg-surface-muted'
        }`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`absolute top-1 grid size-5 place-items-center rounded-full bg-white text-accent shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        >
          {loading ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : null}
        </span>
      </button>
    </div>
  );
}

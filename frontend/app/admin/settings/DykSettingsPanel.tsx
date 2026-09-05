'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DykSettings, useDykSettingsQuery, useSaveDykSettingsMutation } from '@/store/dyk-api';

const input = 'w-full rounded-md border border-line bg-white p-2 text-ink';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line px-3 py-2 disabled:opacity-50';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Gates/config only -- whether "Do you know?" notices show at all, how
 * often, and the per-card display cap. Notice content/CRUD lives on its own
 * /admin/dyk page (DykNoticesPanel) so this settings tab stays scoped to
 * platform-wide behavior, not per-notice authoring.
 */
export function DykSettingsPanel() {
  const settings = useDykSettingsQuery();
  const [saveSettings, saving] = useSaveDykSettingsMutation();
  const [draftSettings, setDraftSettings] = useState<DykSettings | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const value = draftSettings ?? settings.data;

  if (settings.isLoading) return <p role="status">Loading settings...</p>;
  if (!value || settings.isError) {
    return (
      <div role="alert">
        Unable to load settings. <button className={button} onClick={() => settings.refetch()}>Retry</button>
      </div>
    );
  }

  const change = (update: Partial<DykSettings>) => { setDraftSettings({ ...value, ...update }); setSaved(false); };

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Do you know?</h2>
        <p className="leading-relaxed text-muted">
          Controls whether "Do you know?" notices show at all and how often. Manage the notice
          photos/content themselves on the dedicated Do you know? page.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSaved(false);
          try {
            await saveSettings({
              enabled: value.enabled,
              intervalMinutes: value.intervalMinutes,
              maxDisplays: value.maxDisplays,
            }).unwrap();
            setDraftSettings(null);
            setSaved(true);
          } catch {
            setError('Unable to save reminder settings. Please try again.');
          }
        }}
      >
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={value.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
          Enable dashboard notices
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span>Reminder interval (minutes)</span>
            <input
              required
              type="number"
              min={1}
              max={43200}
              className={input}
              value={value.intervalMinutes}
              onChange={(e) => change({ intervalMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="space-y-1">
            <span>Maximum displays per card per user</span>
            <input
              required
              type="number"
              min={1}
              max={100}
              className={input}
              value={value.maxDisplays}
              onChange={(e) => change({ maxDisplays: Number(e.target.value) })}
            />
          </label>
        </div>
        <button disabled={saving.isLoading} className={primaryButtonClass}>
          {saving.isLoading && <Loader2 className="size-4 animate-spin" />}Save settings
        </button>
        {saved && <p role="status" className="leading-relaxed text-accent-dark">Settings saved.</p>}
      </form>
      {error && <p role="alert" className="leading-relaxed text-danger">{error}</p>}
    </section>
  );
}

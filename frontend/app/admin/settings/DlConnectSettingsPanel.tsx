'use client';

import { useEffect, useRef, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
  useUploadConnectHeroImageMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const ALLOWED_HERO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 dark:bg-surface-muted';

/**
 * The DL Connect event hero -- the full-bleed band shown under the nav on
 * the trainer dashboard and in Community, linking through to the Connect
 * landing page.
 *
 * The event year here is not cosmetic: it becomes
 * ConnectRegistration.eventKey ("connect-2027"), so next year's event gets
 * its own registrations, stats, speakers and reminders from a settings
 * change rather than a deploy. Every copy field is optional -- the API
 * fills in a title from the year and a designed gradient when no image is
 * uploaded, so enabling the toggle alone produces a complete hero.
 */
export function DlConnectSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();
  const [uploadConnectHeroImage, { isLoading: isUploadingHero }] =
    useUploadConnectHeroImageMutation();
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const [connectHeroEnabled, setConnectHeroEnabled] = useState(false);
  const [connectEventYear, setConnectEventYear] = useState('2026');
  const [connectHeroTitle, setConnectHeroTitle] = useState('');
  const [connectHeroSubtitle, setConnectHeroSubtitle] = useState('');
  const [connectHeroDateLabel, setConnectHeroDateLabel] = useState('');
  const [connectHeroCtaLabel, setConnectHeroCtaLabel] = useState('');
  const [connectHeroUrl, setConnectHeroUrl] = useState('');
  const [connectHeroImageUrl, setConnectHeroImageUrl] = useState<string | null>(null);
  const [connectHeroImageBucket, setConnectHeroImageBucket] = useState<string | null>(null);
  const [connectHeroImageKey, setConnectHeroImageKey] = useState<string | null>(null);
  // Same reasoning as the top banner's dirty flag: bucket/key are null on
  // load, so only an actual upload or removal should write them back.
  const [connectHeroImageDirty, setConnectHeroImageDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setConnectHeroEnabled(settings.connectHeroEnabled);
    setConnectEventYear(settings.connectEventYear);
    setConnectHeroTitle(settings.connectHeroTitle ?? '');
    setConnectHeroSubtitle(settings.connectHeroSubtitle ?? '');
    setConnectHeroDateLabel(settings.connectHeroDateLabel ?? '');
    setConnectHeroCtaLabel(settings.connectHeroCtaLabel ?? '');
    setConnectHeroUrl(settings.connectHeroUrl ?? '');
    setConnectHeroImageUrl(settings.connectHeroImageUrl);
    setConnectHeroImageDirty(false);
  }, [settings]);

  async function handleHeroFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!ALLOWED_HERO_TYPES.includes(file.type)) {
      setError('Hero image must be JPEG, PNG, or WebP.');
      return;
    }
    try {
      const { uploadUrl, bucket, key } = await uploadConnectHeroImage({
        contentType: file.type,
      }).unwrap();
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error('Upload to storage failed');
      }
      setConnectHeroImageBucket(bucket);
      setConnectHeroImageKey(key);
      setConnectHeroImageUrl(URL.createObjectURL(file));
      setConnectHeroImageDirty(true);
      setMessage(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to upload hero image.'));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const year = connectEventYear.trim();
    if (!/^\d{4}$/.test(year)) {
      setError('Event year must be four digits, e.g. 2027.');
      return;
    }

    try {
      await updateSettings({
        connectHeroEnabled,
        connectEventYear: year,
        connectHeroTitle: connectHeroTitle.trim() || null,
        connectHeroSubtitle: connectHeroSubtitle.trim() || null,
        connectHeroDateLabel: connectHeroDateLabel.trim() || null,
        connectHeroCtaLabel: connectHeroCtaLabel.trim() || null,
        connectHeroUrl: connectHeroUrl.trim() || null,
        ...(connectHeroImageDirty ? { connectHeroImageBucket, connectHeroImageKey } : {}),
      }).unwrap();
      setMessage('DL Connect settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save DL Connect settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">DL Connect</h2>
        <p className="leading-relaxed text-muted">
          The event hero shown under the menu bar on the Trainer dashboard and in Community,
          redirecting to the Connect landing page. The event year below is what separates one
          year&apos;s registrations, speakers and reminders from the next&apos;s -- change it to
          open Connect {Number(connectEventYear || '2026') + 1} without a deploy.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
            htmlFor="connect-hero-enabled"
          >
            <input
              checked={connectHeroEnabled}
              className="mt-0.5 size-5 accent-accent"
              id="connect-hero-enabled"
              onChange={(event) => setConnectHeroEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-bold">Show the Connect hero</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Turning this off hides the band everywhere at once. It does not affect the Connect
                landing page itself, which stays reachable by its own URL.
              </span>
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="connect-event-year">
            Event year
            <input
              className={inputClass}
              id="connect-event-year"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setConnectEventYear(event.target.value)}
              placeholder="2026"
              value={connectEventYear}
            />
            <span className="text-sm font-normal text-muted">
              Four digits. Registrations are stored against this year, so changing it starts a
              fresh list -- the previous year&apos;s reservations and speakers stay in the database
              untouched but drop out of the admin Connect page and the public counts.
            </span>
          </label>

          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
            <div>
              <h3 className="font-bold">Hero background</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Optional. With no image the hero uses a designed gradient, which is a deliberate
                fallback rather than a placeholder -- you do not need to upload anything for the
                band to look finished.
              </p>
            </div>

            {connectHeroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Connect hero preview"
                className="max-h-40 w-full rounded-lg border border-line object-cover"
                src={connectHeroImageUrl}
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <ActionButton
                className={secondaryButtonClass}
                onClick={() => heroFileInputRef.current?.click()}
                pending={isUploadingHero}
                pendingLabel="Uploading"
                type="button"
              >
                {connectHeroImageUrl ? 'Replace image' : 'Upload image'}
              </ActionButton>
              {connectHeroImageUrl && (
                <button
                  className="text-sm font-bold text-danger hover:underline"
                  onClick={() => {
                    setConnectHeroImageUrl(null);
                    setConnectHeroImageBucket(null);
                    setConnectHeroImageKey(null);
                    setConnectHeroImageDirty(true);
                  }}
                  type="button"
                >
                  Remove image
                </button>
              )}
              <input
                accept={ALLOWED_HERO_TYPES.join(',')}
                className="hidden"
                onChange={handleHeroFileChange}
                ref={heroFileInputRef}
                type="file"
              />
            </div>
          </div>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="connect-hero-title">
            Title
            <input
              className={inputClass}
              id="connect-hero-title"
              onChange={(event) => setConnectHeroTitle(event.target.value)}
              placeholder={`Dialect Library Connect ${connectEventYear || '2026'}`}
              value={connectHeroTitle}
            />
            <span className="text-sm font-normal text-muted">
              Leave blank to use the event year: &quot;Dialect Library Connect{' '}
              {connectEventYear || '2026'}&quot;.
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="connect-hero-subtitle">
            Subtitle
            <input
              className={inputClass}
              id="connect-hero-subtitle"
              onChange={(event) => setConnectHeroSubtitle(event.target.value)}
              placeholder="Our first contributor webinar"
              value={connectHeroSubtitle}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="connect-hero-date-label">
            Date label
            <input
              className={inputClass}
              id="connect-hero-date-label"
              onChange={(event) => setConnectHeroDateLabel(event.target.value)}
              placeholder="October 2026"
              value={connectHeroDateLabel}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="connect-hero-cta-label">
            Button label
            <input
              className={inputClass}
              id="connect-hero-cta-label"
              onChange={(event) => setConnectHeroCtaLabel(event.target.value)}
              placeholder="Reserve your place"
              value={connectHeroCtaLabel}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="connect-hero-url">
            Landing page URL
            <input
              className={inputClass}
              id="connect-hero-url"
              onChange={(event) => setConnectHeroUrl(event.target.value)}
              placeholder="https://connect.dialectlibrary.com"
              type="url"
              value={connectHeroUrl}
            />
            <span className="text-sm font-normal text-muted">
              Where the hero sends people. Leave blank for the default Connect site.
            </span>
          </label>

          {message && <p className="font-bold text-emerald-700 dark:text-emerald-400">{message}</p>}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save changes
            </ActionButton>
          </div>
        </form>
      )}
    </section>
  );
}

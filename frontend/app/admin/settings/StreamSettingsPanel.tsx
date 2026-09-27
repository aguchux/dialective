'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

const groupClass = 'grid gap-3 rounded-lg border border-line bg-bg p-4';

/**
 * Every Stream Dialect gate in one place.
 *
 * These controls were spread across tabs -- onboarding here, the three VDCL
 * licensing toggles under "Dataset & Storage" beside audio retention, and the
 * catalogue coverage gate nowhere at all (a settings column with no UI, so it
 * could only be changed in the database). They belong together because they
 * are read together: whether a subscriber SEES a recording is decided by the
 * coverage gate, and whether they can PLAY it by the enforcement gate.
 * Reasoning about that pair from two different tabs invites turning on a hard
 * gate without seeing what feeds it.
 *
 * Contributor payout suppression is deliberately NOT here. It suppresses real
 * payouts and has its own OTP step-up route, so it stays on its own panel --
 * folding it into this form would let one ordinary save move money.
 */
export function StreamSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [selfServeSignupEnabled, setSelfServeSignupEnabled] = useState(false);
  const [vdclEnabled, setVdclEnabled] = useState(false);
  const [vdclEnforcement, setVdclEnforcement] = useState(false);
  const [vdclRetentionExemption, setVdclRetentionExemption] = useState(true);
  const [coverageFilter, setCoverageFilter] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setSelfServeSignupEnabled(settings.streamSelfServeSignupEnabled);
    setVdclEnabled(settings.vdclEnabled);
    setVdclEnforcement(settings.vdclEnforcementEnabled);
    setVdclRetentionExemption(settings.vdclRetentionExemptionEnabled);
    setCoverageFilter(settings.vdclCatalogueCoverageFilterEnabled);
  }, [settings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        streamSelfServeSignupEnabled: selfServeSignupEnabled,
        vdclEnabled,
        vdclEnforcementEnabled: vdclEnforcement,
        vdclRetentionExemptionEnabled: vdclRetentionExemption,
        vdclCatalogueCoverageFilterEnabled: coverageFilter,
      }).unwrap();
      setMessage('Stream Dialect settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Stream Dialect settings.'));
    }
  }

  // Off coverage filter + off enforcement = unlicensed audio is actually
  // streamable, which is the one combination nobody should reach by accident.
  const unlicensedStreamable = !coverageFilter && !vdclEnforcement;

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Stream Dialect settings</h2>
        <p className="leading-relaxed text-muted">
          Every gate for Dialect Library Voice Stream &mdash; the subscriber-facing dataset
          licensing app at stream.dialectlibrary.com. Onboarding, contributor licensing, and what
          the subscriber catalogue is allowed to show.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}

      {!isLoading && (
        <form className="grid gap-4" onSubmit={handleSave}>
          {/* Catalogue visibility first: it is the gate most likely to be
              changed while testing, and the one whose interaction with
              enforcement needs stating plainly. */}
          <div className={groupClass}>
            <div className="grid gap-1">
              <h3 className="text-lg font-bold leading-snug">What the catalogue shows</h3>
              <p className="text-sm leading-relaxed text-muted">
                Controls which recordings appear in subscriber search results. This is a listing
                gate only &mdash; whether audio can actually be played is decided by{' '}
                <strong>Require a licence to stream</strong> below.
              </p>
            </div>

            <label className="flex items-start gap-3" htmlFor="stream-coverage-filter">
              <input
                checked={coverageFilter}
                className="mt-0.5 size-5 accent-accent"
                id="stream-coverage-filter"
                onChange={(event) => setCoverageFilter(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Show licensed recordings only</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When <strong>on</strong>, search lists only recordings covered by a signed
                  contributor licence, so a subscriber never sees a row they cannot play. This is
                  the setting to use once licensing is live.
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-muted">
                  When <strong>off</strong>, search lists every settled recording that still has
                  audio, licensed or not &mdash; which is what makes it possible to exercise the
                  catalogue against real data while licence coverage is still small. Unlicensed
                  rows are visible but still <strong>not streamable</strong> as long as
                  &ldquo;Require a licence to stream&rdquo; stays on, so this widens what can be
                  seen, never what can be taken.
                </span>
              </span>
            </label>

            <p className="rounded-lg border border-line bg-surface-muted p-3 text-sm leading-relaxed text-muted">
              Coverage figures in the subscriber app always count licensed recordings only,
              whichever way this is set &mdash; a headline number must not change meaning because a
              toggle moved.
            </p>
          </div>

          {/* Moved here from Dataset & Storage. */}
          <div className={groupClass}>
            <div className="grid gap-1">
              <h3 className="text-lg font-bold leading-snug">Contributor licensing (VDCL)</h3>
              <p className="text-sm leading-relaxed text-muted">
                Whether contributors can create a licence at all, whether a licence is required
                before a subscriber may stream a recording, and whether licensed audio is protected
                from the retention rules on the Dataset &amp; Storage tab.
              </p>
            </div>

            <label className="flex items-start gap-3" htmlFor="stream-vdcl-enabled">
              <input
                checked={vdclEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="stream-vdcl-enabled"
                onChange={(event) => setVdclEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Open contributor licensing (VDCL)</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Off until licence publication is complete. While off, contributors see no licence
                  page or menu item and every licensing request is refused, so no licence can be
                  signed. Admin licence screens and public certificate verification keep working
                  either way, so you can still exercise the flow and any issued certificate still
                  verifies.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3" htmlFor="stream-vdcl-enforcement">
              <input
                checked={vdclEnforcement}
                className="mt-0.5 size-5 accent-accent"
                id="stream-vdcl-enforcement"
                onChange={(event) => setVdclEnforcement(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Require a licence to stream</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, a subscriber cannot stream or preview any recording not covered by an
                  active contributor licence granting their declared purpose. Keep this{' '}
                  <strong>on</strong> whenever the listing gate above is off &mdash; together they
                  let unlicensed data be browsed for testing without any of it becoming playable.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3" htmlFor="stream-vdcl-retention-exemption">
              <input
                checked={vdclRetentionExemption}
                className="mt-0.5 size-5 accent-accent"
                id="stream-vdcl-retention-exemption"
                onChange={(event) => setVdclRetentionExemption(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Protect licensed audio from retention</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  On by default. A signed licence says &ldquo;this manifest covers these clips,
                  verify by hash&rdquo;, so the audio behind them must not be purged. Turning this
                  off lets retention delete licensed audio, which breaks the provenance claim of
                  any licence already issued.
                </span>
              </span>
            </label>
          </div>

          {unlicensedStreamable && (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800"
              role="alert"
            >
              <strong>Unlicensed audio is streamable with these settings.</strong> The catalogue
              lists every settled recording and no licence is required to play one, so a subscriber
              could download work from contributors who have signed nothing. Turn{' '}
              <strong>Require a licence to stream</strong> back on to keep browsing unlicensed data
              without exposing the audio.
            </p>
          )}

          <div className={groupClass}>
            <div className="grid gap-1">
              <h3 className="text-lg font-bold leading-snug">Subscriber onboarding</h3>
            </div>

            <label className="flex items-start gap-3" htmlFor="stream-self-serve-signup">
              <input
                checked={selfServeSignupEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="stream-self-serve-signup"
                onChange={(event) => setSelfServeSignupEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Allow self-serve signup</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, the Voice Stream /register page lets anyone create an account directly
                  (email/password, then verify by emailed code) instead of requiring an admin invite
                  first. When off, Stream stays admin-invite-only and /register only collects a
                  &quot;Request access&quot; lead for admin follow-up -- from there, use Approve
                  &amp; invite or Resend invite on the{' '}
                  <a
                    className="font-bold text-accent hover:text-accent-dark"
                    href="/admin/data-access"
                  >
                    Stream Requests
                  </a>{' '}
                  page.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save Stream Dialect settings
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
  );
}

'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';
import { KycRecheckPanel } from './KycRecheckPanel';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function KycSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [requiredForWithdrawals, setRequiredForWithdrawals] = useState(false);
  const [minWithdrawalTokens, setMinWithdrawalTokens] = useState('0');
  const [requiredOnboarding, setRequiredOnboarding] = useState(false);
  const [autoCancelStaleEnabled, setAutoCancelStaleEnabled] = useState(false);
  const [autoCancelStaleMinutes, setAutoCancelStaleMinutes] = useState('60');
  const [selfHostedEnabled, setSelfHostedEnabled] = useState(false);
  const [activeKycProvider, setActiveKycProvider] = useState<'didit' | 'self'>('didit');
  const [selfHostedAutoApprove, setSelfHostedAutoApprove] = useState(false);
  const [selfHostedBotEnabled, setSelfHostedBotEnabled] = useState(false);
  const [selfHostedDocumentTypes, setSelfHostedDocumentTypes] = useState(
    'passport,national_id,drivers_license',
  );
  const [selfHostedMinFaceMatchScore, setSelfHostedMinFaceMatchScore] = useState('85');
  const [selfHostedMinLivenessScore, setSelfHostedMinLivenessScore] = useState('80');
  const [selfHostedMaxFaceMatchScoreForDecline, setSelfHostedMaxFaceMatchScoreForDecline] =
    useState('40');
  const [selfHostedMaxLivenessScoreForDecline, setSelfHostedMaxLivenessScoreForDecline] =
    useState('40');
  const [selfHostedRequireDocumentFaceDetected, setSelfHostedRequireDocumentFaceDetected] =
    useState(true);
  const [selfHostedDoNotAutoDecline, setSelfHostedDoNotAutoDecline] = useState(false);
  const [manualPhoneVerificationEnabled, setManualPhoneVerificationEnabled] = useState(true);
  const [manualPhoneVerificationFeeTokens, setManualPhoneVerificationFeeTokens] = useState('1');
  const [manualPhoneVerificationWhatsappNumber, setManualPhoneVerificationWhatsappNumber] =
    useState('');
  const [manualPhoneVerificationExpiryMinutes, setManualPhoneVerificationExpiryMinutes] =
    useState('30');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setRequiredForWithdrawals(settings.isKycRequiredForWithdrawals);
    setMinWithdrawalTokens(settings.kycMinWithdrawalTokens);
    setRequiredOnboarding(settings.isKycRequiredOnboarding);
    setAutoCancelStaleEnabled(settings.kycAutoCancelStaleEnabled);
    setAutoCancelStaleMinutes(String(settings.kycAutoCancelStaleMinutes));
    setSelfHostedEnabled(settings.selfHostedKycEnabled);
    setActiveKycProvider(settings.activeKycProvider === 'self' ? 'self' : 'didit');
    setSelfHostedAutoApprove(settings.selfHostedKycAutoApproveEnabled);
    setSelfHostedBotEnabled(settings.selfHostedKycBotEnabled);
    setSelfHostedDocumentTypes(settings.selfHostedKycDocumentTypes);
    setSelfHostedMinFaceMatchScore(String(settings.selfHostedKycMinFaceMatchScore));
    setSelfHostedMinLivenessScore(String(settings.selfHostedKycMinLivenessScore));
    setSelfHostedMaxFaceMatchScoreForDecline(
      String(settings.selfHostedKycMaxFaceMatchScoreForDecline),
    );
    setSelfHostedMaxLivenessScoreForDecline(
      String(settings.selfHostedKycMaxLivenessScoreForDecline),
    );
    setSelfHostedRequireDocumentFaceDetected(settings.selfHostedKycRequireDocumentFaceDetected);
    setSelfHostedDoNotAutoDecline(settings.selfHostedKycDoNotAutoDeclineEnabled);
    setManualPhoneVerificationEnabled(settings.manualPhoneVerificationEnabled);
    setManualPhoneVerificationFeeTokens(settings.manualPhoneVerificationFeeTokens);
    setManualPhoneVerificationWhatsappNumber(settings.manualPhoneVerificationWhatsappNumber);
    setManualPhoneVerificationExpiryMinutes(String(settings.manualPhoneVerificationExpiryMinutes));
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const expiryMinutes = Number(manualPhoneVerificationExpiryMinutes);
    if (!Number.isInteger(expiryMinutes) || expiryMinutes < 1 || expiryMinutes > 1440) {
      setError('Manual WhatsApp code expiry must be a whole number between 1 and 1,440 minutes.');
      return;
    }
    const staleMinutes = Number(autoCancelStaleMinutes);
    if (!Number.isInteger(staleMinutes) || staleMinutes < 5 || staleMinutes > 10080) {
      setError('Auto-cancel timeout must be a whole number between 5 and 10,080 minutes (7 days).');
      return;
    }
    const minFaceMatchScore = Number(selfHostedMinFaceMatchScore);
    if (!Number.isInteger(minFaceMatchScore) || minFaceMatchScore < 0 || minFaceMatchScore > 100) {
      setError('DLKYC auto-approve face match threshold must be a whole number between 0 and 100.');
      return;
    }
    const minLivenessScore = Number(selfHostedMinLivenessScore);
    if (!Number.isInteger(minLivenessScore) || minLivenessScore < 0 || minLivenessScore > 100) {
      setError('DLKYC auto-approve liveness threshold must be a whole number between 0 and 100.');
      return;
    }
    const maxFaceMatchScoreForDecline = Number(selfHostedMaxFaceMatchScoreForDecline);
    if (
      !Number.isInteger(maxFaceMatchScoreForDecline) ||
      maxFaceMatchScoreForDecline < 0 ||
      maxFaceMatchScoreForDecline > 100
    ) {
      setError('DLKYC decline ceiling: face match must be a whole number between 0 and 100.');
      return;
    }
    if (maxFaceMatchScoreForDecline > minFaceMatchScore) {
      setError(
        'DLKYC decline ceiling: face match must be less than or equal to the auto-approve floor.',
      );
      return;
    }
    const maxLivenessScoreForDecline = Number(selfHostedMaxLivenessScoreForDecline);
    if (
      !Number.isInteger(maxLivenessScoreForDecline) ||
      maxLivenessScoreForDecline < 0 ||
      maxLivenessScoreForDecline > 100
    ) {
      setError('DLKYC decline ceiling: liveness must be a whole number between 0 and 100.');
      return;
    }
    if (maxLivenessScoreForDecline > minLivenessScore) {
      setError(
        'DLKYC decline ceiling: liveness must be less than or equal to the auto-approve floor.',
      );
      return;
    }
    try {
      await updateSettings({
        isKycRequiredForWithdrawals: requiredForWithdrawals,
        kycMinWithdrawalTokens: Number(minWithdrawalTokens) || 0,
        isKycRequiredOnboarding: requiredOnboarding,
        kycAutoCancelStaleEnabled: autoCancelStaleEnabled,
        kycAutoCancelStaleMinutes: staleMinutes,
        selfHostedKycEnabled: selfHostedEnabled,
        activeKycProvider,
        selfHostedKycAutoApproveEnabled: selfHostedAutoApprove,
        selfHostedKycBotEnabled: selfHostedBotEnabled,
        selfHostedKycDocumentTypes: selfHostedDocumentTypes,
        selfHostedKycMinFaceMatchScore: minFaceMatchScore,
        selfHostedKycMinLivenessScore: minLivenessScore,
        selfHostedKycMaxFaceMatchScoreForDecline: maxFaceMatchScoreForDecline,
        selfHostedKycMaxLivenessScoreForDecline: maxLivenessScoreForDecline,
        selfHostedKycRequireDocumentFaceDetected: selfHostedRequireDocumentFaceDetected,
        selfHostedKycDoNotAutoDeclineEnabled: selfHostedDoNotAutoDecline,
        manualPhoneVerificationEnabled,
        manualPhoneVerificationFeeTokens: Number(manualPhoneVerificationFeeTokens) || 0,
        manualPhoneVerificationWhatsappNumber,
        manualPhoneVerificationExpiryMinutes: expiryMinutes,
      }).unwrap();
      setMessage('Identity verification settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save identity verification settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Identity Verification</h2>
        <p className="leading-relaxed text-muted">
          Controls for KYC verification -- ID scan, selfie, and face-match. Two providers are
          available: Didit (hosted) and DLKYC (our own self-hosted app at kyc.dialectlibrary.com).
          Only one is active at a time, set below. When required, a trainer must reach APPROVED
          status before a withdrawal at or above the threshold below is allowed.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="kyc-required-onboarding"
            >
              <input
                checked={requiredOnboarding}
                className="mt-0.5 size-5 accent-accent"
                id="kyc-required-onboarding"
                onChange={(event) => setRequiredOnboarding(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Prompt during onboarding</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  A trainer is prompted to verify right after completing onboarding, with a "Do this
                  later" option. Skipping has no effect beyond the withdrawal rule below -- there is
                  no separate onboarding-only lock.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="kyc-required-for-withdrawals"
            >
              <input
                checked={requiredForWithdrawals}
                className="mt-0.5 size-5 accent-accent"
                id="kyc-required-for-withdrawals"
                onChange={(event) => setRequiredForWithdrawals(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Required for withdrawals</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off, withdrawals are unaffected -- keep this off until Didit credentials are
                  configured and tested.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="kyc-min-withdrawal-tokens">
              Minimum withdrawal tokens requiring verification
            </label>
            <input
              className={inputClass}
              id="kyc-min-withdrawal-tokens"
              inputMode="decimal"
              onChange={(e) => setMinWithdrawalTokens(e.target.value)}
              placeholder="0"
              value={minWithdrawalTokens}
            />
            <p className="text-sm leading-relaxed text-muted">
              Withdrawals below this amount skip the KYC gate even when required above is on. Set to
              0 to require verification for every withdrawal.
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="kyc-auto-cancel-stale"
            >
              <input
                checked={autoCancelStaleEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="kyc-auto-cancel-stale"
                onChange={(event) => setAutoCancelStaleEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Auto-cancel stale verifications</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  A verification left in Not Started, In Progress, or In Review for longer than the
                  timeout below is marked Abandoned, freeing the trainer to start a fresh Didit
                  session. Runs automatically every 10 minutes. Approved/Declined/Expired
                  verifications are never touched.
                </span>
              </span>
            </label>

            <label
              className="grid max-w-xs gap-1 text-sm font-bold"
              htmlFor="kyc-auto-cancel-minutes"
            >
              Timeout (minutes)
              <input
                className={inputClass}
                id="kyc-auto-cancel-minutes"
                inputMode="numeric"
                max="10080"
                min="5"
                onChange={(event) => setAutoCancelStaleMinutes(event.target.value)}
                type="number"
                value={autoCancelStaleMinutes}
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="dlkyc-self-hosted-enabled"
            >
              <input
                checked={selfHostedEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="dlkyc-self-hosted-enabled"
                onChange={(event) => setSelfHostedEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">
                  Enable DLKYC (self-hosted, kyc.dialectlibrary.com)
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Our own identity-verification app, alongside Didit -- not a replacement. When off,
                  the active provider below is forced back to Didit regardless of its stored value.
                </span>
              </span>
            </label>

            <label
              className="grid max-w-xs gap-1 text-sm font-bold"
              htmlFor="dlkyc-active-provider"
            >
              Active provider
              <select
                className={inputClass}
                disabled={!selfHostedEnabled}
                id="dlkyc-active-provider"
                onChange={(event) =>
                  setActiveKycProvider(event.target.value === 'self' ? 'self' : 'didit')
                }
                value={activeKycProvider}
              >
                <option value="didit">Didit</option>
                <option value="self">DLKYC (self-hosted)</option>
              </select>
              <span className="font-normal text-muted">
                Every trainer&apos;s &quot;Verify identity&quot; goes to whichever provider is
                active here -- no per-trainer split.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3" htmlFor="dlkyc-auto-approve">
              <input
                checked={selfHostedAutoApprove}
                className="mt-0.5 size-5 accent-accent"
                id="dlkyc-auto-approve"
                onChange={(event) => setSelfHostedAutoApprove(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Allow DLKYC to auto-approve clear passes</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Off by default -- every DLKYC session lands in the review queue regardless of
                  score until thresholds are calibrated. Even when on, a clear fail always
                  auto-declines and an uncertain result always goes to review; this only affects
                  whether a clear pass can skip the queue.
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold" htmlFor="dlkyc-min-face-match">
                Auto-approve floor: face match (%)
                <input
                  className={inputClass}
                  id="dlkyc-min-face-match"
                  inputMode="numeric"
                  max="100"
                  min="0"
                  onChange={(event) => setSelfHostedMinFaceMatchScore(event.target.value)}
                  type="number"
                  value={selfHostedMinFaceMatchScore}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="dlkyc-min-liveness">
                Auto-approve floor: liveness (%)
                <input
                  className={inputClass}
                  id="dlkyc-min-liveness"
                  inputMode="numeric"
                  max="100"
                  min="0"
                  onChange={(event) => setSelfHostedMinLivenessScore(event.target.value)}
                  type="number"
                  value={selfHostedMinLivenessScore}
                />
              </label>
              <p className="text-sm leading-relaxed text-muted sm:col-span-2">
                A submission must meet or exceed both floors (and raise no bot flags) to
                auto-approve when the toggle above is on. Anything below either floor -- but not bad
                enough to auto-decline outright -- lands in manual review instead. Defaults: 85%
                face match, 80% liveness.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className="grid gap-1 text-sm font-bold"
                htmlFor="dlkyc-max-face-match-decline"
              >
                Decline ceiling: face match (%)
                <input
                  className={inputClass}
                  id="dlkyc-max-face-match-decline"
                  inputMode="numeric"
                  max="100"
                  min="0"
                  onChange={(event) => setSelfHostedMaxFaceMatchScoreForDecline(event.target.value)}
                  type="number"
                  value={selfHostedMaxFaceMatchScoreForDecline}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="dlkyc-max-liveness-decline">
                Decline ceiling: liveness (%)
                <input
                  className={inputClass}
                  id="dlkyc-max-liveness-decline"
                  inputMode="numeric"
                  max="100"
                  min="0"
                  onChange={(event) => setSelfHostedMaxLivenessScoreForDecline(event.target.value)}
                  type="number"
                  value={selfHostedMaxLivenessScoreForDecline}
                />
              </label>
              <p className="text-sm leading-relaxed text-muted sm:col-span-2">
                Strictly below either ceiling, a submission auto-declines outright (or goes to
                review instead, when &quot;Do not auto-decline&quot; below is on) rather than being
                compared against the auto-approve floors above. Must be less than or equal to the
                matching floor above. Defaults: 40% face match, 40% liveness.
              </p>
            </div>

            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="dlkyc-require-document-face"
            >
              <input
                checked={selfHostedRequireDocumentFaceDetected}
                className="mt-0.5 size-5 accent-accent"
                id="dlkyc-require-document-face"
                onChange={(event) => setSelfHostedRequireDocumentFaceDetected(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">
                  Require a face on the ID (&quot;ID found&quot;)
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  On by default -- if no face can be detected on the submitted document photo at
                  all, the submission fails outright (auto-decline, or review when &quot;Do not
                  auto-decline&quot; below is on). Turn off to instead fall through to the normal
                  face-match scoring (a missing document face scores 0% and is judged by the
                  ceiling/floor above like any other face-match result).
                </span>
              </span>
            </label>

            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="dlkyc-do-not-auto-decline"
            >
              <input
                checked={selfHostedDoNotAutoDecline}
                className="mt-0.5 size-5 accent-accent"
                id="dlkyc-do-not-auto-decline"
                onChange={(event) => setSelfHostedDoNotAutoDecline(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">
                  Do not auto-decline -- send failures to review
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Off by default -- a decisively bad face match or liveness score auto-declines the
                  trainer outright. When on, those same failing submissions land in the review queue
                  instead, so an admin can manually check a poor-quality photo before rejecting it.
                  Auto-approval of clear passes above is unaffected either way.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3" htmlFor="dlkyc-bot-enabled">
              <input
                checked={selfHostedBotEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="dlkyc-bot-enabled"
                onChange={(event) => setSelfHostedBotEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable AI-assisted review (bot)</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  An LLM reviews each submission for inconsistencies and surfaces flags to the
                  reviewer -- it never approves or declines on its own. A flag always forces manual
                  review, even if auto-approve is on.
                </span>
              </span>
            </label>

            <label className="grid gap-1 text-sm font-bold" htmlFor="dlkyc-document-types">
              Accepted document types (comma-separated)
              <input
                className={inputClass}
                id="dlkyc-document-types"
                onChange={(event) => setSelfHostedDocumentTypes(event.target.value)}
                placeholder="passport,national_id,drivers_license"
                value={selfHostedDocumentTypes}
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="manual-phone-verification"
            >
              <input
                checked={manualPhoneVerificationEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="manual-phone-verification"
                onChange={(event) => setManualPhoneVerificationEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Allow manual WhatsApp phone verification</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Trainers receive a code to send to your WhatsApp number when SMS delivery fails.
                  The code is only valid for the duration set below, and the DL fee is charged only
                  after an admin verifies it.
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold" htmlFor="manual-phone-whatsapp">
                WhatsApp number
                <input
                  className={inputClass}
                  id="manual-phone-whatsapp"
                  maxLength={40}
                  onChange={(event) => setManualPhoneVerificationWhatsappNumber(event.target.value)}
                  placeholder="1234567890"
                  value={manualPhoneVerificationWhatsappNumber}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="manual-phone-fee">
                Manual verification fee (DL)
                <input
                  className={inputClass}
                  id="manual-phone-fee"
                  min="0"
                  onChange={(event) => setManualPhoneVerificationFeeTokens(event.target.value)}
                  step="0.01"
                  type="number"
                  value={manualPhoneVerificationFeeTokens}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="manual-phone-expiry">
                Code expiry (minutes)
                <input
                  className={inputClass}
                  id="manual-phone-expiry"
                  inputMode="numeric"
                  max="1440"
                  min="1"
                  onChange={(event) => setManualPhoneVerificationExpiryMinutes(event.target.value)}
                  type="number"
                  value={manualPhoneVerificationExpiryMinutes}
                />
              </label>
            </div>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save identity verification settings
            </ActionButton>
          </div>
          <KycRecheckPanel />
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

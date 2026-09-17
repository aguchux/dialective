'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

type ProviderKey = 'openai' | 'deepseek' | 'anthropic';

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
};

const DEFAULT_ORDER: ProviderKey[] = ['openai', 'deepseek', 'anthropic'];

function parseOrder(csv: string): ProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as ProviderKey[];
  const isValid =
    parts.length === 3 &&
    DEFAULT_ORDER.every((key) => parts.includes(key)) &&
    new Set(parts).size === 3;
  return isValid ? parts : DEFAULT_ORDER;
}

/**
 * "Domain Conversation" trainer task -- a trainer records one continuous
 * clip responding to a pregenerated scenario prompt, gated by the min/max
 * duration below. Own tab (not folded into Training Tasks) since this is a
 * comparably-sized knob set of its own plus a separate prompt-pool
 * management concern, mirroring why Stream Settings has its own tab.
 */
export function DomainConversationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [taskEnabled, setTaskEnabled] = useState(false);
  const [minDurationSeconds, setMinDurationSeconds] = useState('15');
  const [maxDurationSeconds, setMaxDurationSeconds] = useState('60');
  const [taskTokenCost, setTaskTokenCost] = useState('3');
  const [generationEnabled, setGenerationEnabled] = useState(false);
  const [promptsPerRun, setPromptsPerRun] = useState('15');
  const [maxPromptPoolSize, setMaxPromptPoolSize] = useState('500');
  const [order, setOrder] = useState<ProviderKey[]>(DEFAULT_ORDER);
  const [weightNoise, setWeightNoise] = useState('40');
  const [weightQuality, setWeightQuality] = useState('30');
  const [weightLiveness, setWeightLiveness] = useState('30');
  const [minQualityScoreForPayout, setMinQualityScoreForPayout] = useState('50');
  const [maxCyclesPerTrainer, setMaxCyclesPerTrainer] = useState('2');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setTaskEnabled(settings.domainConversationTaskEnabled);
    setMinDurationSeconds(String(settings.domainConversationMinDurationSeconds));
    setMaxDurationSeconds(String(settings.domainConversationMaxDurationSeconds));
    setTaskTokenCost(settings.domainConversationTaskTokenCost ?? '3');
    setGenerationEnabled(settings.domainConversationGenerationEnabled);
    setPromptsPerRun(String(settings.domainConversationPromptsPerRun));
    setMaxPromptPoolSize(String(settings.domainConversationMaxPromptPoolSize));
    setOrder(parseOrder(settings.domainConversationProviderOrder));
    setWeightNoise(settings.domainConversationQualityWeightNoise);
    setWeightQuality(settings.domainConversationQualityWeightQuality);
    setWeightLiveness(settings.domainConversationQualityWeightLiveness);
    setMinQualityScoreForPayout(settings.domainConversationMinQualityScoreForPayout);
    setMaxCyclesPerTrainer(String(settings.domainConversationMaxCyclesPerTrainer));
  }, [settings]);

  function setChoice(position: 0 | 1 | 2, provider: ProviderKey) {
    setOrder((current) => {
      const next = [...current] as ProviderKey[];
      next[position] = provider;
      return next;
    });
  }

  const weightSum =
    (Number(weightNoise) || 0) + (Number(weightQuality) || 0) + (Number(weightLiveness) || 0);
  const weightSumValid = Math.abs(weightSum - 100) < 0.01;
  const durationRangeValid =
    Number(minDurationSeconds) > 0 &&
    Number(maxDurationSeconds) > 0 &&
    Number(minDurationSeconds) < Number(maxDurationSeconds);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!durationRangeValid) {
      setError('Minimum duration must be less than maximum duration.');
      return;
    }
    if (!weightSumValid) {
      setError(`Quality weights must sum to 100% (currently ${weightSum}%).`);
      return;
    }
    if (new Set(order).size !== 3) {
      setError('Each provider choice (1st, 2nd, 3rd) must be distinct.');
      return;
    }

    try {
      await updateSettings({
        domainConversationTaskEnabled: taskEnabled,
        domainConversationMinDurationSeconds: Number(minDurationSeconds),
        domainConversationMaxDurationSeconds: Number(maxDurationSeconds),
        domainConversationTaskTokenCost: Number(taskTokenCost),
        domainConversationGenerationEnabled: generationEnabled,
        domainConversationPromptsPerRun: Number(promptsPerRun),
        domainConversationMaxPromptPoolSize: Number(maxPromptPoolSize),
        domainConversationProviderOrder: order.join(','),
        domainConversationQualityWeightNoise: Number(weightNoise),
        domainConversationQualityWeightQuality: Number(weightQuality),
        domainConversationQualityWeightLiveness: Number(weightLiveness),
        domainConversationMinQualityScoreForPayout: Number(minQualityScoreForPayout),
        domainConversationMaxCyclesPerTrainer: Number(maxCyclesPerTrainer),
      }).unwrap();
      setMessage('Domain Conversation settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Domain Conversation settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Domain Conversation</h2>
        <p className="leading-relaxed text-muted">
          A trainer records one continuous clip responding to a pregenerated scenario prompt (e.g.
          &quot;As a market woman, buying rice&quot;). Prompts are bulk-generated ahead of time and
          pooled -- manage them on the{' '}
          <a className="font-bold text-accent hover:text-accent-dark" href="/admin/domain-prompts">
            Domain Prompts
          </a>{' '}
          page.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="domain-conversation-task-enabled"
            >
              <input
                checked={taskEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="domain-conversation-task-enabled"
                onChange={(event) => setTaskEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Show the task to trainers</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Whether the &quot;Domain Conversation&quot; card appears in the trainer dashboard
                  at all. Independent of prompt generation below -- the pool can build up before you
                  expose the task.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Recording duration</span>
            <p className="text-sm leading-relaxed text-muted">
              Submit stays disabled until the minimum elapses; recording auto-stops at the maximum.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="domain-conversation-min-duration">
                  Minimum (seconds)
                </label>
                <input
                  className={inputClass}
                  id="domain-conversation-min-duration"
                  min="1"
                  onChange={(e) => setMinDurationSeconds(e.target.value)}
                  step="1"
                  type="number"
                  value={minDurationSeconds}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="domain-conversation-max-duration">
                  Maximum (seconds)
                </label>
                <input
                  className={inputClass}
                  id="domain-conversation-max-duration"
                  min="1"
                  onChange={(e) => setMaxDurationSeconds(e.target.value)}
                  step="1"
                  type="number"
                  value={maxDurationSeconds}
                />
              </div>
            </div>
            {!durationRangeValid && (
              <p className="text-sm font-bold text-danger">Minimum must be less than maximum.</p>
            )}
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="domain-conversation-max-cycles">
              Max pool cycles per trainer
            </label>
            <p className="text-sm leading-relaxed text-muted">
              How many times a trainer may cycle through the current prompt pool before they're
              blocked until new scenarios are added. Set to 0 to disable the cap.
            </p>
            <input
              className={`${inputClass} max-w-40`}
              id="domain-conversation-max-cycles"
              min="0"
              onChange={(e) => setMaxCyclesPerTrainer(e.target.value)}
              step="1"
              type="number"
              value={maxCyclesPerTrainer}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="domain-conversation-token-cost">
              Token cost per submission
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Tokens debited per Domain Conversation submission -- separate from word training's
              task cost, since a conversation is materially more effort than one word.
            </p>
            <input
              className={`${inputClass} max-w-40`}
              id="domain-conversation-token-cost"
              min="0"
              onChange={(e) => setTaskTokenCost(e.target.value)}
              step="0.1"
              type="number"
              value={taskTokenCost}
            />
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="domain-conversation-generation-enabled"
            >
              <input
                checked={generationEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="domain-conversation-generation-enabled"
                onChange={(event) => setGenerationEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable prompt generation</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master switch for the scheduled prompt-generation job. Prompts are
                  dialect-agnostic -- one shared pool serves every trainer regardless of dialect.
                </span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-bold" htmlFor="domain-conversation-prompts-per-run">
                Scenarios per run
              </label>
              <input
                className={inputClass}
                id="domain-conversation-prompts-per-run"
                min="1"
                onChange={(e) => setPromptsPerRun(e.target.value)}
                step="1"
                type="number"
                value={promptsPerRun}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-bold" htmlFor="domain-conversation-max-pool-size">
                Max pool size (rows)
              </label>
              <input
                className={inputClass}
                id="domain-conversation-max-pool-size"
                min="1"
                onChange={(e) => setMaxPromptPoolSize(e.target.value)}
                step="1"
                type="number"
                value={maxPromptPoolSize}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Provider order (fallback chain)</span>
            <p className="text-sm leading-relaxed text-muted">
              1st choice is tried first; 2nd and 3rd are only used if the ones before them fail.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['1st choice', '2nd choice', '3rd choice'] as const).map((label, index) => (
                <div className="grid gap-1" key={label}>
                  <label
                    className="text-sm font-bold"
                    htmlFor={`domain-conversation-order-${index}`}
                  >
                    {label}
                  </label>
                  <select
                    className={inputClass}
                    id={`domain-conversation-order-${index}`}
                    onChange={(e) => setChoice(index as 0 | 1 | 2, e.target.value as ProviderKey)}
                    value={order[index]}
                  >
                    {DEFAULT_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {PROVIDER_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Quality score weights</span>
            <p className="text-sm leading-relaxed text-muted">
              How much each quality-gate signal counts toward this task's composite score. Must sum
              to 100% -- there's no consensus/exact-match component for a free-form conversation,
              unlike word training's four-way blend.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="domain-conversation-weight-noise">
                  Background noise
                </label>
                <input
                  className={inputClass}
                  id="domain-conversation-weight-noise"
                  max="100"
                  min="0"
                  onChange={(e) => setWeightNoise(e.target.value)}
                  step="1"
                  type="number"
                  value={weightNoise}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="domain-conversation-weight-quality">
                  Audio quality
                </label>
                <input
                  className={inputClass}
                  id="domain-conversation-weight-quality"
                  max="100"
                  min="0"
                  onChange={(e) => setWeightQuality(e.target.value)}
                  step="1"
                  type="number"
                  value={weightQuality}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="domain-conversation-weight-liveness">
                  Voice liveness
                </label>
                <input
                  className={inputClass}
                  id="domain-conversation-weight-liveness"
                  max="100"
                  min="0"
                  onChange={(e) => setWeightLiveness(e.target.value)}
                  step="1"
                  type="number"
                  value={weightLiveness}
                />
              </div>
            </div>
            <p
              className={`text-sm font-bold ${weightSumValid ? 'text-accent-dark' : 'text-danger'}`}
            >
              Sums to: {weightSum}% {weightSumValid ? '' : '(must equal 100%)'}
            </p>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="domain-conversation-min-quality-score">
              Minimum quality score for payout
            </label>
            <p className="text-sm leading-relaxed text-muted">
              A SCORED recording below this composite-score floor is refunded instead of paid out
              (flat token cost, since there's no exact-match ground truth to scale a bonus off).
            </p>
            <input
              className={`${inputClass} max-w-40`}
              id="domain-conversation-min-quality-score"
              max="100"
              min="0"
              onChange={(e) => setMinQualityScoreForPayout(e.target.value)}
              step="1"
              type="number"
              value={minQualityScoreForPayout}
            />
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              disabled={!weightSumValid || !durationRangeValid}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save Domain Conversation settings
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

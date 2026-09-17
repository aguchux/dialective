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

export function WordGenerationSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [order, setOrder] = useState<ProviderKey[]>(DEFAULT_ORDER);
  const [wordGenerationEnabled, setWordGenerationEnabled] = useState(true);
  const [sentenceGenerationEnabled, setSentenceGenerationEnabled] = useState(true);
  const [sentenceWordCount, setSentenceWordCount] = useState('6');
  const [itemsPerRun, setItemsPerRun] = useState('15');
  const [maxTotalGeneratedItems, setMaxTotalGeneratedItems] = useState('5000');
  const [maxSentenceGeneratedItems, setMaxSentenceGeneratedItems] = useState('5000');
  const [maxPoolPerDialect, setMaxPoolPerDialect] = useState('50');
  const [backfillItemsPerDialectPerRun, setBackfillItemsPerDialectPerRun] = useState('10');
  const [keyboardLayoutMaxLength, setKeyboardLayoutMaxLength] = useState('1000');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.llmGenerationEnabled);
    setOrder(parseOrder(settings.llmProviderOrder));
    setWordGenerationEnabled(settings.wordGenerationEnabled ?? true);
    setSentenceGenerationEnabled(settings.sentenceGenerationEnabled ?? true);
    setSentenceWordCount(String(settings.sentenceWordCount ?? 6));
    setItemsPerRun(String(settings.llmItemsPerRun));
    setMaxTotalGeneratedItems(String(settings.llmMaxTotalGeneratedItems));
    setMaxSentenceGeneratedItems(String(settings.llmMaxSentenceGeneratedItems ?? 5000));
    setMaxPoolPerDialect(String(settings.llmMaxPoolPerDialect));
    setBackfillItemsPerDialectPerRun(String(settings.llmBackfillItemsPerDialectPerRun));
    setKeyboardLayoutMaxLength(String(settings.keyboardLayoutMaxLength));
  }, [settings]);

  function setChoice(position: 0 | 1 | 2, provider: ProviderKey) {
    setOrder((current) => {
      const next = [...current] as ProviderKey[];
      next[position] = provider;
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (new Set(order).size !== 3) {
      setError('Each provider choice (1st, 2nd, 3rd) must be distinct.');
      return;
    }

    try {
      await updateSettings({
        llmGenerationEnabled: enabled,
        wordGenerationEnabled,
        sentenceGenerationEnabled,
        llmProviderOrder: order.join(','),
        ...(sentenceWordCount !== '' ? { sentenceWordCount: Number(sentenceWordCount) } : {}),
        ...(itemsPerRun !== '' ? { llmItemsPerRun: Number(itemsPerRun) } : {}),
        ...(maxTotalGeneratedItems !== ''
          ? { llmMaxTotalGeneratedItems: Number(maxTotalGeneratedItems) }
          : {}),
        ...(maxSentenceGeneratedItems !== ''
          ? { llmMaxSentenceGeneratedItems: Number(maxSentenceGeneratedItems) }
          : {}),
        ...(maxPoolPerDialect !== '' ? { llmMaxPoolPerDialect: Number(maxPoolPerDialect) } : {}),
        ...(backfillItemsPerDialectPerRun !== ''
          ? { llmBackfillItemsPerDialectPerRun: Number(backfillItemsPerDialectPerRun) }
          : {}),
        ...(keyboardLayoutMaxLength !== ''
          ? { keyboardLayoutMaxLength: Number(keyboardLayoutMaxLength) }
          : {}),
      }).unwrap();
      setMessage('Word generation settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save word generation settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Word &amp; Sentence Generation</h2>
        <p className="leading-relaxed text-muted">
          Scheduled job that grows the word/prompt bank via an LLM instead of manual seeding.
          Providers are tried in order below -- the first that succeeds is used, the others are only
          called if it fails.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="llm-generation-enabled"
            >
              <input
                checked={enabled}
                className="mt-0.5 size-5 accent-accent"
                id="llm-generation-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable word and sentence generations</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master switch for the scheduled generation job. Turn this on together with the
                  word and/or sentence switches below.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Provider order (fallback chain)</span>
            <p className="text-sm leading-relaxed text-muted">
              1st choice is tried first; 2nd and 3rd are only used if the ones before them fail. All
              three must be distinct.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['1st choice', '2nd choice', '3rd choice'] as const).map((label, index) => (
                <div className="grid gap-1" key={label}>
                  <label className="text-sm font-bold" htmlFor={`llm-order-${index}`}>
                    {label}
                  </label>
                  <select
                    className={inputClass}
                    id={`llm-order-${index}`}
                    value={order[index]}
                    onChange={(e) => setChoice(index as 0 | 1 | 2, e.target.value as ProviderKey)}
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

          <div className="grid gap-3">
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="word-generation-enabled"
            >
              <input
                checked={wordGenerationEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="word-generation-enabled"
                onChange={(event) => setWordGenerationEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable word generation</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Generate short, everyday English words for the Word bank.
                </span>
              </span>
            </label>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="sentence-generation-enabled"
            >
              <input
                checked={sentenceGenerationEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="sentence-generation-enabled"
                onChange={(event) => setSentenceGenerationEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable sentence generation</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Generate simple, everyday conversational English statements. Sentences are created
                  independently and never composed from existing Word rows.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="sentence-word-count">
              Words per sentence
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Target length for each generated sentence. Keep it short enough to translate and
              record naturally.
            </p>
            <input
              className={inputClass}
              id="sentence-word-count"
              type="number"
              step="1"
              min="2"
              max="20"
              value={sentenceWordCount}
              onChange={(e) => setSentenceWordCount(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="llm-items-per-run">
              Items per run
            </label>
            <p className="text-sm leading-relaxed text-muted">
              How many new items to request from the LLM each scheduled run.
            </p>
            <input
              className={inputClass}
              id="llm-items-per-run"
              type="number"
              step="1"
              min="1"
              max="100"
              value={itemsPerRun}
              onChange={(e) => setItemsPerRun(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="llm-max-total-generated-items">
              Max generated words
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Ceiling for generated Word rows. When reached, word generation stops creating
              brand-new words until you raise this limit -- independent of the sentence ceiling
              below, so one running out never blocks the other.
            </p>
            <input
              className={inputClass}
              id="llm-max-total-generated-items"
              type="number"
              step="1"
              min="1"
              max="1000000"
              value={maxTotalGeneratedItems}
              onChange={(e) => setMaxTotalGeneratedItems(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="llm-max-sentence-generated-items">
              Max generated sentences
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Ceiling for generated Sentence rows. When reached, sentence generation stops creating
              brand-new sentences until you raise this limit.
            </p>
            <input
              className={inputClass}
              id="llm-max-sentence-generated-items"
              type="number"
              step="1"
              min="1"
              max="1000000"
              value={maxSentenceGeneratedItems}
              onChange={(e) => setMaxSentenceGeneratedItems(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="llm-max-pool-per-dialect">
              Max content pool per dialect
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Once a dialect's combined prompt + word bank reaches this size, generation stops
              adding new translations for it until you raise this limit. Scoring needs multiple
              trainers submitting the same prompt/word -- growing the pool faster than a dialect's
              trainer base can spread everyone too thin to ever reach quorum. Increase this
              gradually as each dialect's active trainer count grows.
            </p>
            <input
              className={inputClass}
              id="llm-max-pool-per-dialect"
              type="number"
              step="1"
              min="1"
              max="5000"
              value={maxPoolPerDialect}
              onChange={(e) => setMaxPoolPerDialect(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="llm-backfill-items-per-dialect-per-run">
              Catch-up items per dialect per run
            </label>
            <p className="text-sm leading-relaxed text-muted">
              A newly-enabled dialect starts with zero content and would otherwise only grow from
              the shared trickle of brand-new words each run, staying permanently behind dialects
              enabled earlier. Each run, every dialect still under its pool cap gets up to this many
              pre-existing English words/prompts translated for it first (oldest backlog first),
              before any brand-new content is generated.
            </p>
            <input
              className={inputClass}
              id="llm-backfill-items-per-dialect-per-run"
              type="number"
              step="1"
              min="1"
              max="500"
              value={backfillItemsPerDialectPerRun}
              onChange={(e) => setBackfillItemsPerDialectPerRun(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="keyboard-layout-max-length">
              Keyboard layout maximum characters
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Maximum length for a dialect&apos;s virtual keyboard character list in Coverage.
            </p>
            <input
              className={inputClass}
              id="keyboard-layout-max-length"
              type="number"
              step="1"
              min="1"
              max="10000"
              value={keyboardLayoutMaxLength}
              onChange={(e) => setKeyboardLayoutMaxLength(e.target.value)}
            />
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save word generation settings
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

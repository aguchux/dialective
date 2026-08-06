'use client';

import { useRef, useState } from 'react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { Button } from '@/components/Button';
import { PageShell, Section } from '@/components/PageShell';

const DIALECT_OPTIONS = [
  { value: 'en-us', label: 'English (US)' },
  { value: 'ig', label: 'Igbo' },
  { value: 'yo', label: 'Yoruba' },
  { value: 'ha', label: 'Hausa' },
];

interface Word {
  wordId: string;
  text: string;
}

type Stage = 'idle' | 'recording' | 'uploading' | 'done' | 'error';

const selectClass = 'min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';
const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';

export default function WordLibraryFlow() {
  const [dialectTag, setDialectTag] = useState(DIALECT_OPTIONS[1].value);
  const [word, setWord] = useState<Word | null>(null);
  const [translation, setTranslation] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function loadWord() {
    setError(null);
    setAudioUrl(null);
    setTranslation('');
    setStage('idle');
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/words/random`);
    if (!res.ok) {
      setError('Failed to load a word.');
      return;
    }
    setWord(await res.json());
  }

  async function startRecording() {
    setError(null);
    setAudioUrl(null);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setAudioUrl(URL.createObjectURL(blob));
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setStage('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setStage('idle');
  }

  async function submitRecording() {
    if (!word) return;
    if (!translation.trim()) {
      setError('Type the translation before submitting.');
      return;
    }
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (blob.size === 0) {
      setError('Nothing recorded yet.');
      return;
    }

    setStage('uploading');
    setError(null);

    try {
      const uploadUrlRes = await fetch(`${PUBLIC_API_V1_BASE_URL}/words/recordings/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordId: word.wordId,
          dialectTag,
          contentType: 'audio/webm',
        }),
      });
      if (!uploadUrlRes.ok) throw new Error('Failed to get an upload URL.');
      const { uploadUrl, key, bucket } = await uploadUrlRes.json();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/webm' },
        body: blob,
      });
      if (!putRes.ok) throw new Error('Failed to upload audio.');

      const createRes = await fetch(`${PUBLIC_API_V1_BASE_URL}/words/recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordId: word.wordId,
          dialectTag,
          translationText: translation.trim(),
          bucket,
          audioKey: key,
        }),
      });
      if (!createRes.ok) throw new Error('Failed to save the recording.');

      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('error');
    }
  }

  return (
    <PageShell>
      <Section>
        <h1 className="text-4xl leading-tight md:text-5xl">Word library</h1>
        <p className="text-lg leading-relaxed text-muted">
          No login required. Translate an English word into your dialect, then record yourself saying it.
        </p>
      </Section>

      {!word && (
        <Section>
          <label htmlFor="word-dialect-select">Language</label>
          <select
            className={selectClass}
            id="word-dialect-select"
            value={dialectTag}
            onChange={(e) => setDialectTag(e.target.value)}
          >
            {DIALECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div>
            <Button onClick={loadWord}>Get a word</Button>
          </div>
        </Section>
      )}

      {word && (
        <Section>
          <h2 className="text-2xl leading-snug">Translate this word</h2>
          <blockquote className="rounded-lg bg-surface-muted p-4 text-2xl">{word.text}</blockquote>

          <div className="grid gap-2.5">
            <label htmlFor="translation-input">Your translation</label>
            <input
              className={inputClass}
              id="translation-input"
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              disabled={stage === 'uploading' || stage === 'done'}
            />
          </div>

          {stage !== 'recording' && stage !== 'done' && (
            <div>
              <Button onClick={startRecording} disabled={stage === 'uploading'}>
                Start recording
              </Button>
            </div>
          )}
          {stage === 'recording' && (
            <div>
              <Button onClick={stopRecording}>Stop recording</Button>
            </div>
          )}

          {audioUrl && stage !== 'done' && (
            <Section>
              <audio controls src={audioUrl} />
              <div>
                <Button onClick={submitRecording} disabled={stage === 'uploading'}>
                  Submit
                </Button>
              </div>
            </Section>
          )}

          {stage === 'uploading' && <p>Saving...</p>}
          {stage === 'done' && <p>Saved. Thank you!</p>}

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <div>
            <Button variant="secondary" onClick={loadWord}>
              New word
            </Button>
          </div>
        </Section>
      )}
    </PageShell>
  );
}

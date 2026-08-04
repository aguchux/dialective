'use client';

import { useRef, useState } from 'react';

/**
 * No-auth word-library flow: fetch a random English word -> trainer types
 * the translation in their chosen dialect -> records themselves saying the
 * translation -> both are stored as a WordRecording row. Unlike the
 * sentence-prompt flow in page.tsx, this never touches the ASR pipeline
 * (asr-jobs-vosk/whisper) -- no transcript, no consensus scoring, just a
 * direct word/voice capture straight to Postgres. See AGENTS.md
 * "Word library".
 */

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.nmseprep.com'}/api/v1`;

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
    const res = await fetch(`${API_BASE_URL}/words/random`);
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
      // See page.tsx's identical comment -- stop() is async, blob must be
      // built here, not right after calling stop().
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
      const uploadUrlRes = await fetch(`${API_BASE_URL}/words/recordings/upload-url`, {
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

      const createRes = await fetch(`${API_BASE_URL}/words/recordings`, {
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
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Dialectiva — word library</h1>
      <p>No login required. Translate an English word into your dialect, then record yourself saying it.</p>

      {!word && (
        <div>
          <label htmlFor="word-dialect-select">Language</label>{' '}
          <select id="word-dialect-select" value={dialectTag} onChange={(e) => setDialectTag(e.target.value)}>
            {DIALECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div>
            <button onClick={loadWord}>Get a word</button>
          </div>
        </div>
      )}

      {word && (
        <section>
          <h2>Translate this word:</h2>
          <blockquote style={{ fontSize: '1.5rem' }}>{word.text}</blockquote>

          <div>
            <label htmlFor="translation-input">Your translation</label>
            <div>
              <input
                id="translation-input"
                type="text"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                disabled={stage === 'uploading' || stage === 'done'}
                style={{ fontSize: '1.1rem', padding: '0.25rem' }}
              />
            </div>
          </div>

          {stage !== 'recording' && stage !== 'done' && (
            <button onClick={startRecording} disabled={stage === 'uploading'}>
              Start recording
            </button>
          )}
          {stage === 'recording' && <button onClick={stopRecording}>Stop recording</button>}

          {audioUrl && stage !== 'done' && (
            <div>
              <audio controls src={audioUrl} />
              <div>
                <button onClick={submitRecording} disabled={stage === 'uploading'}>
                  Submit
                </button>
              </div>
            </div>
          )}

          {stage === 'uploading' && <p>Saving…</p>}
          {stage === 'done' && <p>Saved. Thank you!</p>}

          {error && <p role="alert">{error}</p>}

          <div>
            <button onClick={loadWord}>New word</button>
          </div>
        </section>
      )}
    </main>
  );
}

'use client';

import { useRef, useState } from 'react';
import WordLibraryFlow from './WordLibraryFlow';

/**
 * No-auth, end-to-end test harness for the ASR pipeline: fetch a text
 * prompt -> record audio -> upload to a presigned Spaces URL -> enqueue
 * asr-jobs -> poll for vosk-worker's transcript. Deliberately bypasses
 * NextAuth/api's auth entirely (AGENTS.md's real login pages are
 * /login, /register) -- this exists only to exercise the pipeline while
 * the Postgres submissions schema (Project Plan step 2) doesn't exist yet.
 */

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.nmseprep.com'}/api/v1`;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

// Must match models/asr-registry.yaml -- these are the only dialect_tags
// with both a prompt bank (api's PromptsController) and an ASR engine
// registered to transcribe them.
const DIALECT_OPTIONS = [
  { value: 'en-us', label: 'English (US)' },
  { value: 'ig', label: 'Igbo' },
  { value: 'yo', label: 'Yoruba' },
  { value: 'ha', label: 'Hausa' },
];

interface Prompt {
  promptId: string;
  dialectTag: string;
  text: string;
}

type Stage = 'idle' | 'recording' | 'uploading' | 'processing' | 'done' | 'error';

interface Result {
  status: string;
  transcript?: string;
  reason?: string;
  dialect_tag?: string;
}

type Mode = 'sentence' | 'word';

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('sentence');
  const [dialectTag, setDialectTag] = useState(DIALECT_OPTIONS[0].value);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function loadPrompt() {
    setError(null);
    setResult(null);
    setAudioUrl(null);
    setStage('idle');
    const res = await fetch(`${API_BASE_URL}/prompts/random?dialectTag=${dialectTag}`);
    if (!res.ok) {
      setError('Failed to load a prompt.');
      return;
    }
    setPrompt(await res.json());
  }

  async function startRecording() {
    setError(null);
    setResult(null);
    setAudioUrl(null);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      // MediaRecorder.stop() is async -- the final ondataavailable (which
      // flushes the last chunk) fires after stop() returns, so the blob must
      // be built here, not right after calling stop(), or it can be built
      // from an incomplete chunk list (empty/truncated blob, which the
      // browser then can't satisfy an audio-element byte-range request
      // against -- ERR_REQUEST_RANGE_NOT_SATISFIABLE).
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
    if (!prompt) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (blob.size === 0) {
      setError('Nothing recorded yet.');
      return;
    }

    setStage('uploading');
    setError(null);

    try {
      const uploadUrlRes = await fetch(`${API_BASE_URL}/submissions/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: prompt.promptId,
          dialectTag: prompt.dialectTag,
          contentType: 'audio/webm',
        }),
      });
      if (!uploadUrlRes.ok) throw new Error('Failed to get an upload URL.');
      const { submissionId, uploadUrl, key, bucket } = await uploadUrlRes.json();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/webm' },
        body: blob,
      });
      if (!putRes.ok) throw new Error('Failed to upload audio.');

      const createRes = await fetch(`${API_BASE_URL}/submissions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          promptId: prompt.promptId,
          dialectTag: prompt.dialectTag,
          bucket,
          audioKey: key,
        }),
      });
      if (!createRes.ok) throw new Error('Failed to queue the submission.');

      setStage('processing');
      await pollForResult(submissionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('error');
    }
  }

  async function pollForResult(submissionId: string) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const res = await fetch(`${API_BASE_URL}/submissions/${submissionId}/result`);
      if (res.ok) {
        setResult(await res.json());
        setStage('done');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setError('Timed out waiting for a transcript. The ASR worker may still be starting up (scale-to-zero).');
    setStage('error');
  }

  if (mode === 'word') {
    return (
      <>
        <div style={{ maxWidth: 640, margin: '2rem auto 0', fontFamily: 'sans-serif' }}>
          <button onClick={() => setMode('sentence')}>← Back to sentence pipeline test</button>
        </div>
        <WordLibraryFlow />
      </>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Dialectiva — pipeline test</h1>
      <p>No login required. This exercises the real upload → ASR worker → transcript pipeline.</p>
      <p>
        <button onClick={() => setMode('word')}>Switch to word library →</button>
      </p>

      {!prompt && (
        <div>
          <label htmlFor="dialect-select">Language</label>{' '}
          <select id="dialect-select" value={dialectTag} onChange={(e) => setDialectTag(e.target.value)}>
            {DIALECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div>
            <button onClick={loadPrompt}>Get a prompt</button>
          </div>
        </div>
      )}

      {prompt && (
        <section>
          <h2>Read this aloud:</h2>
          <blockquote style={{ fontSize: '1.25rem' }}>{prompt.text}</blockquote>

          {stage !== 'recording' && (
            <button onClick={startRecording} disabled={stage === 'uploading' || stage === 'processing'}>
              Start recording
            </button>
          )}
          {stage === 'recording' && <button onClick={stopRecording}>Stop recording</button>}

          {audioUrl && (
            <div>
              <audio controls src={audioUrl} />
              <div>
                <button onClick={submitRecording} disabled={stage === 'uploading' || stage === 'processing'}>
                  Submit
                </button>
              </div>
            </div>
          )}

          {stage === 'uploading' && <p>Uploading…</p>}
          {stage === 'processing' && <p>Transcribing… (waiting on vosk-worker)</p>}

          {result && (
            <section>
              <h3>Result</h3>
              <p>status: {result.status}</p>
              {result.status === 'ok' && result.transcript && <p>transcript: “{result.transcript}”</p>}
              {result.status === 'unsupported_dialect' && (
                <p role="alert">No ASR model is registered for this dialect yet.</p>
              )}
              {result.reason && <p>reason: {result.reason}</p>}
            </section>
          )}

          {error && <p role="alert">{error}</p>}

          <div>
            <button onClick={loadPrompt}>New prompt</button>
          </div>
        </section>
      )}
    </main>
  );
}

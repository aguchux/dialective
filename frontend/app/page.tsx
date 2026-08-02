'use client';

import { useRef, useState } from 'react';

/**
 * No-auth, end-to-end test harness for the ASR pipeline: fetch a text
 * prompt -> record audio -> upload to a presigned Spaces URL -> enqueue
 * asr-jobs -> poll for vosk-worker's transcript. Deliberately bypasses
 * NextAuth/api's auth entirely (AGENTS.md's real login pages are
 * /login, /register) -- this exists only to exercise the pipeline while
 * the Postgres submissions schema (Project Plan step 2) doesn't exist yet.
 */

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.nmseprep.com'}/api/v1`;
const DIALECT_TAG = 'en-us';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

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

export default function HomePage() {
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
    const res = await fetch(`${API_BASE_URL}/prompts/random?dialectTag=${DIALECT_TAG}`);
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
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setStage('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setStage('idle');
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    setAudioUrl(URL.createObjectURL(blob));
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

    setError('Timed out waiting for a transcript. vosk-worker may still be starting up (scale-to-zero).');
    setStage('error');
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Dialectiva — pipeline test</h1>
      <p>No login required. This exercises the real upload → asr-jobs → vosk-worker → transcript pipeline.</p>

      {!prompt && <button onClick={loadPrompt}>Get a prompt</button>}

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
              {result.transcript && <p>transcript: “{result.transcript}”</p>}
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

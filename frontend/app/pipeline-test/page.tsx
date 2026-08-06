'use client';

import { useRef, useState } from 'react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import WordLibraryFlow from '../WordLibraryFlow';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

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

export default function PipelineTestPage() {
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
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/prompts/random?dialectTag=${dialectTag}`);
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
      const uploadUrlRes = await fetch(`${PUBLIC_API_V1_BASE_URL}/submissions/upload-url`, {
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

      const createRes = await fetch(`${PUBLIC_API_V1_BASE_URL}/submissions/create`, {
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
      const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/submissions/${submissionId}/result`);
      if (res.ok) {
        setResult(await res.json());
        setStage('done');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setError('Timed out waiting for a transcript. The ASR worker may still be starting up.');
    setStage('error');
  }

  if (mode === 'word') {
    return (
      <>
        <div className="page-shell">
          <button className="secondary" onClick={() => setMode('sentence')}>
            Back to sentence pipeline test
          </button>
        </div>
        <WordLibraryFlow />
      </>
    );
  }

  return (
    <main className="page-shell">
      <section className="section">
        <h1>Pipeline test</h1>
        <p className="lede">No login required. This exercises upload, ASR worker processing, and transcript polling.</p>
        <div className="cta-row">
          <button className="secondary" onClick={() => setMode('word')}>
            Switch to word library
          </button>
        </div>
      </section>

      {!prompt && (
        <section className="section">
          <label htmlFor="dialect-select">Language</label>
          <select id="dialect-select" value={dialectTag} onChange={(e) => setDialectTag(e.target.value)}>
            {DIALECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button onClick={loadPrompt}>Get a prompt</button>
        </section>
      )}

      {prompt && (
        <section className="section">
          <h2>Read this aloud</h2>
          <blockquote className="prompt-preview">{prompt.text}</blockquote>

          {stage !== 'recording' && (
            <button onClick={startRecording} disabled={stage === 'uploading' || stage === 'processing'}>
              Start recording
            </button>
          )}
          {stage === 'recording' && <button onClick={stopRecording}>Stop recording</button>}

          {audioUrl && (
            <div className="section">
              <audio controls src={audioUrl} />
              <button onClick={submitRecording} disabled={stage === 'uploading' || stage === 'processing'}>
                Submit
              </button>
            </div>
          )}

          {stage === 'uploading' && <p>Uploading...</p>}
          {stage === 'processing' && <p>Transcribing... waiting on worker</p>}

          {result && (
            <section className="section">
              <h3>Result</h3>
              <p>status: {result.status}</p>
              {result.status === 'ok' && result.transcript && <p>transcript: "{result.transcript}"</p>}
              {result.status === 'unsupported_dialect' && (
                <p role="alert">No ASR model is registered for this dialect yet.</p>
              )}
              {result.reason && <p>reason: {result.reason}</p>}
            </section>
          )}

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button className="secondary" onClick={loadPrompt}>
            New prompt
          </button>
        </section>
      )}
    </main>
  );
}

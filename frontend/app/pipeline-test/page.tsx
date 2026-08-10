'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/Button';
import { PageShell, PromptPreview, Section } from '@/components/PageShell';
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

const selectClass = 'min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';

export default function PipelineTestPage() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<Mode>('sentence');
  const [dialectTag, setDialectTag] = useState(DIALECT_OPTIONS[0].value);

  // Pre-select the signed-in trainer's onboarding dialect once it's known,
  // without overriding a choice they've already made in this session.
  useEffect(() => {
    if (window.location.hash === '#word-library') {
      setMode('word');
    }
  }, []);

  useEffect(() => {
    const tag = session?.user?.dialectTag;
    if (tag && DIALECT_OPTIONS.some((opt) => opt.value === tag)) {
      setDialectTag(tag);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.dialectTag]);
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
        <PageShell>
          <Breadcrumbs items={[{ href: '/pipeline-test', label: 'Pipeline test' }, { label: 'Word library' }]} />
          <Button variant="secondary" onClick={() => setMode('sentence')}>
            Back to sentence pipeline test
          </Button>
        </PageShell>
        <WordLibraryFlow />
      </>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: 'Pipeline test' }]} />
      <Section>
        <h1 className="text-4xl leading-tight md:text-5xl">Pipeline test</h1>
        <p className="text-lg leading-relaxed text-muted">
          No login required. This exercises upload, ASR worker processing, and transcript polling.
        </p>
        <div>
          <Button variant="secondary" onClick={() => setMode('word')}>
            Switch to word library
          </Button>
        </div>
      </Section>

      {!prompt && (
        <Section>
          <label htmlFor="dialect-select">Language</label>
          <select
            className={selectClass}
            id="dialect-select"
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
            <Button onClick={loadPrompt}>Get a prompt</Button>
          </div>
        </Section>
      )}

      {prompt && (
        <Section>
          <h2 className="text-2xl leading-snug">Read this aloud</h2>
          <PromptPreview>{prompt.text}</PromptPreview>

          {stage !== 'recording' && (
            <div>
              <Button onClick={startRecording} disabled={stage === 'uploading' || stage === 'processing'}>
                Start recording
              </Button>
            </div>
          )}
          {stage === 'recording' && (
            <div>
              <Button onClick={stopRecording}>Stop recording</Button>
            </div>
          )}

          {audioUrl && (
            <Section>
              <audio controls src={audioUrl} />
              <div>
                <Button onClick={submitRecording} pending={stage === 'uploading' || stage === 'processing'} pendingLabel={stage === 'processing' ? 'Processing' : 'Uploading'}>
                  Submit
                </Button>
              </div>
            </Section>
          )}

          {stage === 'uploading' && <p>Uploading...</p>}
          {stage === 'processing' && <p>Transcribing... waiting on worker</p>}

          {result && (
            <Section>
              <h3 className="text-xl leading-snug">Result</h3>
              <p>status: {result.status}</p>
              {result.status === 'ok' && result.transcript && <p>transcript: &quot;{result.transcript}&quot;</p>}
              {result.status === 'unsupported_dialect' && (
                <p role="alert">No ASR model is registered for this dialect yet.</p>
              )}
              {result.reason && <p>reason: {result.reason}</p>}
            </Section>
          )}

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <div>
            <Button variant="secondary" onClick={loadPrompt} disabled={stage === 'uploading' || stage === 'processing'}>
              New prompt
            </Button>
          </div>
        </Section>
      )}
    </PageShell>
  );
}

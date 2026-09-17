'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Camera, RotateCcw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cardClass, primaryButtonClass, SectionTitle } from './shared';
import {
  KycApiError,
  createDocumentUploadUrl,
  createSelfieUploadUrl,
  getChallenge,
  resumeSession,
  submitDocument,
  submitForDecision,
  submitSelfie,
  uploadToSignedUrl,
  type KycStatusResult,
} from '@/lib/api';

type Step =
  | 'loading'
  | 'error'
  | 'consent'
  | 'document'
  | 'selfie-intro'
  | 'selfie-capture'
  | 'submitting'
  | 'result';

const CAPTURE_CONTENT_TYPE = 'image/jpeg';
const SELFIE_FRAME_COUNT = 3;
const SELFIE_FRAME_INTERVAL_MS = 500;

export function VerificationFlow({ token }: { token: string }) {
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [documentTypes, setDocumentTypes] = useState<string[]>([]);
  const [documentType, setDocumentType] = useState<string>('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [result, setResult] = useState<KycStatusResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    resumeSession(token)
      .then((session) => {
        if (cancelled) return;
        setVerificationId(session.verificationId);
        setCallbackUrl(session.callbackUrl);
        setDocumentTypes(session.documentTypes);
        setDocumentType(session.documentTypes[0] ?? '');
        setStep('consent');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof KycApiError ? err.message : 'Could not load your verification session.',
        );
        setStep('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goToDocument = useCallback(() => setStep('document'), []);

  const handleDocumentCaptured = useCallback(
    async (frontBlob: Blob) => {
      if (!verificationId) return;
      setError(null);
      try {
        const { uploadUrl, key } = await createDocumentUploadUrl(
          verificationId,
          token,
          CAPTURE_CONTENT_TYPE,
        );
        await uploadToSignedUrl(uploadUrl, frontBlob, CAPTURE_CONTENT_TYPE);
        await submitDocument(verificationId, token, { documentType, frontKey: key });
        const { challenge: nextChallenge } = await getChallenge(verificationId, token);
        setChallenge(nextChallenge);
        setStep('selfie-intro');
      } catch (err) {
        setError(
          err instanceof KycApiError
            ? err.message
            : 'Could not upload your document. Please try again.',
        );
      }
    },
    [documentType, token, verificationId],
  );

  const handleSelfieCaptured = useCallback(
    async (frames: Blob[]) => {
      if (!verificationId || !challenge) return;
      setError(null);
      setStep('submitting');
      try {
        const frameKeys: string[] = [];
        for (const frame of frames) {
          const { uploadUrl, key } = await createSelfieUploadUrl(
            verificationId,
            token,
            CAPTURE_CONTENT_TYPE,
          );
          await uploadToSignedUrl(uploadUrl, frame, CAPTURE_CONTENT_TYPE);
          frameKeys.push(key);
        }
        await submitSelfie(verificationId, token, { frameKeys, challenge });
        const decision = await submitForDecision(verificationId, token);
        setResult(decision);
        setStep('result');
      } catch (err) {
        setError(
          err instanceof KycApiError
            ? err.message
            : 'Could not complete your verification. Please try again.',
        );
        setStep('selfie-intro');
      }
    },
    [challenge, token, verificationId],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-muted">Dialect Library</p>
          <h1 className="text-lg font-black">Identity verification</h1>
        </div>
      </header>

      {step === 'loading' && <LoadingCard />}
      {step === 'error' && <ErrorCard message={error} />}
      {step === 'consent' && <ConsentStep onContinue={goToDocument} />}
      {step === 'document' && (
        <DocumentStep
          documentType={documentType}
          documentTypes={documentTypes}
          error={error}
          onCapture={handleDocumentCaptured}
          onDocumentTypeChange={setDocumentType}
        />
      )}
      {step === 'selfie-intro' && challenge && (
        <SelfieIntroStep challenge={challenge} onContinue={() => setStep('selfie-capture')} />
      )}
      {step === 'selfie-capture' && challenge && (
        <SelfieCaptureStep challenge={challenge} error={error} onCaptured={handleSelfieCaptured} />
      )}
      {step === 'submitting' && <SubmittingCard />}
      {step === 'result' && result && <ResultStep callbackUrl={callbackUrl} result={result} />}
    </main>
  );
}

function LoadingCard() {
  return (
    <div className={`${cardClass} grid place-items-center gap-3 p-8 text-center`}>
      <Clock className="size-6 animate-pulse text-muted" aria-hidden="true" />
      <p className="font-bold text-muted">Loading your verification session...</p>
    </div>
  );
}

function ErrorCard({ message }: { message: string | null }) {
  return (
    <div className={`${cardClass} grid gap-3 p-6 text-center`}>
      <XCircle className="mx-auto size-8 text-danger" aria-hidden="true" />
      <p className="font-black">{message ?? 'This verification link is no longer valid.'}</p>
      <p className="text-sm text-muted">
        Please go back to Dialect Library and start identity verification again.
      </p>
    </div>
  );
}

function SubmittingCard() {
  return (
    <div className={`${cardClass} grid place-items-center gap-3 p-8 text-center`}>
      <Clock className="size-6 animate-pulse text-muted" aria-hidden="true" />
      <p className="font-bold text-muted">Submitting for review...</p>
    </div>
  );
}

function ConsentStep({ onContinue }: { onContinue: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className={`${cardClass} grid gap-4 p-6`}>
      <SectionTitle
        title="Before you start"
        subtitle="We use your document photo and a short selfie to confirm your identity for payout protection."
      />
      <ul className="grid gap-2 text-sm leading-relaxed text-muted">
        <li>- Have your accepted ID document ready in hand before you continue.</li>
        <li>
          - You&apos;ll photograph the front of it live with your camera -- uploading a saved photo
          is not accepted.
        </li>
        <li>
          - You&apos;ll take a short selfie and follow an on-screen instruction, such as turning
          your head.
        </li>
        <li>- Your evidence is stored privately and only used for this verification.</li>
        <li>- A result of Verified, Under review, or Unsuccessful will show here.</li>
      </ul>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3">
        <input
          checked={agreed}
          className="mt-0.5 size-5 accent-accent"
          onChange={(event) => setAgreed(event.target.checked)}
          type="checkbox"
        />
        <span className="text-sm leading-relaxed">
          I agree to Dialect Library capturing and processing my document photo and selfie for
          identity verification.
        </span>
      </label>
      <button className={primaryButtonClass} disabled={!agreed} onClick={onContinue} type="button">
        Continue
      </button>
    </div>
  );
}

function DocumentStep({
  documentType,
  documentTypes,
  error,
  onCapture,
  onDocumentTypeChange,
}: {
  documentType: string;
  documentTypes: string[];
  error: string | null;
  onCapture: (blob: Blob) => void;
  onDocumentTypeChange: (value: string) => void;
}) {
  return (
    <div className={`${cardClass} grid gap-4 p-6`}>
      <SectionTitle
        title="Photograph your document"
        subtitle="Hold your document steady and line it up inside the rectangle below. Make sure all four edges are visible and the text is readable."
      />
      <label className="grid gap-1 text-sm font-bold">
        Document type
        <select
          className="min-h-10 rounded-lg border border-line bg-white px-3"
          onChange={(event) => onDocumentTypeChange(event.target.value)}
          value={documentType}
        >
          {documentTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <CameraCapture
        guideLabel="Position your ID document inside the rectangle, then capture"
        onCapture={onCapture}
        rectGuide
      />
      {error && <p className="text-sm font-bold text-danger">{error}</p>}
    </div>
  );
}

function SelfieIntroStep({ challenge, onContinue }: { challenge: string; onContinue: () => void }) {
  return (
    <div className={`${cardClass} grid gap-4 p-6 text-center`}>
      <SectionTitle
        title="Now, a quick selfie check"
        subtitle="Keep your face inside the oval guide and follow the instruction below when you're ready."
      />
      <p className="rounded-lg border border-accent bg-accent-soft px-4 py-3 font-black text-accent-dark">
        {challenge}
      </p>
      <button className={primaryButtonClass} onClick={onContinue} type="button">
        Start selfie capture
      </button>
    </div>
  );
}

function SelfieCaptureStep({
  challenge,
  error,
  onCaptured,
}: {
  challenge: string;
  error: string | null;
  onCaptured: (frames: Blob[]) => void;
}) {
  return (
    <div className={`${cardClass} grid gap-4 p-6`}>
      <SectionTitle title="Selfie check" subtitle={challenge} />
      <CameraCapture
        burstCount={SELFIE_FRAME_COUNT}
        burstIntervalMs={SELFIE_FRAME_INTERVAL_MS}
        facingMode="user"
        guideLabel="Keep your face inside the oval while you follow the instruction above"
        onCaptureBurst={onCaptured}
        oval
      />
      {error && <p className="text-sm font-bold text-danger">{error}</p>}
    </div>
  );
}

function ResultStep({
  result,
  callbackUrl,
}: {
  result: KycStatusResult;
  callbackUrl: string | null;
}) {
  const presentation = RESULT_PRESENTATION[result.kycStatus] ?? RESULT_PRESENTATION.IN_REVIEW;
  return (
    <div className={`${cardClass} grid gap-4 p-6 text-center`}>
      <presentation.Icon className={`mx-auto size-10 ${presentation.color}`} aria-hidden="true" />
      <h2 className="text-xl font-black">{presentation.title}</h2>
      <p className="leading-relaxed text-muted">{presentation.description}</p>
      {callbackUrl && (
        <a className={primaryButtonClass} href={callbackUrl}>
          Return to Dialect Library
        </a>
      )}
    </div>
  );
}

const RESULT_PRESENTATION: Record<
  KycStatusResult['kycStatus'],
  { Icon: typeof CheckCircle2; color: string; title: string; description: string }
> = {
  APPROVED: {
    Icon: CheckCircle2,
    color: 'text-accent',
    title: 'Verified',
    description: 'Your identity has been verified. You can now return to Dialect Library.',
  },
  IN_REVIEW: {
    Icon: Clock,
    color: 'text-warning',
    title: 'Under review',
    description:
      'Your submission is being reviewed. We will update your status once it is resolved.',
  },
  IN_PROGRESS: {
    Icon: Clock,
    color: 'text-warning',
    title: 'Under review',
    description:
      'Your submission is being reviewed. We will update your status once it is resolved.',
  },
  DECLINED: {
    Icon: XCircle,
    color: 'text-danger',
    title: 'Unsuccessful',
    description:
      'We could not verify your identity from this submission. You can try again from Dialect Library.',
  },
  ABANDONED: {
    Icon: RotateCcw,
    color: 'text-muted',
    title: 'Retry required',
    description: 'This attempt was not completed. Please start again from Dialect Library.',
  },
  EXPIRED: {
    Icon: RotateCcw,
    color: 'text-muted',
    title: 'Retry required',
    description: 'This verification session expired. Please start again from Dialect Library.',
  },
  NOT_STARTED: {
    Icon: RotateCcw,
    color: 'text-muted',
    title: 'Retry required',
    description: 'Please start again from Dialect Library.',
  },
};

function CornerBrackets() {
  const cornerClass = 'absolute size-8 border-accent';
  return (
    <>
      <span className={`${cornerClass} left-0 top-0 rounded-tl-xl border-l-4 border-t-4`} />
      <span className={`${cornerClass} right-0 top-0 rounded-tr-xl border-r-4 border-t-4`} />
      <span className={`${cornerClass} bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4`} />
      <span className={`${cornerClass} bottom-0 right-0 rounded-br-xl border-b-4 border-r-4`} />
    </>
  );
}

function CameraCapture({
  guideLabel,
  oval = false,
  rectGuide = false,
  facingMode = 'environment',
  onCapture,
  onCaptureBurst,
  burstCount,
  burstIntervalMs,
}: {
  guideLabel: string;
  oval?: boolean;
  rectGuide?: boolean;
  facingMode?: 'environment' | 'user';
  onCapture?: (blob: Blob) => void;
  onCaptureBurst?: (frames: Blob[]) => void;
  burstCount?: number;
  burstIntervalMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setPermissionError('Camera access is required to continue.');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  function grabFrame(): Promise<Blob | null> {
    const video = videoRef.current;
    if (!video) return Promise.resolve(null);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), CAPTURE_CONTENT_TYPE, 0.9),
    );
  }

  async function handleSingleCapture() {
    setCapturing(true);
    const blob = await grabFrame();
    setCapturing(false);
    if (blob) onCapture?.(blob);
  }

  async function handleBurstCapture() {
    if (!burstCount) return;
    setCapturing(true);
    const frames: Blob[] = [];
    for (let i = 0; i < burstCount; i += 1) {
      const blob = await grabFrame();
      if (blob) frames.push(blob);
      if (i < burstCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, burstIntervalMs ?? 500));
      }
    }
    setCapturing(false);
    if (frames.length >= 2) onCaptureBurst?.(frames);
  }

  if (permissionError) {
    return (
      <div className="grid gap-2 rounded-lg border border-line bg-surface-muted p-4 text-center text-sm">
        <Camera className="mx-auto size-6 text-muted" aria-hidden="true" />
        <p className="font-bold text-danger">{permissionError}</p>
        <p className="text-muted">
          Please allow camera access in your browser and reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div
        className={`relative overflow-hidden rounded-lg border border-line bg-black ${oval ? 'aspect-[3/4]' : 'aspect-[4/3]'}`}
      >
        <video autoPlay className="size-full object-cover" muted playsInline ref={videoRef} />
        {rectGuide && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <div className="relative aspect-[1.586/1] w-full max-w-md">
              <div className="absolute inset-0 rounded-xl border-4 border-dashed border-white/80" />
              <CornerBrackets />
            </div>
          </div>
        )}
        {oval && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="aspect-[3/4] h-[92%] rounded-full border-4 border-white/70" />
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-bold text-white">
            Starting camera...
          </div>
        )}
      </div>
      <p className="text-center text-sm text-muted">{guideLabel}</p>
      <button
        className={primaryButtonClass}
        disabled={!ready || capturing}
        onClick={() => void (onCaptureBurst ? handleBurstCapture() : handleSingleCapture())}
        type="button"
      >
        <Camera className="size-4" aria-hidden="true" />
        {capturing ? 'Capturing...' : 'Capture'}
      </button>
    </div>
  );
}

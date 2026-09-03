'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Pause,
  Play,
  X,
  XCircle,
} from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminRecordingSummary,
  WordDetail,
  normalizeErrorMessage,
  useAuditRecordingMutation,
  useGetAdminTrainerRecordingsQuery,
  useRequestRecordingAuditClawbackOtpMutation,
} from '@/store/api';

const PAGE_SIZE = 20;

/**
 * Full-screen carousel (not the shared 480px-capped DialogContent -- same
 * reasoning as CourseSlideViewer) that pages through one trainer's
 * WordRecording + Submission rows, newest first, so an admin can play back
 * each one and mark it VALID/INVALID. Server-side pages of PAGE_SIZE are
 * fetched transparently as the admin crosses a page boundary; the "index"
 * shown/controlled here is a single running count across all pages, not
 * reset per server page.
 */
export function RecordingAuditDialog({
  trainerId,
  trainerName,
  onOpenChange,
  open,
}: {
  trainerId: string;
  trainerName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [index, setIndex] = useState(0);
  const page = Math.floor(index / PAGE_SIZE) + 1;
  const { data, isLoading, isFetching } = useGetAdminTrainerRecordingsQuery(
    { trainerId, page, pageSize: PAGE_SIZE },
    { skip: !open },
  );

  useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  const indexInPage = index % PAGE_SIZE;
  const recording = data?.items[indexInPage];
  const total = data?.total ?? 0;
  const isFirst = index <= 0;
  const isLast = total > 0 && index >= total - 1;

  if (!open) return null;

  return (
    <RadixDialog.Root open onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[950] bg-black/90" />
        <RadixDialog.Content
          className="fixed inset-0 z-[960] flex flex-col overflow-hidden bg-[#111] text-white focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <RadixDialog.Title className="sr-only">
            Audit recordings for {trainerName}
          </RadixDialog.Title>

          <header className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white/60">Auditing recordings</p>
              <p className="truncate text-lg font-black">{trainerName}</p>
            </div>
            <div className="flex items-center gap-3">
              {total > 0 && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                  {index + 1} / {total}
                </span>
              )}
              <RadixDialog.Close
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <X className="size-5" aria-hidden="true" />
              </RadixDialog.Close>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center p-4 md:p-8">
            {isLoading ? (
              <div className="grid place-items-center gap-3 text-white/60" role="status">
                <LoaderCircle className="size-8 animate-spin" aria-hidden="true" />
                <p className="font-bold">Loading recordings...</p>
              </div>
            ) : total === 0 ? (
              <p className="font-bold text-white/60">This trainer has no recordings yet.</p>
            ) : recording ? (
              <RecordingCard key={recording.id} recording={recording} trainerId={trainerId} />
            ) : (
              <LoaderCircle className="size-8 animate-spin text-white/60" aria-hidden="true" />
            )}
          </div>

          {total > 0 && (
            <footer className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 font-extrabold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isFirst}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                type="button"
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Previous
              </button>
              {isFetching && (
                <LoaderCircle className="size-4 animate-spin text-white/40" aria-hidden="true" />
              )}
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 font-extrabold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isLast}
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                type="button"
              >
                Next <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function RecordingCard({
  recording,
  trainerId,
}: {
  recording: AdminRecordingSummary;
  trainerId?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clawback, setClawback] = useState(false);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [requestOtp, { isLoading: isRequestingOtp }] =
    useRequestRecordingAuditClawbackOtpMutation();
  const [audit, { isLoading: isSubmitting }] = useAuditRecordingMutation();

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }

  async function handleMark(status: 'VALID' | 'INVALID') {
    setError(null);
    const wantsClawback = status === 'INVALID' && clawback && Boolean(recording.payoutTokenAmount);
    try {
      if (wantsClawback && !otpRequestId) {
        const result = await requestOtp({ id: recording.id }).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await audit({
        id: recording.id,
        status,
        clawback: wantsClawback,
        trainerId,
        ...(otpRequestId ? { otpRequestId, code } : {}),
      }).unwrap();
      setOtpRequestId(null);
      setCode('');
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Unable to verify this code.' : 'Unable to save this audit.',
        ),
      );
    }
  }

  const alreadyAudited = recording.adminAuditStatus !== null;

  return (
    <div className="grid w-full max-w-2xl gap-5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wide">
          Word training
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
          {recording.status}
        </span>
        {recording.adminAuditStatus && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${
              recording.adminAuditStatus === 'VALID'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-red-500/20 text-red-300'
            }`}
          >
            {recording.adminAuditStatus === 'VALID' ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : (
              <XCircle className="size-3.5" aria-hidden="true" />
            )}
            Previously marked {recording.adminAuditStatus.toLowerCase()}
          </span>
        )}
      </div>

      <div className="grid gap-1 text-center">
        <p className="text-sm font-bold text-white/60">Prompt</p>
        <p className="break-words text-2xl font-black">{recording.promptText}</p>
      </div>

      {(recording.asrTranscript || recording.responseText) && (
        <div className="grid gap-1 text-center">
          <p className="text-sm font-bold text-white/60">Spoken response (ASR transcript)</p>
          {recording.asrTranscript ? (
            recording.asrWordDetail && recording.asrWordDetail.length > 0 ? (
              <TranscriptWords
                words={recording.asrWordDetail}
                currentTime={currentTime}
                onSeek={seekTo}
              />
            ) : (
              <p className="break-words text-lg font-bold">{recording.asrTranscript}</p>
            )
          ) : (
            <p className="break-words text-sm italic text-white/50">Not yet transcribed.</p>
          )}
          {recording.kind === 'word' &&
            recording.responseText &&
            recording.responseText !== recording.asrTranscript && (
              <p className="mt-1 break-words text-sm text-white/50">
                Typed answer: {recording.responseText}
              </p>
            )}
        </div>
      )}

      <div className="mx-auto flex flex-col items-center gap-3">
        {recording.audioUrl ? (
          <>
            <button
              aria-label={playing ? 'Pause' : 'Play recording'}
              className="grid size-20 place-items-center rounded-full bg-accent text-white shadow-[0_10px_30px_rgba(126,34,206,0.4)] transition-transform hover:bg-accent-dark active:scale-95"
              onClick={togglePlayback}
              type="button"
            >
              {playing ? (
                <Pause className="size-8 fill-current" aria-hidden="true" />
              ) : (
                <Play className="ml-1 size-8 fill-current" aria-hidden="true" />
              )}
            </button>
            <audio
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              ref={audioRef}
              src={recording.audioUrl}
            />
          </>
        ) : (
          <p className="text-sm font-bold text-white/50">No audio for this task.</p>
        )}
      </div>

      <div className="mx-auto grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-white/70 sm:grid-cols-4">
        <ScoreStat label="Score" value={recording.score} />
        <ScoreStat label="Noise" value={recording.noiseScore} />
        <ScoreStat label="Quality" value={recording.qualityScore} />
        <ScoreStat label="Liveness" value={recording.livenessScore} />
      </div>

      {recording.emotion && (
        <div className="mx-auto grid max-w-md gap-1 rounded-lg bg-white/5 px-4 py-3 text-center text-sm text-white/70">
          <p className="text-xs font-bold uppercase text-white/40">
            Speech expression{' '}
            <span className="normal-case">(descriptive only -- never affects payout)</span>
          </p>
          <p className="font-bold text-white">
            {recording.emotion}
            {recording.emotionConfidence
              ? ` (${Math.round(Number(recording.emotionConfidence) * 100)}%)`
              : ''}
            {recording.tone ? ` · ${recording.tone}` : ''}
            {recording.style ? ` · ${recording.style}` : ''}
            {recording.speed ? ` · ${recording.speed}` : ''}
            {recording.energy ? ` · ${recording.energy}` : ''}
          </p>
          {recording.prosodyMetrics && (
            <p className="text-xs text-white/50">
              {recording.prosodyMetrics.meanPitchHz !== null &&
                `Pitch: ${recording.prosodyMetrics.meanPitchHz.toFixed(0)}Hz `}
              {recording.prosodyMetrics.meanRmsDb !== null &&
                `· Energy: ${recording.prosodyMetrics.meanRmsDb.toFixed(1)}dB `}
              {recording.prosodyMetrics.pauseRatio !== null &&
                `· Pauses: ${Math.round(recording.prosodyMetrics.pauseRatio * 100)}%`}
            </p>
          )}
        </div>
      )}

      {recording.payoutTokenAmount && (
        <p className="text-center text-sm font-bold text-white/60">
          Paid out: <span className="text-white">{recording.payoutTokenAmount} DL</span>
        </p>
      )}

      {error && (
        <p
          className="rounded-lg bg-red-500/10 px-4 py-2 text-center text-sm font-bold text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}

      {otpRequestId ? (
        <div className="mx-auto grid w-full max-w-xs gap-3">
          <p className="text-center text-sm font-bold text-white/70">
            Enter the 6-digit code emailed to confirm the clawback.
          </p>
          <input
            autoFocus
            className="min-h-11 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-center text-lg font-bold tracking-[0.3em] text-white outline-none focus:border-accent"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            value={code}
          />
          <div className="flex justify-center gap-2">
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-white/10 px-4 font-bold text-white hover:bg-white/20"
              onClick={() => {
                setOtpRequestId(null);
                setCode('');
              }}
              type="button"
            >
              Cancel
            </button>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-danger px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={code.length !== 6}
              onClick={() => void handleMark('INVALID')}
              pending={isSubmitting}
              pendingLabel="Confirming"
              type="button"
            >
              Confirm clawback
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-sm gap-3">
          {recording.payoutTokenAmount && (
            <label className="mx-auto flex cursor-pointer items-center gap-2 text-sm font-bold text-white/80">
              <input
                checked={clawback}
                className="size-4 accent-danger"
                onChange={(e) => setClawback(e.target.checked)}
                type="checkbox"
              />
              Also claw back the {recording.payoutTokenAmount} DL payout
            </label>
          )}
          <div className="flex justify-center gap-3">
            <ActionButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 font-extrabold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleMark('VALID')}
              pending={isSubmitting}
              pendingLabel="Saving"
              type="button"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" /> Mark valid
            </ActionButton>
            <ActionButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-danger px-5 font-extrabold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleMark('INVALID')}
              pending={isSubmitting || isRequestingOtp}
              pendingLabel={clawback ? 'Sending code' : 'Saving'}
              type="button"
            >
              <XCircle className="size-4" aria-hidden="true" /> Mark invalid
            </ActionButton>
          </div>
          {alreadyAudited && (
            <p className="text-center text-xs text-white/40">
              Re-auditing overwrites the previous decision.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Single-record counterpart to RecordingAuditDialog's carousel -- used by
 * the platform-wide "all recordings" datatable, where a row action opens
 * just that one recording (no trainer-scoped pagination) for instant
 * playback + audit.
 */
export function RecordingDetailDialog({
  recording,
  onOpenChange,
  open,
}: {
  recording: AdminRecordingSummary | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  if (!open || !recording) return null;

  return (
    <RadixDialog.Root open onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[950] bg-black/90" />
        <RadixDialog.Content
          className="fixed inset-0 z-[960] flex flex-col overflow-hidden bg-[#111] text-white focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <RadixDialog.Title className="sr-only">Audit recording</RadixDialog.Title>

          <header className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
            <p className="truncate text-lg font-black">Recording audit</p>
            <RadixDialog.Close
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <X className="size-5" aria-hidden="true" />
            </RadixDialog.Close>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 md:p-8">
            <RecordingCard
              key={recording.id}
              recording={recording}
              trainerId={recording.trainer?.id}
            />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Per-word transcript rendering: color-bands each word by confidence when
 * the engine provides one (Vosk; Whisper words always have conf: null and
 * render neutral), and highlights whichever word is under the audio
 * element's current playback position. Clicking a word seeks the audio
 * there via the same audioRef the play/pause button already controls.
 */
function TranscriptWords({
  words,
  currentTime,
  onSeek,
}: {
  words: WordDetail[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  function confidenceClass(conf: number | null) {
    if (conf === null) return 'text-white';
    if (conf < 0.5) return 'text-red-400';
    if (conf < 0.8) return 'text-amber-300';
    return 'text-emerald-300';
  }

  return (
    <p className="break-words text-lg font-bold">
      {words.map((w, i) => {
        const active = currentTime >= w.start && currentTime < w.end;
        return (
          <button
            className={`mx-0.5 rounded transition-colors ${confidenceClass(w.conf)} ${active ? 'bg-white/20' : 'hover:bg-white/10'}`}
            key={`${w.word}-${i}`}
            onClick={() => onSeek(w.start)}
            type="button"
          >
            {w.word}
          </button>
        );
      })}
    </p>
  );
}

function ScoreStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase text-white/40">{label}</p>
      <p className="font-black">{value ? Number(value).toFixed(0) : '—'}</p>
    </div>
  );
}

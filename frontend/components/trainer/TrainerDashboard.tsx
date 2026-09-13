'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Gift,
  Headphones,
  Megaphone,
  MessageSquareQuote,
  MessagesSquare,
  Mic2,
  Plus,
  Play,
  RefreshCw,
  Search,
  Send,
  Share2,
  Shield as ShieldIcon,
  Sparkles,
  Square,
  Star,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { ActionButton } from '@/components/ui/ActionButton';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import {
  formatCompactLocalCurrency,
  formatCompactNumber,
  formatCompactUsd,
  formatLocalCurrency,
} from '@/lib/format';
import { resolveDialectName, useDialectName } from '@/lib/dialect-name';
import { WordTrainingDialog } from '@/components/trainer/WordTrainingDialog';
import { TaskPickerDialog } from '@/components/trainer/TaskPickerDialog';
import { DomainConversationDialog } from '@/components/trainer/DomainConversationDialog';
import { TestimonyDialog } from '@/components/trainer/TestimonyDialog';
import { MarketView } from '@/components/p2p/MarketView';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationListPanel } from '@/components/notifications/NotificationListPanel';
import { DeletePayoutAccountDialog } from '@/components/wallet/DeletePayoutAccountDialog';
import { SecurityView } from '@/components/trainer/SecurityView';
import {
  Avatar,
  cardClass,
  EmptyPanel,
  formatDate,
  formatDateTime,
  SectionTitle,
} from '@/components/dashboard/shared';
import {
  DashboardHeader,
  DashboardView,
  dashboardViews as views,
  emailName,
  MobileNavigation,
} from '@/components/dashboard/DashboardShell';
import {
  DomainConversationSubmissionSummary,
  EarningsChartRange,
  LedgerEntryType,
  TrainerDashboardSummary,
  TrainerSubmissionSummary,
  normalizeErrorMessage,
  useGetAllDialectsQuery,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetDialectVariantsQuery,
  useGetP2PPaymentInstructionsQuery,
  useUpdateP2PPaymentInstructionsMutation,
  useGetIncompleteRequiredCoursesQuery,
  useGetMeQuery,
  useResendEmailVerificationMutation,
  useRequestPhoneOtpMutation,
  useVerifyPhoneMutation,
  useSavePhoneUnverifiedMutation,
  useRequestManualPhoneVerificationMutation,
  useMarkManualPhoneVerificationSentMutation,
  useGetPublicClientSettingsQuery,
  useListMyTestimoniesQuery,
  useGetKycStatusQuery,
  useCreateKycSessionMutation,
  useCancelMyKycMutation,
  ManualPhoneVerificationRequestResult,
  useRequestDepositOtpMutation,
  useCreateTokenDepositMutation,
  useRequestFlutterwaveDepositOtpMutation,
  useCreateFlutterwaveDepositMutation,
  useCheckFlutterwaveDepositStatusMutation,
  useGetWithdrawalMinAmountQuery,
  useRequestWithdrawalOtpMutation,
  useCreateWithdrawalMutation,
  useListPayoutAccountsQuery,
  LocalCurrency,
  PayoutAccount,
  PayoutAccountType,
  WithdrawalCurrency,
  WithdrawalNetwork,
  useGetEarningHistoryQuery,
  useGetEarningsChartQuery,
  useGetMyWordRecordingsQuery,
  useGetMyDomainConversationRecordingsQuery,
  useGetTrainerDashboardQuery,
  useGetCommunityStatsQuery,
  useGetReferralInvitationsQuery,
  useGetWalletActivityQuery,
  useSendReferralInviteMutation,
  useUpdateProfileMutation,
  MarketingAdFormat,
  useGetMarketingMaterialsQuery,
  useCreateCampaignShareMutation,
  useGetMyMarketingSharesQuery,
} from '@/store/api';
import type { Session } from 'next-auth';

type SessionUpdateFn = (data?: Record<string, unknown>) => Promise<Session | null>;

// Reachable only from the account dropdown/bell, not the main tab bar/mobile nav.
const allViewIds: DashboardView[] = [
  ...views.map((view) => view.id),
  'home',
  'referrals',
  'campaigns',
  'testimonials',
  'profile',
  'security',
  'notifications',
];

export const activityLabels: Record<LedgerEntryType, string> = {
  DEPOSIT: 'DL funding',
  TRAINING_PAYOUT: 'Training payout',
  TASK_LOCK: 'DL held for task',
  TASK_REFUND: 'Held DL returned',
  WITHDRAWAL: 'Payout request',
  WITHDRAWAL_REVERSED: 'Payout returned',
  REFERRAL_COMMISSION: 'Referral bonus',
  REFERRAL_FUNDING_BONUS: 'Funding referral bonus',
  REFERRAL_PAYOUT_BONUS: 'Training referral bonus',
  DISTRIBUTOR_BULK_ALLOCATION: 'Credit Funding',
  DISTRIBUTOR_FUNDING_BONUS: 'Distributor funding bonus',
  DISTRIBUTOR_PAYOUT_BONUS: 'Distributor payout bonus',
  SUB_DISTRIBUTOR_ADJUSTMENT: 'Sub-distributor adjustment',
  ADMIN_FUNDING: 'Admin Funding',
  ADMIN_ADJUSTMENT: 'Wallet correction',
  STARTUP_BONUS: 'Startup Bonus',
  COURSE_COMPLETION_REWARD: 'Course completion bonus',
  TESTIMONY_APPROVED_REWARD: 'Testimony reward',
  PHONE_VERIFICATION_FEE: 'Phone verification fee',
  PHONE_VERIFICATION_FEE_REFUND: 'Phone verification fee refunded',
  P2P_ESCROW_LOCK: 'P2P escrow lock',
  P2P_ESCROW_REFUND: 'P2P escrow returned',
  P2P_ESCROW_RELEASE: 'P2P escrow released',
  P2P_ESCROW_CREDIT: 'P2P DL purchase',
  VALIDATION_REWARD: 'Validation reward',
};

export function TrainerDashboard() {
  const { data: session, status, update } = useSession();
  // NextAuth's refetchInterval (providers.tsx) polls /api/auth/session every
  // 5 minutes; if that single poll fails or is served something unparseable
  // (e.g. an intermediary intercepting the request), status can transiently
  // report 'loading' again on an already-authenticated tab. Without this,
  // every such blip flashed the trainer's live dashboard back to the
  // full-page skeleton and back -- a visible flicker every few minutes for
  // no real state change. Once a session has been seen once, prefer it over
  // a transient 'loading' status; only the very first, pre-session render
  // (or a real sign-out) should ever show the loading/redirect screens
  // below.
  const hasSeenSessionRef = useRef(false);
  if (status === 'authenticated') hasSeenSessionRef.current = true;
  const effectiveStatus = status === 'loading' && hasSeenSessionRef.current ? 'authenticated' : status;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [domainConversationOpen, setDomainConversationOpen] = useState(false);
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false);
  const [requiredCoursesOpen, setRequiredCoursesOpen] = useState(false);
  const [midSessionRequiredCourses, setMidSessionRequiredCourses] = useState<
    { id: string; slug: string; title: string }[] | null
  >(null);
  const [testimonyOpen, setTestimonyOpen] = useState(false);
  const requestedView = searchParams.get('view');
  const displayName = [session?.user.firstName, session?.user.lastName].filter(Boolean).join(' ');
  const activeView = allViewIds.includes(requestedView as DashboardView)
    ? (requestedView as DashboardView)
    : 'home';
  const { data, isLoading, isFetching, error, refetch } = useGetTrainerDashboardQuery(undefined, {
    skip:
      status !== 'authenticated' ||
      session?.user.role === 'ADMIN' ||
      session?.user.role === 'DISTRIBUTOR' ||
      session?.user.role === 'VALIDATOR',
  });
  const { data: me } = useGetMeQuery(undefined, {
    skip:
      status !== 'authenticated' ||
      session?.user.role === 'ADMIN' ||
      session?.user.role === 'DISTRIBUTOR' ||
      session?.user.role === 'VALIDATOR',
  });
  const dialectName = useDialectName(session?.user.dialectTag);
  const { data: incompleteRequiredCourses } = useGetIncompleteRequiredCoursesQuery(undefined, {
    skip:
      status !== 'authenticated' ||
      session?.user.role === 'ADMIN' ||
      session?.user.role === 'DISTRIBUTOR' ||
      session?.user.role === 'VALIDATOR',
  });
  const { data: publicSettings } = useGetPublicClientSettingsQuery();

  // Same "check client-side first, server is still the authoritative
  // backstop" pattern as the balance check below -- WordsService.
  // startSession/nextAssignment still 403s on an incomplete required course
  // regardless, this just surfaces it before opening the recording dialog
  // instead of after.
  function handleStartTask() {
    if (incompleteRequiredCourses && incompleteRequiredCourses.length > 0) {
      setRequiredCoursesOpen(true);
      return;
    }
    if (data && Number(data.balance) < Number(data.taskTokenCost)) {
      setLowBalanceOpen(true);
      return;
    }
    setTaskPickerOpen(true);
  }


  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session.user.role === 'ADMIN') router.replace('/admin');
    if (session.user.role === 'DISTRIBUTOR') router.replace('/distributor');
    if (session.user.role === 'VALIDATOR') router.replace('/validator');
    else if (!session.user.onboardingComplete) router.replace('/onboarding');
  }, [router, session, status]);

  if (
    effectiveStatus === 'loading' ||
    (effectiveStatus === 'authenticated' &&
      session &&
      (session.user.role === 'ADMIN' ||
        session.user.role === 'DISTRIBUTOR' ||
        session.user.role === 'VALIDATOR' ||
        !session.user.onboardingComplete))
  ) {
    return <DashboardLoading />;
  }

  if (!session) {
    return (
      <main className="dashboard-theme grid min-h-screen place-items-center bg-bg p-5 text-ink">
        <section className={`${cardClass} grid w-full max-w-sm gap-4 p-5`}>
          <BrandLogo size={36} />
          <h1 className="text-2xl font-black">Trainer dashboard</h1>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-extrabold text-white"
            href="/login"
          >
            Log in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard-theme min-h-screen bg-bg text-ink" ref={setThemeRoot}>
      <PortalContainerProvider container={themeRoot}>
        <DashboardHeader
          activeView={activeView}
          displayName={displayName || emailName(session.user.email)}
          email={session.user.email ?? 'Trainer'}
          image={session.user.image}
          publicProfileHref={
            session.user.referralCode
              ? `/trainers/${encodeURIComponent(session.user.referralCode)}`
              : null
          }
        />

        {me && !me.emailVerified && <EmailVerificationBanner />}
        {incompleteRequiredCourses && incompleteRequiredCourses.length > 0 && (
          <RequiredCoursesBanner courses={incompleteRequiredCourses} />
        )}
        <MicrophonePermissionBanner activeView={activeView} />

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          {activeView === 'home' && (
            <section className="mb-7 flex flex-wrap items-center gap-3 border-b border-line pb-6 md:gap-4">
              <Avatar email={session.user.email ?? 'Trainer'} image={session.user.image} large />
              <div className="min-w-0">
                <p className="text-sm font-bold text-muted">Welcome back</p>
                <h1 className="truncate text-2xl font-black md:text-3xl">
                  {displayName || emailName(session.user.email)}
                </h1>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                  <BadgeCheck className="size-4 text-emerald-600" aria-hidden="true" />
                  <span>{dialectName ? `${dialectName} trainer` : 'Dialect trainer'}</span>
                </div>
              </div>
              <button
                className="ml-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
                onClick={handleStartTask}
                type="button"
              >
                Start task <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </section>
          )}

          {activeView === 'home' && <CommunityStatsCta />}

          {activeView === 'profile' ? (
            <ProfileView session={session} update={update} />
          ) : activeView === 'security' ? (
            <SecurityView />
          ) : activeView === 'notifications' ? (
            <NotificationListPanel />
          ) : error ? (
            <DashboardError retry={() => void refetch()} />
          ) : isLoading || !data ? (
            <ViewLoading />
          ) : (
            <DashboardViewContent
              activeView={activeView}
              data={data}
              dialectTag={session.user.dialectTag}
              domainConversationEnabled={!!publicSettings?.domainConversationTaskEnabled}
              email={session.user.email ?? ''}
              refreshing={isFetching}
              onStartTask={handleStartTask}
              onGiveTestimony={() => setTestimonyOpen(true)}
            />
          )}
        </main>

        <MobileNavigation activeView={activeView} />
        <TaskPickerDialog
          domainConversationEnabled={!!publicSettings?.domainConversationTaskEnabled}
          onOpenChange={setTaskPickerOpen}
          onSelectDomainConversation={() => {
            setTaskPickerOpen(false);
            setDomainConversationOpen(true);
          }}
          onSelectWordTraining={() => {
            setTaskPickerOpen(false);
            setTrainingOpen(true);
          }}
          open={taskPickerOpen}
        />
        <WordTrainingDialog
          onOpenChange={setTrainingOpen}
          open={trainingOpen}
          recordingTimeoutSeconds={data?.recordingRoundTimeoutSeconds}
          recordingMaxTimeoutSeconds={data?.recordingRoundMaxTimeoutSeconds}
          onRequiredCourses={(courses) => {
            setMidSessionRequiredCourses(courses);
            setRequiredCoursesOpen(true);
          }}
          onInsufficientBalance={() => setLowBalanceOpen(true)}
        />
        <DomainConversationDialog
          onOpenChange={setDomainConversationOpen}
          open={domainConversationOpen}
          onRequiredCourses={(courses) => {
            setMidSessionRequiredCourses(courses);
            setRequiredCoursesOpen(true);
          }}
          onInsufficientBalance={() => setLowBalanceOpen(true)}
        />
        <LowBalanceDialog
          onOpenChange={setLowBalanceOpen}
          open={lowBalanceOpen}
          taskTokenCost={data?.taskTokenCost ?? '0'}
          tokenUsdRate={data?.tokenUsdRate}
          localCurrency={data?.localCurrency}
        />
        <RequiredCoursesDialog
          courses={midSessionRequiredCourses ?? incompleteRequiredCourses ?? []}
          onOpenChange={(open) => {
            setRequiredCoursesOpen(open);
            if (!open) setMidSessionRequiredCourses(null);
          }}
          open={requiredCoursesOpen}
        />
        {publicSettings?.testimonyEnabled && (
          <TestimonyDialog
            maxTextLength={publicSettings.testimonyMaxTextLength}
            maxVideoSeconds={publicSettings.testimonyMaxVideoSeconds}
            textRewardTokens={publicSettings.testimonyTextRewardTokens}
            videoRewardTokens={publicSettings.testimonyVideoRewardTokens}
            onOpenChange={setTestimonyOpen}
            onSubmitted={() => setTestimonyOpen(false)}
            open={testimonyOpen}
          />
        )}
      </PortalContainerProvider>
    </div>
  );
}

function LowBalanceDialog({
  open,
  onOpenChange,
  taskTokenCost,
  tokenUsdRate,
  localCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTokenCost: string;
  tokenUsdRate?: number;
  localCurrency?: LocalCurrency | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        title="Fund your account to continue"
        description={`Starting a task holds ${formatTokens(taskTokenCost)} DL from your balance until it's scored. You don't have enough available DL to cover that right now.`}
      >
        <FundTokensDialog tokenUsdRate={tokenUsdRate} localCurrency={localCurrency} />
      </DialogContent>
    </Dialog>
  );
}

function RequiredCoursesDialog({
  courses,
  onOpenChange,
  open,
}: {
  courses: { id: string; slug: string; title: string }[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        title="Complete required training first"
        description="These courses are required before you can start a task -- they help keep submission quality high across the platform."
      >
        <div className="grid gap-2">
          {courses.map((course) => (
            <Link
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 font-bold text-ink no-underline hover:bg-surface-muted"
              href={`/dashboard/learn/${course.slug}`}
              key={course.id}
              onClick={() => onOpenChange(false)}
            >
              {course.title}
              <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequiredCoursesBanner({
  courses,
}: {
  courses: { id: string; slug: string; title: string }[];
}) {
  const first = courses[0];
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-900 dark:bg-amber-950">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 md:px-2">
        <p className="font-bold text-amber-800 dark:text-amber-200">
          {courses.length === 1
            ? `Complete "${first.title}" before you can start training.`
            : `Complete ${courses.length} required courses before you can start training.`}
        </p>
        <Link
          className="shrink-0 font-extrabold text-amber-800 underline hover:no-underline dark:text-amber-200"
          href={`/dashboard/learn/${first.slug}`}
        >
          Start now
        </Link>
      </div>
    </div>
  );
}

function EmailVerificationBanner() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resend, { isLoading }] = useResendEmailVerificationMutation();
  const router = useRouter();

  async function handleSend() {
    setError(null);
    try {
      await resend().unwrap();
      setSent(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send the verification link.'));
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-900 dark:bg-amber-950">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 md:px-2">
        <p className="font-bold text-amber-800 dark:text-amber-200">
          {sent
            ? 'Verification link sent — check your inbox.'
            : error
              ? error
              : 'Your email address is not verified.'}
        </p>
        {!sent && (
          <button
            className="shrink-0 font-extrabold text-amber-800 underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-200"
            disabled={isLoading}
            onClick={() => void handleSend()}
            type="button"
          >
            {isLoading ? 'Sending…' : 'Click here to send verification link'}
          </button>
        )}
        {sent && (
          <button
            className="shrink-0 font-extrabold text-amber-800 underline hover:no-underline dark:text-amber-200"
            onClick={() => router.push('/dashboard?view=profile')}
            type="button"
          >
            Manage in Profile
          </button>
        )}
      </div>
    </div>
  );
}

type MicPermissionState = 'unknown' | 'granted' | 'prompt' | 'denied';

const COMMUNITY_URL = process.env.NEXT_PUBLIC_COMMUNITY_URL ?? 'https://community.dialectlibrary.com';

/**
 * Live counts from CommunityStatsService, shown as a "join the community"
 * CTA on the dashboard home view -- links straight out to the community
 * app rather than duplicating any of it here, since the two apps share a
 * NextAuth session cookie (Domain=.dialectlibrary.com) and the trainer
 * lands already signed in.
 */
function CommunityStatsCta() {
  const { data: stats } = useGetCommunityStatsQuery();

  return (
    <a
      className={`${cardClass} mb-7 flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-accent md:p-5`}
      href={COMMUNITY_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <Users aria-hidden="true" className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">Dialect Library Community</p>
        <p className="text-sm text-muted">
          {stats ? (
            <>
              {formatCompactNumber(stats.memberCount)} trainers &middot;{' '}
              {formatCompactNumber(stats.postCount)} discussions
              {stats.postsLast24h > 0 && (
                <> &middot; {formatCompactNumber(stats.postsLast24h)} new today</>
              )}
            </>
          ) : (
            'Ask questions, share tips, and connect with other trainers.'
          )}
        </p>
      </div>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-extrabold text-accent">
        Join the conversation <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </a>
  );
}

/**
 * Checked on every login (mount) and every time the trainer switches to the
 * Training tab, since that's the moment recording is actually about to
 * happen. Uses the Permissions API to watch live state changes (e.g. the
 * trainer flips the browser padlock mid-session) where supported, falling
 * back to a plain getUserMedia probe on browsers without navigator.permissions
 * microphone support (notably Safari). The banner itself never records --
 * "Enable" just triggers the same browser permission prompt WordTrainingDialog's
 * startRecording would, then immediately releases the resulting stream.
 */
function MicrophonePermissionBanner({ activeView }: { activeView: DashboardView }) {
  const [state, setState] = useState<MicPermissionState>('unknown');
  const [requesting, setRequesting] = useState(false);

  async function checkPermission() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setState(status.state as MicPermissionState);
        status.onchange = () => setState(status.state as MicPermissionState);
        return;
      } catch {
        // Some browsers (Safari) support navigator.permissions but reject the
        // "microphone" descriptor -- fall through to the probe below.
      }
    }
    setState('prompt');
  }

  useEffect(() => {
    void checkPermission();
  }, []);

  useEffect(() => {
    if (activeView === 'training') void checkPermission();
  }, [activeView]);

  async function requestAccess() {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setState('granted');
    } catch {
      setState('denied');
    } finally {
      setRequesting(false);
    }
  }

  if (state === 'unknown' || state === 'granted') return null;

  const denied = state === 'denied';

  return (
    <div
      className={`border-b px-4 py-2.5 text-sm ${
        denied
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 md:px-2">
        <p
          className={`font-bold ${denied ? 'text-danger dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}
        >
          {denied
            ? 'Your microphone is disabled — allow access in your browser settings to contribute recordings.'
            : 'Enable microphone access to contribute recordings.'}
        </p>
        {!denied && (
          <button
            className="shrink-0 font-extrabold text-amber-800 underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-200"
            disabled={requesting}
            onClick={() => void requestAccess()}
            type="button"
          >
            {requesting ? 'Requesting…' : 'Enable microphone'}
          </button>
        )}
      </div>
    </div>
  );
}

function EmailVerificationCard({
  email,
  emailVerified,
}: {
  email: string;
  emailVerified: boolean;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resend, { isLoading }] = useResendEmailVerificationMutation();

  async function handleSend() {
    setError(null);
    setSent(false);
    try {
      await resend().unwrap();
      setSent(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send the verification link.'));
    }
  }

  return (
    <div className={`${cardClass} grid gap-4 p-5`}>
      <SectionTitle
        title="Email address"
        subtitle={emailVerified ? 'Verified.' : 'Verify your email address.'}
      />
      <p className="text-sm font-bold">{email}</p>
      {emailVerified ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          This email address is verified.
        </p>
      ) : (
        <>
          {sent && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Verification link sent — check your inbox.
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}
          <div>
            <ActionButton
              className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSend()}
              pending={isLoading}
              pendingLabel="Sending"
              type="button"
            >
              Send verification link
            </ActionButton>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardViewContent({
  activeView,
  data,
  dialectTag,
  domainConversationEnabled,
  email,
  refreshing,
  onStartTask,
  onGiveTestimony,
}: {
  activeView: DashboardView;
  data: TrainerDashboardSummary;
  dialectTag: string | null;
  domainConversationEnabled: boolean;
  email: string;
  refreshing: boolean;
  onStartTask: () => void;
  onGiveTestimony: () => void;
}) {
  if (activeView === 'earnings') return <EarningsView data={data} refreshing={refreshing} />;
  if (activeView === 'training')
    return (
      <TrainingView
        dialectTag={dialectTag}
        domainConversationEnabled={domainConversationEnabled}
        onStartTask={onStartTask}
      />
    );
  if (activeView === 'market') return <MarketView />;
  if (activeView === 'referrals') return <MarketingView data={data} email={email} />;
  if (activeView === 'campaigns') return <CampaignsView referralCode={data.referrals.code} />;
  if (activeView === 'testimonials') return <TestimonialsView onGiveTestimony={onGiveTestimony} />;
  if (activeView === 'scores') return <ScoresView />;
  if (activeView === 'tokens') return <TokensView data={data} refreshing={refreshing} />;
  return <HomeView data={data} refreshing={refreshing} />;
}

function ViewHeading({
  title,
  subtitle,
  refreshing,
}: {
  title: string;
  subtitle: string;
  refreshing?: boolean;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black md:text-[28px]">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted md:text-base">{subtitle}</p>
      </div>
      {refreshing && (
        <RefreshCw className="mt-1 size-4 animate-spin text-muted" aria-label="Refreshing" />
      )}
    </div>
  );
}

/**
 * Purely informational -- lets a trainer see how close they are to
 * withdrawal eligibility before they ever open the Withdraw dialog, instead
 * of only finding out via a rejected request. Renders nothing once the
 * threshold is met or disabled (minCompletedTasksForWithdrawal <= 0).
 */
function WithdrawalEligibilityNote({
  completedTasksForWithdrawal,
  minCompletedTasksForWithdrawal,
}: {
  completedTasksForWithdrawal: number;
  minCompletedTasksForWithdrawal: number;
}) {
  if (minCompletedTasksForWithdrawal <= 0) return null;
  const remaining = minCompletedTasksForWithdrawal - completedTasksForWithdrawal;
  if (remaining <= 0) return null;
  const progressPercent = Math.min(
    100,
    Math.round((completedTasksForWithdrawal / minCompletedTasksForWithdrawal) * 100),
  );

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-muted p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">
          {completedTasksForWithdrawal}/{minCompletedTasksForWithdrawal} tasks toward withdrawal
          eligibility
        </p>
        <Link
          className="text-sm font-extrabold text-accent hover:underline"
          href="/dashboard?view=training"
        >
          Keep training
        </Link>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${progressPercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Complete {remaining} more task{remaining === 1 ? '' : 's'} to unlock withdrawals.
      </p>
    </div>
  );
}

function HomeView({ data, refreshing }: { data: TrainerDashboardSummary; refreshing: boolean }) {
  const usdValue = Number(data.balance) * data.tokenUsdRate;
  const router = useRouter();
  const latest = data.recentActivity;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <ViewHeading
          title="Dashboard"
          subtitle="Your available platform balance at a glance."
          refreshing={refreshing}
        />
        <div className="flex shrink-0 items-center gap-2">
          <WithdrawTokensDialog
            balance={data.balance}
            minWithdrawalTokens={data.minWithdrawalTokens}
            minCompletedTasksForWithdrawal={data.minCompletedTasksForWithdrawal}
            completedTasksForWithdrawal={data.completedTasksForWithdrawal}
            minWalletBalanceTokens={data.minWalletBalanceTokens}
            withdrawableBalanceTokens={data.withdrawableBalanceTokens}
            tokenUsdRate={data.tokenUsdRate}
            localCurrency={data.localCurrency}
          />
          <FundTokensDialog tokenUsdRate={data.tokenUsdRate} localCurrency={data.localCurrency} />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-4" aria-label="DL balance">
        <MetricCard
          icon={WalletCards}
          label="Available DL"
          value={formatCompactTokensValue(data.balance)}
          subValue={formatCompactUsd(Number(data.balance) * data.tokenUsdRate)}
          tone="purple"
          tooltip="Your spendable DL balance -- ready to withdraw or use right now."
        />
        <MetricCard
          icon={Clock3}
          label="Held in review"
          value={formatCompactTokensValue(data.lockedBalance)}
          subValue={formatCompactUsd(Number(data.lockedBalance) * data.tokenUsdRate)}
          tone="blue"
          compact
          href="/dashboard/held-in-review"
          tooltip="DL locked while your recent submissions are being scored or settled. It moves to your available balance once review finishes."
        />
        <MetricCard
          icon={Banknote}
          label="Estimated value"
          value={formatCompactUsd(usdValue)}
          tone="green"
          tooltip="Your available DL converted to US dollars at the current rate."
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Current rate"
          value={`${formatUsd(data.tokenUsdRate)} / DL`}
          tone="amber"
          compact
          tooltip="The current exchange rate used to convert DL to US dollars. It can change over time."
        />
      </section>
      {data.localCurrency && data.balanceInLocalCurrency && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          ≈ {formatCompactLocalCurrency(data.balanceInLocalCurrency, data.localCurrency.code)}
          {data.localCurrency.updatedAt &&
            ` · rate as of ${formatDateTime(data.localCurrency.updatedAt)}`}
        </p>
      )}
      <WithdrawalEligibilityNote
        completedTasksForWithdrawal={data.completedTasksForWithdrawal}
        minCompletedTasksForWithdrawal={data.minCompletedTasksForWithdrawal}
      />
      <section className="mt-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <SectionTitle title="Recent activity" subtitle="Your latest DL transactions." />
          <button
            className="shrink-0 text-sm font-extrabold text-accent hover:underline"
            onClick={() => router.push('/dashboard?view=tokens')}
            type="button"
          >
            View all
          </button>
        </div>
        <ActivityList compact entries={latest} />
      </section>
    </div>
  );
}

function TokensView({
  data: summary,
  refreshing,
}: {
  data: TrainerDashboardSummary;
  refreshing: boolean;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading, isFetching, isError, refetch } = useGetWalletActivityQuery({
    page,
    pageSize,
  });
  const tokensEarned = Number(summary.totalTokensSinceJoin);
  const otherCredits = Number(summary.otherCreditsTokens);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <ViewHeading
          title="Tokens"
          subtitle="Full history of your token activity."
          refreshing={refreshing || isFetching}
        />
        <div className="flex shrink-0 items-center gap-2">
          <WithdrawTokensDialog
            balance={summary.balance}
            minWithdrawalTokens={summary.minWithdrawalTokens}
            minCompletedTasksForWithdrawal={summary.minCompletedTasksForWithdrawal}
            completedTasksForWithdrawal={summary.completedTasksForWithdrawal}
            minWalletBalanceTokens={summary.minWalletBalanceTokens}
            withdrawableBalanceTokens={summary.withdrawableBalanceTokens}
            tokenUsdRate={summary.tokenUsdRate}
            localCurrency={summary.localCurrency}
          />
          <FundTokensDialog
            tokenUsdRate={summary.tokenUsdRate}
            localCurrency={summary.localCurrency}
          />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Token balance summary">
        <MetricCard
          icon={WalletCards}
          label="Tokens earned"
          value={formatCompactTokensValue(tokensEarned)}
          tone="purple"
          tooltip="Total DL you've earned from training, courses, referrals, and rewards -- including any you've already withdrawn. Task locks and refunds are temporary holds, not spending, so they aren't counted here."
        />
        <MetricCard
          icon={Gift}
          label="Other credits"
          value={formatCompactTokensValue(otherCredits)}
          tone="purple"
          tooltip="Funding added to your account by an admin or a deposit -- not earned through tasks, but it still adds to your available balance."
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Available balance"
          value={formatCompactTokensValue(summary.balance)}
          subValue={formatCompactUsd(Number(summary.balance) * summary.tokenUsdRate)}
          tone="blue"
          tooltip="Your spendable DL balance -- ready to withdraw or use right now."
        />
      </section>
      <WithdrawalEligibilityNote
        completedTasksForWithdrawal={summary.completedTasksForWithdrawal}
        minCompletedTasksForWithdrawal={summary.minCompletedTasksForWithdrawal}
      />
      <section className={`${cardClass} mt-6 overflow-hidden`}>
        {isLoading ? (
          <div className="grid min-h-52 place-items-center" role="status">
            <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
            <span className="sr-only">Loading token activity</span>
          </div>
        ) : isError ? (
          <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
            <p className="font-extrabold">Could not load your token activity.</p>
            <button
              className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
              onClick={() => void refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : data && data.items.length ? (
          <>
            <div className="divide-y divide-line md:hidden">
              {data.items.map((entry) => (
                <ActivityMobileRow entry={entry} key={entry.id} />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-surface-muted/70 text-xs font-black uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">Activity</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((entry) => (
                    <ActivityTableRow entry={entry} key={entry.id} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)} of{' '}
                {data.total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Previous activity page"
                  className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={page <= 1}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  type="button"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span className="min-w-16 text-center font-bold text-ink">
                  {page} / {data.totalPages}
                </span>
                <button
                  aria-label="Next activity page"
                  className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={page >= data.totalPages}
                  onClick={() =>
                    setPage((currentPage) => Math.min(data.totalPages, currentPage + 1))
                  }
                  type="button"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyPanel
            icon={Clock3}
            title="No account activity yet"
            actionHref={undefined}
            actionLabel={undefined}
          />
        )}
      </section>
    </div>
  );
}

function EarningsView({
  data,
  refreshing,
}: {
  data: TrainerDashboardSummary;
  refreshing: boolean;
}) {
  const total = Number(data.trainingEarningsTokens) + Number(data.referralEarningsTokens);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <ViewHeading
          title="Earnings"
          subtitle="Training payouts and referral bonuses credited to your wallet."
          refreshing={refreshing}
        />
        <div className="flex shrink-0 items-center gap-2">
          <WithdrawTokensDialog
            balance={data.balance}
            minWithdrawalTokens={data.minWithdrawalTokens}
            minCompletedTasksForWithdrawal={data.minCompletedTasksForWithdrawal}
            completedTasksForWithdrawal={data.completedTasksForWithdrawal}
            minWalletBalanceTokens={data.minWalletBalanceTokens}
            withdrawableBalanceTokens={data.withdrawableBalanceTokens}
            tokenUsdRate={data.tokenUsdRate}
            localCurrency={data.localCurrency}
          />
          <FundTokensDialog tokenUsdRate={data.tokenUsdRate} localCurrency={data.localCurrency} />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Earnings summary">
        <MetricCard
          icon={Sparkles}
          label="Total earned"
          value={formatCompactTokensLabel(total)}
          subValue={formatCompactUsd(total * data.tokenUsdRate)}
          tone="purple"
          compact
          tooltip="All DL you've earned across training, referrals, and other rewards, before any withdrawals."
        />
        <MetricCard
          icon={Mic2}
          label="Training"
          value={formatCompactTokensValue(data.trainingEarningsTokens)}
          subValue={formatCompactUsd(Number(data.trainingEarningsTokens) * data.tokenUsdRate)}
          tone="green"
          tooltip="DL earned from recording and translating training tasks."
        />
        <MetricCard
          icon={Users}
          label="Referrals"
          value={formatCompactTokensValue(data.referralEarningsTokens)}
          subValue={formatCompactUsd(Number(data.referralEarningsTokens) * data.tokenUsdRate)}
          tone="amber"
          tooltip="DL earned as bonuses when people you referred join and become active."
        />
        <MetricCard
          icon={ArrowUpRight}
          label="Paid out"
          value={formatCompactTokensValue(data.paidOutTokens)}
          subValue={formatCompactUsd(Number(data.paidOutTokens) * data.tokenUsdRate)}
          tone="blue"
          tooltip="DL you've already withdrawn out of the platform."
        />
      </section>
      <section className="mt-8">
        <EarningsChartSection tokenUsdRate={data.tokenUsdRate} />
      </section>
      <EarningHistoryTable tokenUsdRate={data.tokenUsdRate} />
    </div>
  );
}

function EarningHistoryTable({ tokenUsdRate }: { tokenUsdRate: number }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading, isFetching, isError, refetch } = useGetEarningHistoryQuery({
    page,
    pageSize,
  });
  const totalPages = data?.totalPages ?? 1;
  const firstRow = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data?.total ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <section className="mt-8" aria-labelledby="earning-history-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black md:text-xl" id="earning-history-title">
            Earning history
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Every training payout and referral bonus credited to your wallet.
          </p>
        </div>
        {data && data.total > 0 ? (
          <p className="text-sm font-bold text-muted">
            Showing {firstRow}-{lastRow} of {data.total.toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {isLoading ? (
          <div className="grid min-h-52 place-items-center" role="status">
            <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
            <span className="sr-only">Loading earning history</span>
          </div>
        ) : isError ? (
          <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
            <p className="font-extrabold">Could not load earning history.</p>
            <button
              className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
              onClick={() => void refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : data?.items.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <caption className="sr-only">Complete earning history</caption>
                <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3.5" scope="col">
                      Date
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Source
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Reference
                    </th>
                    <th className="px-5 py-3.5 text-right" scope="col">
                      Value
                    </th>
                    <th className="px-5 py-3.5 text-right" scope="col">
                      DL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((entry) => (
                    <tr className="hover:bg-surface-muted/60" key={entry.id}>
                      <td className="whitespace-nowrap px-5 py-4 font-bold">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <EarningTypeLabel type={entry.type} />
                      </td>
                      <td
                        className="max-w-52 truncate px-5 py-4 font-mono text-xs text-muted"
                        title={entry.reference}
                      >
                        {entry.reference}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-muted">
                        {formatUsd(Number(entry.amount) * tokenUsdRate)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-black text-emerald-700 dark:text-emerald-300">
                        +{formatTokens(entry.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {data.items.map((entry) => (
                <article className="grid gap-3 p-4" key={entry.id}>
                  <div className="flex items-start justify-between gap-3">
                    <EarningTypeLabel type={entry.type} />
                    <span className="whitespace-nowrap font-black text-emerald-700 dark:text-emerald-300">
                      +{formatTokens(entry.amount)}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold">{formatDateTime(entry.createdAt)}</p>
                      <p className="truncate font-mono text-xs text-muted">{entry.reference}</p>
                    </div>
                    <span className="shrink-0 font-bold text-muted">
                      {formatUsd(Number(entry.amount) * tokenUsdRate)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel icon={Clock3} title="No earnings credited yet" unframed />
        )}

        {data && data.total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
            <p className="text-sm font-bold text-muted">
              Page {data.page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous earnings page"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                aria-label="Next earnings page"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                type="button"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EarningTypeLabel({ type }: { type: LedgerEntryType }) {
  return (
    <span className="inline-flex items-center gap-2 font-extrabold">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        {type === 'TRAINING_PAYOUT' ? (
          <Mic2 className="size-4" aria-hidden="true" />
        ) : (
          <Users className="size-4" aria-hidden="true" />
        )}
      </span>
      {activityLabels[type]}
    </span>
  );
}

/**
 * Admin-configured via PlatformSettings.scoringSlaMinutes (default 60min) --
 * RTK Query caches getTrainerDashboard by its (empty) arg, so calling the
 * hook again here reads the already-fetched result instead of firing a
 * second request. Falls back to 60min only for the brief window before the
 * dashboard query has resolved.
 */
export function useScoringSlaMs(): number {
  const { data } = useGetTrainerDashboardQuery();
  return (data?.scoringSlaMinutes ?? 60) * 60 * 1000;
}

/** e.g. 90_000 -> "1m", 5_400_000 -> "1h 30m", 3_600_000 -> "1h" -- now that the SLA is minute-configurable, a fixed "Xh" label would misrepresent sub-hour or non-round-hour values. */
export function formatDurationLabel(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

type TrainingTab = 'training' | 'tasks';

function TrainingView({
  dialectTag,
  domainConversationEnabled,
  onStartTask,
}: {
  dialectTag: string | null;
  domainConversationEnabled: boolean;
  onStartTask: () => void;
}) {
  const [tab, setTab] = useState<TrainingTab>('tasks');
  const dialectName = useDialectName(dialectTag);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <ViewHeading title="Training" subtitle="Translate and pronounce words in your dialect." />
        <button
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
          onClick={onStartTask}
          type="button"
        >
          Start task <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1"
        role="tablist"
        aria-label="Training sections"
      >
        <button
          aria-selected={tab === 'tasks'}
          className={`min-h-9 rounded-md px-4 text-sm font-extrabold transition-colors ${tab === 'tasks' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
          onClick={() => setTab('tasks')}
          role="tab"
          type="button"
        >
          My Tasks
        </button>
        <button
          aria-selected={tab === 'training'}
          className={`min-h-9 rounded-md px-4 text-sm font-extrabold transition-colors ${tab === 'training' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
          onClick={() => setTab('training')}
          role="tab"
          type="button"
        >
          Training
        </button>
      </div>

      {tab === 'training' ? (
        <div className="grid gap-5 md:grid-cols-2">
          <article className={`${cardClass} grid min-h-64 content-between gap-6 p-5 md:p-6`}>
            <div>
              <div className="mb-5 flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Mic2 className="size-5" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Available
                </span>
              </div>
              <h3 className="text-xl font-black">Word training</h3>
              <p className="mt-2 leading-relaxed text-muted">
                Translate individual words and sentences, record their pronunciation, and
                validate dialect submissions.
              </p>
            </div>
            <div>
              <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold text-muted">
                <span className="rounded-md bg-surface-muted px-2 py-1">Translation + voice</span>
                <span className="rounded-md bg-surface-muted px-2 py-1">
                  {dialectName ?? 'Your dialect'}
                </span>
              </div>
              <button
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark sm:w-auto"
                onClick={onStartTask}
                type="button"
              >
                Start task <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </article>
          {domainConversationEnabled && (
            <article className={`${cardClass} grid min-h-64 content-between gap-6 p-5 md:p-6`}>
              <div>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent">
                    <MessagesSquare className="size-5" aria-hidden="true" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Available
                  </span>
                </div>
                <h3 className="text-xl font-black">Domain Conversation</h3>
                <p className="mt-2 leading-relaxed text-muted">
                  Record yourself conversing in an everyday scenario -- market, office, school, and
                  more.
                </p>
              </div>
              <div>
                <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold text-muted">
                  <span className="rounded-md bg-surface-muted px-2 py-1">Free-form voice</span>
                  <span className="rounded-md bg-surface-muted px-2 py-1">
                    {dialectName ?? 'Your dialect'}
                  </span>
                </div>
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark sm:w-auto"
                  onClick={onStartTask}
                  type="button"
                >
                  Start task <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          )}
        </div>
      ) : (
        <MyTasksView />
      )}
    </div>
  );
}

type TaskDisplayStatus =
  'PENDING' | 'TRANSCRIBED' | 'SCORED' | 'SETTLED' | 'REJECTED' | 'EXPIRED' | 'FAILED';

const taskStatusLabels: Record<TaskDisplayStatus, string> = {
  PENDING: 'Awaiting transcription',
  TRANSCRIBED: 'Awaiting scoring',
  SCORED: 'Scored',
  SETTLED: 'Scored',
  REJECTED: 'Rejected',
  EXPIRED: 'Not enough submissions — refunded',
  FAILED: 'Failed to score',
};

const taskStatusTones: Record<TaskDisplayStatus, string> = {
  PENDING: 'bg-surface-muted text-muted',
  TRANSCRIBED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  SCORED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  SETTLED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-50 text-danger dark:bg-red-950',
  EXPIRED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  FAILED: 'bg-red-50 text-danger dark:bg-red-950',
};

/** Live countdown from createdAt to createdAt+SCORING_SLA_MS, ticking every second. */
function useCountdown(deadline: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, deadline - now);
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Scoring is quorum-triggered (no fixed schedule) and settlement-job only
 * sweeps periodically, so there's a gap between a submission's SLA
 * elapsing and the backend actually confirming it as EXPIRED (refunded,
 * terminal). Until that sweep runs, this shows a display-only "Failed to
 * score" guess client-side -- nothing is written back for it. Once
 * settlement-job runs, submission.status flips to the real EXPIRED value
 * and that's what renders instead.
 */
function deriveTaskStatus(
  submission: TrainerSubmissionSummary,
  nowMs: number,
  slaMs: number,
): TaskDisplayStatus {
  if (submission.status === 'REJECTED') return 'REJECTED';
  if (submission.status === 'EXPIRED') return 'EXPIRED';
  if (submission.status === 'SCORED' || submission.status === 'SETTLED') return submission.status;
  const deadline = new Date(submission.createdAt).getTime() + slaMs;
  if (nowMs >= deadline) return 'FAILED';
  return submission.status;
}

function estimatedReward(tokensSpent: string) {
  const spent = Number(tokensSpent);
  return `${formatTokens(spent)} – ${formatTokens(spent * 2)} DL`;
}

/** tokensSpent + tokensSpent*(score/100)*1.0 -- mirrors the backend's default no-loss payout formula (bonusCapMultiple=1.0). Settlement may use an admin-tuned cap, so this is an estimate until SETTLED. */
function estimatedScoredPayout(tokensSpent: string, score: string) {
  const spent = Number(tokensSpent);
  const scoreFraction = Math.max(0, Math.min(100, Number(score))) / 100;
  return spent + spent * scoreFraction;
}

/**
 * Hover-tooltip breakdown of the four signals behind compositeScore -- shown
 * whenever compositeScore differs from the raw transcript/exact-match score,
 * so a trainer can see why their payout used a different percentage than
 * their accuracy score alone would suggest (see AGENTS.md quality-gate
 * notes: noise/quality/liveness blend into payout, never gate submission).
 */
function qualityBreakdownTitle(submission: TrainerSubmissionSummary): string | undefined {
  if (submission.compositeScore === null) return undefined;
  const parts = [
    `Transcript/exact-match: ${submission.score !== null ? Number(submission.score).toFixed(1) : '—'}%`,
  ];
  if (submission.noiseScore !== null)
    parts.push(`Background noise: ${Number(submission.noiseScore).toFixed(1)}%`);
  if (submission.qualityScore !== null)
    parts.push(`Audio quality: ${Number(submission.qualityScore).toFixed(1)}%`);
  if (submission.livenessScore !== null)
    parts.push(`Voice liveness: ${Number(submission.livenessScore).toFixed(1)}%`);
  parts.push(`Composite (used for payout): ${Number(submission.compositeScore).toFixed(1)}%`);
  return parts.join('\n');
}

/** Maps a DomainConversationSubmissionSummary onto TrainerSubmissionSummary's shape so TaskRow/TaskCard/deriveTaskStatus can render either source without knowing which pipeline it came from. rawScore/score stay null -- there's no exact-match ground truth for a free-form conversation (see DomainConversationRecording's schema doc comment); audioUrl stays null since listMine doesn't return a signed playback URL for this kind yet, which TaskAudioButton already renders as an inert button. TRANSCRIBED never applies (no ASR/transcript step here), so it's simply never produced by this mapping. */
function domainConversationToSubmissionSummary(
  recording: DomainConversationSubmissionSummary,
): TrainerSubmissionSummary {
  return {
    id: recording.id,
    promptText: `${recording.prompt.domain}: ${recording.prompt.text}`,
    dialectTag: recording.dialectTag,
    status: recording.status,
    tokensSpent: recording.tokensSpent,
    rawScore: null,
    score: null,
    noiseScore: recording.noiseScore,
    qualityScore: recording.qualityScore,
    livenessScore: recording.livenessScore,
    compositeScore: recording.compositeScore,
    payoutTokenAmount: recording.payoutTokenAmount,
    audioUrl: null,
    rejectionReason: recording.rejectionReason,
    createdAt: recording.createdAt,
    scoredAt: recording.scoredAt,
    settledAt: recording.settledAt,
  };
}

/**
 * Two independent task pipelines feed My Tasks/My Scores: Word-training
 * WordRecordings (scored via exact-match / peer reverse-validation -- see
 * WordRecording's doc comment in schema.prisma) and Domain Conversation
 * DomainConversationRecordings (scored via noise/quality/liveness only, no
 * exact-match concept). Merged here so both pipelines' history/rewards show
 * up together in one "Submitted tasks"/"My scores" list instead of the
 * Domain Conversation half being invisible.
 */
const MERGE_FETCH_PAGE_SIZE = 50;

export function useMergedSubmissions(
  status: TrainerSubmissionSummary['status'][],
  page: number,
  pageSize: number,
  pollingInterval?: number,
) {
  const wordRecordings = useGetMyWordRecordingsQuery(
    { page: 1, pageSize: MERGE_FETCH_PAGE_SIZE, status },
    { pollingInterval },
  );
  const domainConversationStatus = status.filter(
    (s): s is DomainConversationSubmissionSummary['status'] => s !== 'TRANSCRIBED',
  );
  const domainConversations = useGetMyDomainConversationRecordingsQuery(
    { page: 1, pageSize: MERGE_FETCH_PAGE_SIZE, status: domainConversationStatus },
    { pollingInterval },
  );

  const isLoading = wordRecordings.isLoading || domainConversations.isLoading;
  const isFetching = wordRecordings.isFetching || domainConversations.isFetching;
  const isError = wordRecordings.isError && domainConversations.isError;

  const merged = [
    ...(wordRecordings.data?.items ?? []),
    ...(domainConversations.data?.items.map(domainConversationToSubmissionSummary) ?? []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = merged.slice((page - 1) * pageSize, page * pageSize);

  function refetch() {
    void wordRecordings.refetch();
    void domainConversations.refetch();
  }

  return { items, total, totalPages, isLoading, isFetching, isError, refetch };
}

function MyTasksView() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { items, total, totalPages, isLoading, isFetching, isError, refetch } =
    useMergedSubmissions(['PENDING', 'TRANSCRIBED'], page, pageSize, 10000);
  const now = Date.now();
  const scoringSlaLabel = formatDurationLabel(useScoringSlaMs());

  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-4">
        <span className="grid size-9 place-items-center rounded-lg bg-[#e8f0fe] text-[#3B6DF0]">
          <Clock3 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-black">Submitted tasks</h3>
          <p className="text-sm text-muted">
            Reverse-validation scoring completes once a peer trainer validates your recording,
            typically within {scoringSlaLabel}.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid min-h-52 place-items-center" role="status">
          <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
          <span className="sr-only">Loading tasks</span>
        </div>
      ) : isError ? (
        <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
          <p className="font-extrabold">Could not load your tasks.</p>
          <button
            className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
            onClick={() => void refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : items.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <caption className="sr-only">Your submitted tasks</caption>
              <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                <tr>
                  <th className="px-5 py-3.5" scope="col">
                    Prompt
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Dialect
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Status
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Time to scoring
                  </th>
                  <th className="px-5 py-3.5 text-right" scope="col">
                    Est. reward
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((submission) => (
                  <TaskRow key={submission.id} now={now} submission={submission} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {items.map((submission) => (
              <TaskCard key={submission.id} now={now} submission={submission} />
            ))}
          </div>
        </>
      ) : (
        <EmptyPanel
          actionHref="/dashboard?view=training"
          actionLabel="Start training"
          icon={Headphones}
          title="No tasks submitted yet"
          unframed
        />
      )}

      {total > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
          <p className="text-sm font-bold text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              aria-label="Next page"
              className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TaskCountdownCell({ submission }: { submission: TrainerSubmissionSummary }) {
  const slaMs = useScoringSlaMs();
  const deadline = new Date(submission.createdAt).getTime() + slaMs;
  const remaining = useCountdown(deadline);
  const finalized =
    submission.status === 'SCORED' ||
    submission.status === 'SETTLED' ||
    submission.status === 'REJECTED';
  if (finalized) return <span className="text-muted">—</span>;
  if (remaining <= 0) return <span className="font-bold text-danger">Expired</span>;
  return <span className="font-mono font-bold">{formatCountdown(remaining)}</span>;
}

let activeTaskAudio: HTMLAudioElement | null = null;

function TaskAudioButton({ audioUrl, label }: { audioUrl: string | null; label: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (activeTaskAudio === audioRef.current) activeTaskAudio = null;
      }
    },
    [],
  );

  function stopAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setIsLoading(false);
    if (activeTaskAudio === audio) activeTaskAudio = null;
  }

  async function togglePlayback() {
    if (!audioUrl) return;
    if (isPlaying || isLoading) {
      stopAudio();
      return;
    }

    activeTaskAudio?.pause();
    if (activeTaskAudio) activeTaskAudio.currentTime = 0;

    const audio = audioRef.current ?? new Audio(audioUrl);
    audioRef.current = audio;
    audio.src = audioUrl;
    audio.currentTime = 0;
    audio.onended = () => {
      setIsPlaying(false);
      setIsLoading(false);
      if (activeTaskAudio === audio) activeTaskAudio = null;
    };
    audio.onpause = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };
    audio.onerror = () => {
      setIsPlaying(false);
      setIsLoading(false);
      if (activeTaskAudio === audio) activeTaskAudio = null;
    };

    try {
      setIsLoading(true);
      activeTaskAudio = audio;
      await audio.play();
      setIsPlaying(true);
    } catch {
      if (activeTaskAudio === audio) activeTaskAudio = null;
    } finally {
      setIsLoading(false);
    }
  }

  const title = audioUrl
    ? `${isPlaying || isLoading ? 'Stop' : 'Play'} recording for ${label}`
    : 'Recording unavailable';

  return (
    <button
      aria-label={title}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-accent shadow-sm transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!audioUrl}
      onClick={togglePlayback}
      title={title}
      type="button"
    >
      {isPlaying || isLoading ? (
        <Square className="size-4 fill-current" aria-hidden="true" />
      ) : (
        <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
      )}
    </button>
  );
}

export function TaskRow({
  submission,
  now,
}: {
  submission: TrainerSubmissionSummary;
  now: number;
}) {
  const displayStatus = deriveTaskStatus(submission, now, useScoringSlaMs());
  const dialectName = useDialectName(submission.dialectTag);
  return (
    <tr className="hover:bg-surface-muted/60">
      <td className="max-w-64 px-5 py-4" title={submission.promptText}>
        <div className="flex min-w-0 items-center gap-3">
          <TaskAudioButton audioUrl={submission.audioUrl} label={submission.promptText} />
          <span className="min-w-0 truncate font-bold">{submission.promptText}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-muted">{dialectName}</td>
      <td className="px-5 py-4">
        <span
          className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${taskStatusTones[displayStatus]}`}
        >
          {taskStatusLabels[displayStatus]}
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-4">
        <TaskCountdownCell submission={submission} />
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-muted">
        {submission.payoutTokenAmount !== null
          ? `+${formatTokens(submission.payoutTokenAmount)} DL`
          : estimatedReward(submission.tokensSpent)}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-muted">
        {formatDateTime(submission.createdAt)}
      </td>
    </tr>
  );
}

export function TaskCard({
  submission,
  now,
}: {
  submission: TrainerSubmissionSummary;
  now: number;
}) {
  const displayStatus = deriveTaskStatus(submission, now, useScoringSlaMs());
  const dialectName = useDialectName(submission.dialectTag);
  const finalized =
    submission.status === 'SCORED' ||
    submission.status === 'SETTLED' ||
    submission.status === 'REJECTED';
  return (
    <article className="grid gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TaskAudioButton audioUrl={submission.audioUrl} label={submission.promptText} />
          <p className="min-w-0 truncate font-bold" title={submission.promptText}>
            {submission.promptText}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-extrabold ${taskStatusTones[displayStatus]}`}
        >
          {taskStatusLabels[displayStatus]}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-muted">
            {dialectName} &middot; {formatDateTime(submission.createdAt)}
          </p>
          {!finalized && (
            <p className="font-bold">
              Time to scoring: <TaskCountdownCell submission={submission} />
            </p>
          )}
        </div>
        <span className="shrink-0 font-black text-muted">
          {submission.payoutTokenAmount !== null
            ? `+${formatTokens(submission.payoutTokenAmount)}`
            : estimatedReward(submission.tokensSpent)}
        </span>
      </div>
    </article>
  );
}

const MARKETING_AD_FORMATS: {
  id: MarketingAdFormat;
  label: string;
  dimensions: string;
  aspectClass: string;
}[] = [
  {
    id: 'FEED_SQUARE',
    label: 'Feed post',
    dimensions: '1080 x 1080',
    aspectClass: 'aspect-square',
  },
  {
    id: 'STORY',
    label: 'Story or status',
    dimensions: '1080 x 1920',
    aspectClass: 'aspect-[9/16]',
  },
  {
    id: 'LINK_PREVIEW',
    label: 'Link preview',
    dimensions: '1200 x 630',
    aspectClass: 'aspect-[1.91/1]',
  },
];

const REFERRAL_SHARE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://www.dialectlibrary.com';

function MarketingView({ data, email }: { data: TrainerDashboardSummary; email: string }) {
  const [copied, setCopied] = useState(false);
  const [referralLink, setReferralLink] = useState(
    `${REFERRAL_SHARE_ORIGIN}/register?ref=${data.referrals.code}`,
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitationPage, setInvitationPage] = useState(1);
  const [sendReferralInvite, { isLoading: inviteSending }] = useSendReferralInviteMutation();
  const { data: invitations, isFetching: invitationsLoading } = useGetReferralInvitationsQuery({
    page: invitationPage,
    pageSize: 5,
  });

  useEffect(() => {
    setReferralLink(`${REFERRAL_SHARE_ORIGIN}/register?ref=${data.referrals.code}`);
  }, [data.referrals.code]);

  async function copyLink() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteMessage(null);
    setInviteError(null);

    try {
      await sendReferralInvite({
        firstName: inviteFirstName.trim(),
        email: inviteEmail.trim(),
      }).unwrap();
      setInviteMessage('Invitation sent successfully.');
      setInviteFirstName('');
      setInviteEmail('');
      setInvitationPage(1);
      setInviteOpen(false);
    } catch (err) {
      setInviteError(normalizeErrorMessage(err, 'Unable to send invitation right now.'));
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <ViewHeading
          title="Referrals"
          subtitle="Your invitations and credited lifetime referral bonuses."
        />
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark">
              Invite
            </button>
          </DialogTrigger>
          <DialogContent title="Invite a trainer" description="Send one referral invite at a time.">
            <form className="grid gap-3" onSubmit={handleInviteSubmit}>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="invite-first-name">
                  First name
                </label>
                <input
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted"
                  id="invite-first-name"
                  maxLength={80}
                  onChange={(e) => setInviteFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  type="text"
                  value={inviteFirstName}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="invite-email">
                  Email
                </label>
                <input
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted"
                  id="invite-email"
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  type="email"
                  value={inviteEmail}
                />
              </div>
              {inviteError && (
                <p className="text-sm font-bold text-danger" role="alert">
                  {inviteError}
                </p>
              )}
              <ActionButton
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                pending={inviteSending}
                pendingLabel="Sending"
                type="submit"
              >
                Send invite
              </ActionButton>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {inviteMessage && <p className="mb-4 text-sm font-bold text-emerald-700">{inviteMessage}</p>}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Referral summary">
        <MetricCard
          icon={Users}
          label="People invited"
          value={data.referrals.invitedCount.toLocaleString()}
          tone="purple"
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Bonus earned"
          value={formatCompactTokensLabel(data.referralEarningsTokens)}
          tone="green"
          compact
        />
        <MetricCard
          icon={BadgeCheck}
          label="Referral code"
          value={data.referrals.code}
          tone="blue"
          compact
        />
      </section>
      <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className={`${cardClass} p-5`}>
          <h3 className="text-lg font-black">Invitation link</h3>
          <p className="mt-1 text-sm text-muted">Signed in as {email}</p>
          <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-muted p-2 pl-3">
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{referralLink}</span>
            <button
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white"
              onClick={copyLink}
              type="button"
              title="Copy invitation link"
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              <span className="sr-only">{copied ? 'Copied' : 'Copy invitation link'}</span>
            </button>
          </div>
        </div>
        <div className={`${cardClass} grid gap-4 p-5`}>
          <RateRow
            enabled={data.referrals.fundingBonusEnabled}
            label="Funding bonus"
            rate={data.referrals.fundingBonusRate}
          />
          <RateRow
            enabled={data.referrals.payoutBonusEnabled}
            label="Training payout bonus"
            rate={data.referrals.payoutBonusRate}
          />
        </div>
      </section>
      <section className="mt-8">
        <SectionTitle
          title="Invitations"
          subtitle="People invited or registered under your referral network."
        />
        {invitationsLoading && !invitations ? (
          <div className={`${cardClass} p-5 text-sm font-bold text-muted`}>
            Loading invitations...
          </div>
        ) : invitations?.items.length ? (
          <div className={`${cardClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs font-black uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Invitee</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invitations.items.map((invite) => (
                    <tr key={invite.id}>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[210px] items-center gap-3">
                          <Avatar email={invite.email} />
                          <div className="min-w-0">
                            <p className="truncate font-extrabold">
                              {invite.firstName ?? invite.email}
                            </p>
                            <p className="truncate text-xs text-muted">{invite.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            invite.status === 'JOINED'
                              ? 'inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800'
                              : 'inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800'
                          }
                        >
                          {invite.status === 'JOINED' ? 'Joined' : 'Invited'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {formatDate(invite.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
              <span>
                Page {invitations.page} of {invitations.totalPages} ({invitations.total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={invitations.page <= 1 || invitationsLoading}
                  onClick={() => setInvitationPage((page) => Math.max(1, page - 1))}
                  title="Previous invitation page"
                  type="button"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  <span className="sr-only">Previous invitation page</span>
                </button>
                <button
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={invitations.page >= invitations.totalPages || invitationsLoading}
                  onClick={() =>
                    setInvitationPage((page) => Math.min(invitations.totalPages, page + 1))
                  }
                  title="Next invitation page"
                  type="button"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                  <span className="sr-only">Next invitation page</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyPanel
            icon={Users}
            title="No invitations yet"
            actionHref={undefined}
            actionLabel={undefined}
          />
        )}
      </section>
    </div>
  );
}

function CampaignsView({ referralCode }: { referralCode: string }) {
  const [activeFormat, setActiveFormat] = useState<MarketingAdFormat>('FEED_SQUARE');
  const [sharePhotoId, setSharePhotoId] = useState<string | null>(null);
  const [shareHeadlineId, setShareHeadlineId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const { data: materials } = useGetMarketingMaterialsQuery(activeFormat);
  const { data: myShares } = useGetMyMarketingSharesQuery();
  const [createCampaignShare, { isLoading: shareCreating }] = useCreateCampaignShareMutation();

  useEffect(() => {
    setSharePhotoId(null);
    setShareHeadlineId(materials?.headlines[0]?.id ?? null);
  }, [activeFormat, materials?.headlines]);

  const selectedPhoto = materials?.photos.find((photo) => photo.id === sharePhotoId) ?? null;
  const selectedHeadline = materials?.headlines.find((h) => h.id === shareHeadlineId) ?? null;

  async function openShareDialog(photoId: string) {
    setShareError(null);
    setSharePhotoId(photoId);
    const headlineId = shareHeadlineId ?? materials?.headlines[0]?.id;
    if (!headlineId) return;
    try {
      const share = await createCampaignShare({ photoId, headlineId }).unwrap();
      setShareLink(
        `${REFERRAL_SHARE_ORIGIN}/invite/${encodeURIComponent(referralCode)}/${share.id}`,
      );
    } catch (err) {
      setShareError(normalizeErrorMessage(err, 'Unable to create your campaign link right now.'));
    }
  }

  async function copyCampaignLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  }

  function openShare(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function shareNatively() {
    if (!shareLink || !navigator.share) return;
    await navigator.share({
      title: selectedHeadline?.title ?? 'Dialect Library',
      text: selectedHeadline?.description ?? '',
      url: shareLink,
    });
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <ViewHeading title="Campaigns" subtitle="Share materials and campaign performance." />
      </div>
      <section>
        <SectionTitle
          title="Share materials"
          subtitle="Pick a format sized for the social channel where you want to invite trainers, then choose a photo and headline."
        />
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Ad format">
          {MARKETING_AD_FORMATS.map((format) => (
            <button
              aria-selected={activeFormat === format.id}
              className={
                activeFormat === format.id
                  ? 'rounded-full bg-accent px-3.5 py-2 text-sm font-bold text-white'
                  : 'rounded-full border border-line bg-white px-3.5 py-2 text-sm font-bold hover:bg-surface-muted'
              }
              key={format.id}
              onClick={() => setActiveFormat(format.id)}
              role="tab"
              type="button"
            >
              {format.label} <span className="opacity-70">({format.dimensions})</span>
            </button>
          ))}
        </div>
        {materials && materials.headlines.length > 0 && (
          <div className="mb-4 grid gap-1">
            <label className="text-sm font-bold" htmlFor="marketing-headline">
              Headline
            </label>
            <select
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted"
              id="marketing-headline"
              onChange={(e) => setShareHeadlineId(e.target.value)}
              value={shareHeadlineId ?? ''}
            >
              {materials.headlines.map((headline) => (
                <option key={headline.id} value={headline.id}>
                  {headline.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {materials && materials.photos.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {materials.photos.map((photo) => {
              const format = MARKETING_AD_FORMATS.find((f) => f.id === photo.format);
              return (
                <article className={`${cardClass} overflow-hidden`} key={photo.id}>
                  <div
                    className={`relative overflow-hidden bg-surface-muted ${format?.aspectClass ?? 'aspect-square'}`}
                  >
                    <Image
                      alt="Ad photo"
                      className="object-cover"
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      src={photo.url}
                    />
                  </div>
                  <div className="grid gap-3 p-4">
                    <button
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3 py-2 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!shareHeadlineId || shareCreating}
                      onClick={() => void openShareDialog(photo.id)}
                      type="button"
                    >
                      <Share2 className="size-4" aria-hidden="true" />
                      Share campaign
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyPanel
            icon={Megaphone}
            title="No ad photos yet for this format"
            actionHref={undefined}
            actionLabel={undefined}
          />
        )}
      </section>
      <Dialog open={Boolean(selectedPhoto)} onOpenChange={(open) => !open && setSharePhotoId(null)}>
        <DialogContent
          title="Share your invitation"
          description="Share the campaign link with your referral code included."
        >
          {selectedPhoto && (
            <div className="grid gap-4">
              {selectedHeadline && (
                <div className="rounded-lg border border-line bg-surface-muted p-3">
                  <span className="block font-bold">{selectedHeadline.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {selectedHeadline.description}
                  </span>
                </div>
              )}
              {shareError && (
                <p className="text-sm font-bold text-danger" role="alert">
                  {shareError}
                </p>
              )}
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-muted p-2 pl-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {shareLink || 'Generating link...'}
                </span>
                <button
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!shareLink}
                  onClick={copyCampaignLink}
                  title="Copy campaign link"
                  type="button"
                >
                  {shareCopied ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">{shareCopied ? 'Copied' : 'Copy campaign link'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!shareLink}
                  onClick={() =>
                    openShare(
                      `https://wa.me/?text=${encodeURIComponent(`${selectedHeadline?.title ?? ''} ${shareLink}`)}`,
                    )
                  }
                  type="button"
                >
                  WhatsApp
                </button>
                <button
                  className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!shareLink}
                  onClick={() =>
                    openShare(
                      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`,
                    )
                  }
                  type="button"
                >
                  Facebook
                </button>
                <button
                  className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!shareLink}
                  onClick={() =>
                    openShare(
                      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareLink)}`,
                    )
                  }
                  type="button"
                >
                  LinkedIn
                </button>
                <button
                  className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!shareLink}
                  onClick={() =>
                    openShare(
                      `https://x.com/intent/post?text=${encodeURIComponent(`${selectedHeadline?.title ?? ''} ${shareLink}`)}`,
                    )
                  }
                  type="button"
                >
                  X
                </button>
              </div>
              {shareLink && typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 font-bold hover:bg-surface-muted"
                  onClick={() => void shareNatively()}
                  type="button"
                >
                  <Send className="size-4" aria-hidden="true" />
                  More sharing options
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <section className="mt-8">
        <SectionTitle
          title="Your campaigns"
          subtitle="Views and registrations for each photo + headline pairing you've shared."
        />
        {myShares && myShares.length > 0 ? (
          <div className={`${cardClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs font-black uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Format</th>
                    <th className="px-4 py-3">Views</th>
                    <th className="px-4 py-3">Registrations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {myShares.map((share) => (
                    <tr key={share.id}>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[220px] items-center gap-3">
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                            <Image
                              alt="Ad photo"
                              className="object-cover"
                              fill
                              src={share.photoUrl}
                            />
                          </div>
                          <span className="truncate font-extrabold">{share.headlineTitle}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {MARKETING_AD_FORMATS.find((f) => f.id === share.format)?.label ??
                          share.format}
                      </td>
                      <td className="px-4 py-3 font-bold">{share.viewCount.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold">
                        {share.registeredCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel
            icon={Megaphone}
            title="No campaigns shared yet"
            actionHref={undefined}
            actionLabel={undefined}
          />
        )}
      </section>
    </div>
  );
}

function TestimonialsView({ onGiveTestimony }: { onGiveTestimony: () => void }) {
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const { data: kycStatusData } = useGetKycStatusQuery();
  const [createKycSession, { isLoading: isStartingKyc }] = useCreateKycSessionMutation();
  const [cancelMyKyc, { isLoading: isCancellingKyc }] = useCancelMyKycMutation();
  const { data: myTestimonies, isLoading } = useListMyTestimoniesQuery(undefined, {
    skip: !publicSettings?.testimonyEnabled,
  });
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const kycStatus = kycStatusData?.kycStatus ?? 'NOT_STARTED';
  const testimonyEligible = kycStatus === 'APPROVED';

  async function startVerification() {
    setVerificationError(null);
    try {
      const session = await createKycSession().unwrap();
      setVerificationDialogOpen(false);
      window.location.assign(session.url);
    } catch (err) {
      setVerificationError(normalizeErrorMessage(err, 'Could not start DIDIT verification.'));
    }
  }

  async function cancelAndRetryVerification() {
    setVerificationError(null);
    try {
      await cancelMyKyc().unwrap();
      await startVerification();
    } catch (err) {
      setVerificationError(normalizeErrorMessage(err, 'Could not cancel your verification.'));
    }
  }

  const statusLabel: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
    PENDING: 'Awaiting review',
    APPROVED: 'Approved',
    REJECTED: 'Not approved',
  };
  const statusTone: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-rose-100 text-rose-800',
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <ViewHeading
          title="Testimonials"
          subtitle="Share your experience with Dialect Library, anytime -- every approved testimonial earns a DL reward."
        />
        {publicSettings?.testimonyEnabled && (
          <button
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark"
            onClick={() => {
              if (testimonyEligible) {
                onGiveTestimony();
              } else {
                setVerificationDialogOpen(true);
              }
            }}
            type="button"
          >
            <MessageSquareQuote className="size-4" aria-hidden="true" />
            Add Testimonial
          </button>
        )}
      </div>
      {!publicSettings?.testimonyEnabled ? (
        <EmptyPanel
          icon={MessageSquareQuote}
          title="Testimonials are not open right now"
          actionHref={undefined}
          actionLabel={undefined}
        />
      ) : !testimonyEligible ? (
        <section
          className={`${cardClass} grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center`}
        >
          <div>
            <h2 className="text-lg font-black">Verify your identity to submit a testimonial</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Testimonial rewards are available only after DIDIT approves your identity
              verification.
            </p>
            {kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW' ? (
              <p className="mt-2 text-sm font-bold text-amber-700">
                Your DIDIT verification is being reviewed.
              </p>
            ) : null}
            {verificationError && (
              <p className="mt-2 text-sm font-bold text-danger">{verificationError}</p>
            )}
          </div>
          <ActionButton
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setVerificationDialogOpen(true)}
            type="button"
          >
            {kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW'
              ? 'Verification status'
              : 'Verify identity'}
          </ActionButton>
        </section>
      ) : isLoading ? (
        <div className={`${cardClass} p-5 text-sm font-bold text-muted`}>Loading...</div>
      ) : myTestimonies && myTestimonies.length > 0 ? (
        <div className="grid gap-3">
          {myTestimonies.map((testimony) => (
            <div className={`${cardClass} grid gap-3 p-5`} key={testimony.id}>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-black ${statusTone[testimony.status]}`}
                >
                  {statusLabel[testimony.status]}
                </span>
                <span className="text-xs text-muted">{formatDate(testimony.createdAt)}</span>
              </div>
              {testimony.kind === 'TEXT' ? (
                <p className="text-sm italic text-ink">&ldquo;{testimony.text}&rdquo;</p>
              ) : (
                <p className="text-sm text-muted">Video testimony submitted.</p>
              )}
              {testimony.status === 'REJECTED' && testimony.rejectionReason && (
                <p className="text-sm text-muted">Reason: {testimony.rejectionReason}</p>
              )}
              {testimony.status === 'APPROVED' && testimony.rewardCredited && (
                <p className="text-sm font-bold text-emerald-700">
                  Your DL reward has been credited.
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={MessageSquareQuote}
          title="You haven't submitted a testimonial yet"
          actionHref={undefined}
          actionLabel={undefined}
        />
      )}
      <Dialog open={verificationDialogOpen} onOpenChange={setVerificationDialogOpen}>
        <DialogContent
          title="Identity verification required"
          description="Only DIDIT-verified trainers can submit a testimonial or receive its DL reward."
        >
          <div className="grid gap-4">
            {kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW' ? (
              <>
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                  Your DIDIT identity verification is already being reviewed. You can submit a
                  testimonial once it is approved. If this is stuck, you can cancel it and try
                  again.
                </p>
                {verificationError && (
                  <p className="text-sm font-bold text-danger">{verificationError}</p>
                )}
                <ActionButton
                  className="min-h-11 justify-center rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void cancelAndRetryVerification()}
                  pending={isCancellingKyc || isStartingKyc}
                  pendingLabel="Cancelling"
                  type="button"
                >
                  Cancel and retry verification
                </ActionButton>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted">
                  Complete the secure DIDIT ID and selfie check, then return here after approval to
                  continue.
                </p>
                {verificationError && (
                  <p className="text-sm font-bold text-danger">{verificationError}</p>
                )}
                <ActionButton
                  className="min-h-11 justify-center rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void startVerification()}
                  pending={isStartingKyc}
                  pendingLabel="Opening DIDIT"
                  type="button"
                >
                  Complete DIDIT verification
                </ActionButton>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProfileView({ session, update }: { session: Session; update: SessionUpdateFn }) {
  const [firstName, setFirstName] = useState(session.user.firstName ?? '');
  const [lastName, setLastName] = useState(session.user.lastName ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const { data: me } = useGetMeQuery();
  const { data: kycStatusData } = useGetKycStatusQuery();
  const [createKycSession, { isLoading: isStartingKyc }] = useCreateKycSessionMutation();
  const [cancelMyKyc, { isLoading: isCancellingKyc }] = useCancelMyKycMutation();
  const kycStatus = kycStatusData?.kycStatus ?? 'NOT_STARTED';

  async function startKycVerification() {
    setError(null);
    try {
      const session = await createKycSession().unwrap();
      window.location.href = session.url;
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not start identity verification.'));
    }
  }

  async function cancelAndRetryKycVerification() {
    setError(null);
    try {
      await cancelMyKyc().unwrap();
      await startKycVerification();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not cancel your verification.'));
    }
  }

  const { data: countries, isLoading: isLoadingCountries } = useGetCountriesQuery();
  const { data: payoutAccounts = [] } = useListPayoutAccountsQuery();
  const [deletingPayoutAccount, setDeletingPayoutAccount] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const { data: paymentInstructionsData } = useGetP2PPaymentInstructionsQuery();
  const [p2pPaymentInstructions, setP2pPaymentInstructions] = useState('');
  const [updateP2pPaymentInstructions, { isLoading: instructionsSaving }] =
    useUpdateP2PPaymentInstructionsMutation();
  useEffect(() => {
    setP2pPaymentInstructions(paymentInstructionsData?.p2pPaymentInstructions ?? '');
  }, [paymentInstructionsData?.p2pPaymentInstructions]);
  const instructionsDirty =
    p2pPaymentInstructions.trim() !== (paymentInstructionsData?.p2pPaymentInstructions ?? '');

  async function saveP2pPaymentInstructions(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateP2pPaymentInstructions({
        p2pPaymentInstructions: p2pPaymentInstructions.trim(),
      }).unwrap();
      setMessage('P2P payment instructions updated.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not update payment instructions.'));
    }
  }
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const phoneVerificationRequired = publicSettings?.phoneVerificationRequired ?? true;
  const manualPhoneVerificationEnabled = publicSettings?.manualPhoneVerificationEnabled ?? false;
  const manualPhoneVerificationFeeTokens = publicSettings?.manualPhoneVerificationFeeTokens ?? '1';
  const manualPhoneVerificationWhatsappNumber =
    publicSettings?.manualPhoneVerificationWhatsappNumber ?? '';
  const manualPhoneVerificationExpiryMinutes =
    publicSettings?.manualPhoneVerificationExpiryMinutes ?? 30;
  const phoneVerified = me?.phoneVerified ?? false;
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtpRequestId, setPhoneOtpRequestId] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneVerificationDialogOpen, setPhoneVerificationDialogOpen] = useState(false);
  const [phoneVerificationMode, setPhoneVerificationMode] = useState<'SMS' | 'WHATSAPP' | null>(
    null,
  );
  const [manualPhoneRequest, setManualPhoneRequest] =
    useState<ManualPhoneVerificationRequestResult | null>(null);
  const [manualPhoneCancelConfirm, setManualPhoneCancelConfirm] = useState(false);
  const [manualPhoneCodeCopied, setManualPhoneCodeCopied] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [requestPhoneOtp, { isLoading: phoneOtpSending }] = useRequestPhoneOtpMutation();
  const [verifyPhone, { isLoading: phoneVerifying }] = useVerifyPhoneMutation();
  const [savePhoneUnverified, { isLoading: phoneSaving }] = useSavePhoneUnverifiedMutation();
  const [requestManualPhoneVerification, { isLoading: manualPhoneRequesting }] =
    useRequestManualPhoneVerificationMutation();
  const [markManualPhoneVerificationSent, { isLoading: manualPhoneMarkingSent }] =
    useMarkManualPhoneVerificationSentMutation();
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const phoneValid = isValidPhoneNumber(normalizedPhoneNumber);
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotificationsEnabled: true,
    smsNotificationsEnabled: true,
    marketingNotificationsEnabled: false,
    blogNewsNotificationsEnabled: false,
    courseNotificationsEnabled: false,
  });
  const [notificationSaving, setNotificationSaving] = useState<NotificationPreferenceKey | null>(
    null,
  );

  const [originCountryId, setOriginCountryId] = useState('');
  const [countryId, setCountryId] = useState('');
  const [dialectId, setDialectId] = useState('');
  const [dialectVariantId, setDialectVariantId] = useState('');
  const [dialectMessage, setDialectMessage] = useState<string | null>(null);
  const [dialectError, setDialectError] = useState<string | null>(null);
  const { data: dialects, isLoading: isLoadingDialects } = useGetDialectsQuery(countryId, {
    skip: !countryId,
  });
  const { data: dialectVariants } = useGetDialectVariantsQuery(dialectId, { skip: !dialectId });
  const [updateDialectProfile, { isLoading: dialectSaving }] = useUpdateProfileMutation();

  useEffect(() => {
    if (!me) return;
    setOriginCountryId((current) => current || me.originCountryId || '');
    setCountryId((current) => current || me.countryId || '');
    setDialectId((current) => current || me.dialectId || '');
    setDialectVariantId((current) => current || me.dialectVariantId || '');
  }, [me]);

  const dialectDirty =
    originCountryId !== (me?.originCountryId ?? '') ||
    countryId !== (me?.countryId ?? '') ||
    dialectId !== (me?.dialectId ?? '') ||
    dialectVariantId !== (me?.dialectVariantId ?? '');

  function selectCountry(value: string) {
    setCountryId(value);
    setDialectId('');
    setDialectVariantId('');
  }

  function selectDialect(value: string) {
    setDialectId(value);
    setDialectVariantId('');
  }

  async function saveDialect(event: FormEvent) {
    event.preventDefault();
    setDialectMessage(null);
    setDialectError(null);
    if (!originCountryId || !countryId || !dialectId) {
      setDialectError('Choose your country of origin, training country, and dialect.');
      return;
    }
    if (!dialectVariantId) {
      setDialectError('Choose a subdialect.');
      return;
    }
    try {
      const profile = await updateDialectProfile({
        originCountryId,
        countryId,
        dialectId,
        dialectVariantId,
      }).unwrap();
      await update({
        dialectTag: profile.dialectTag,
        originCountryId: profile.originCountryId,
        countryId: profile.countryId,
      });
      setDialectMessage('Country of origin and dialect updated.');
    } catch (err) {
      setDialectError(normalizeErrorMessage(err, 'Unable to update your dialect.'));
    }
  }

  const dirty =
    firstName.trim() !== (session.user.firstName ?? '') ||
    lastName.trim() !== (session.user.lastName ?? '');

  useEffect(() => {
    if (me?.phoneNumber) setPhoneNumber(me.phoneNumber);
  }, [me?.phoneNumber]);

  useEffect(() => {
    if (!me) return;
    setNotificationPrefs({
      emailNotificationsEnabled: me.emailNotificationsEnabled,
      smsNotificationsEnabled: me.smsNotificationsEnabled,
      marketingNotificationsEnabled: me.marketingNotificationsEnabled,
      blogNewsNotificationsEnabled: me.blogNewsNotificationsEnabled,
      courseNotificationsEnabled: me.courseNotificationsEnabled,
    });
  }, [
    me?.emailNotificationsEnabled,
    me?.smsNotificationsEnabled,
    me?.marketingNotificationsEnabled,
    me?.blogNewsNotificationsEnabled,
    me?.courseNotificationsEnabled,
  ]);

  function updatePhoneField(value: string) {
    setPhoneNumber(normalizePhoneNumber(value));
    setPhoneOtpRequestId('');
    setPhoneOtpCode('');
    setManualPhoneRequest(null);
    setPhoneVerificationMode(null);
  }

  async function sendPhoneOtp() {
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      const otp = await requestPhoneOtp({ phoneNumber: normalizedPhoneNumber }).unwrap();
      setPhoneOtpRequestId(otp.otpRequestId);
      setPhoneOtpCode('');
      setPhoneMessage('Verification code sent by SMS.');
    } catch (err) {
      setPhoneError(normalizeErrorMessage(err, 'Could not send verification code.'));
    }
  }

  async function confirmPhoneCode() {
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      if (!phoneOtpRequestId) {
        await sendPhoneOtp();
        return;
      }
      await verifyPhone({
        phoneNumber: normalizedPhoneNumber,
        otpRequestId: phoneOtpRequestId,
        code: phoneOtpCode.trim(),
      }).unwrap();
      setPhoneOtpRequestId('');
      setPhoneOtpCode('');
      setPhoneMessage('Phone number verified.');
      setPhoneVerificationDialogOpen(false);
    } catch (err) {
      setPhoneError(normalizeErrorMessage(err, 'Could not verify phone number.'));
    }
  }

  async function startManualPhoneVerification() {
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      const result = await requestManualPhoneVerification({
        phoneNumber: normalizedPhoneNumber,
      }).unwrap();
      setManualPhoneRequest(result);
      setPhoneVerificationMode('WHATSAPP');
      setPhoneMessage(
        `Manual verification started. ${result.feeTokenAmount} DL will be charged once verified.`,
      );
    } catch (err) {
      setPhoneError(normalizeErrorMessage(err, 'Could not start manual verification.'));
    }
  }

  async function confirmManualPhoneSent() {
    if (!manualPhoneRequest) return;
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      await markManualPhoneVerificationSent(manualPhoneRequest.requestId).unwrap();
      setPhoneMessage('Manual verification is pending admin review.');
      setPhoneVerificationDialogOpen(false);
      setManualPhoneRequest(null);
      setManualPhoneCancelConfirm(false);
    } catch (err) {
      setPhoneError(normalizeErrorMessage(err, 'Could not mark this request as sent.'));
    }
  }

  /** Abandons a generated-but-unsent code -- the only way out of the dialog besides marking it sent, since the dialog itself can no longer be dismissed once a code exists. */
  function cancelManualPhoneVerification() {
    setManualPhoneRequest(null);
    setManualPhoneCancelConfirm(false);
    setPhoneVerificationMode(null);
    setPhoneVerificationDialogOpen(false);
  }

  /** Only reachable while phoneVerificationRequired is off -- see GeneralSettingsPanel's toggle. */
  async function savePhoneNumberWithoutVerification() {
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      await savePhoneUnverified({ phoneNumber: normalizedPhoneNumber }).unwrap();
      setPhoneMessage('Phone number saved.');
    } catch (err) {
      setPhoneError(normalizeErrorMessage(err, 'Could not save phone number.'));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const profile = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      }).unwrap();
      await update({ firstName: profile.firstName, lastName: profile.lastName });
      setMessage('Profile updated.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save your profile.'));
    }
  }

  async function toggleNotificationPreference(key: NotificationPreferenceKey, value: boolean) {
    setMessage(null);
    setError(null);
    setNotificationSaving(key);
    const previous = notificationPrefs[key];
    setNotificationPrefs((current) => ({ ...current, [key]: value }));
    try {
      await updateProfile({ [key]: value }).unwrap();
      setMessage('Notification preferences updated.');
    } catch (err) {
      setNotificationPrefs((current) => ({ ...current, [key]: previous }));
      setError(normalizeErrorMessage(err, 'Could not update notification preferences.'));
    } finally {
      setNotificationSaving(null);
    }
  }

  return (
    <div>
      <ViewHeading title="Profile" subtitle="Your account details." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <form className={`${cardClass} grid gap-4 p-5`} onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold">
              First name
              <input
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                maxLength={80}
                onChange={(event) => setFirstName(event.target.value)}
                required
                value={firstName}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              Last name
              <input
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                maxLength={80}
                onChange={(event) => setLastName(event.target.value)}
                required
                value={lastName}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-bold">
            Email
            <input
              className="min-h-11 rounded-lg border border-line bg-surface-muted px-3 text-muted"
              disabled
              value={session.user.email ?? ''}
            />
            <span className="text-xs font-medium text-muted">
              Email can&apos;t be changed here.
            </span>
          </label>
          {message && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}
          <div>
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!dirty}
              pending={isLoading}
              pendingLabel="Saving"
              type="submit"
            >
              Save changes
            </ActionButton>
          </div>
        </form>

        <EmailVerificationCard
          email={session.user.email ?? ''}
          emailVerified={me?.emailVerified ?? false}
        />

        <form
          className={`${cardClass} grid gap-4 p-5`}
          onSubmit={(event) => event.preventDefault()}
        >
          <SectionTitle
            title="Phone number"
            subtitle={
              phoneVerified
                ? 'Verified. Required for payment methods and P2P trading.'
                : phoneVerificationRequired
                  ? 'Verify by SMS before adding a payment method or trading on the P2P market.'
                  : 'Phone verification is optional right now. You can save a number without verifying it, or verify it for payment methods, which still require SMS verification.'
            }
          />
          <label className="grid gap-1.5 text-sm font-bold">
            Phone number
            <PhoneInput
              className="phone-input-field"
              defaultCountry="ng"
              disableDialCodeAndPrefix
              showDisabledDialCodeAndPrefix
              disabled={phoneVerified}
              inputClassName="!min-h-11 !w-full !rounded-r-lg !border !border-line !bg-surface !text-ink !outline-none focus:!border-accent"
              inputProps={{
                inputMode: 'numeric',
                placeholder: 'Mobile number',
              }}
              countrySelectorStyleProps={{
                buttonClassName:
                  '!min-h-11 !rounded-l-lg !rounded-r-none !border !border-line !border-r-0 !bg-surface !pl-3',
                buttonContentWrapperClassName: '!gap-1.5',
                flagClassName: '!m-0',
              }}
              dialCodePreviewStyleProps={{
                className:
                  '!min-h-11 !items-center !border !border-line !border-r-0 !bg-surface !px-2 !font-extrabold !text-muted',
              }}
              onChange={updatePhoneField}
              value={phoneNumber}
            />
          </label>
          {phoneVerified && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              This number is verified.
            </p>
          )}
          {phoneMessage && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {phoneMessage}
            </p>
          )}
          {phoneError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {phoneError}
            </p>
          )}
          {!phoneVerified && (
            <div className="flex flex-wrap gap-2">
              {!phoneVerificationRequired && (
                <ActionButton
                  className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!phoneValid}
                  onClick={() => void savePhoneNumberWithoutVerification()}
                  pending={phoneSaving}
                  pendingLabel="Saving"
                  type="button"
                >
                  Save number
                </ActionButton>
              )}
              <Dialog
                open={phoneVerificationDialogOpen}
                onOpenChange={(open) => {
                  // Once a WhatsApp code has been generated, this dialog can
                  // only close via "I have sent the WhatsApp message" or the
                  // explicit cancel-confirmation below -- otherwise a code
                  // gets generated and silently abandoned unsent, which is
                  // exactly the gap that let requests pile up with nothing
                  // ever showing up for admin review.
                  if (!open && manualPhoneRequest) {
                    setManualPhoneCancelConfirm(true);
                    return;
                  }
                  setPhoneVerificationDialogOpen(open);
                  if (!open) {
                    setPhoneVerificationMode(null);
                    setManualPhoneRequest(null);
                    setManualPhoneCancelConfirm(false);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <ActionButton
                    className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!phoneValid}
                    type="button"
                  >
                    Verify mobile
                  </ActionButton>
                </DialogTrigger>
                <DialogContent
                  title="Verify mobile"
                  description="Choose how you want to verify this number."
                  preventClose={Boolean(manualPhoneRequest)}
                >
                  <div className="grid gap-4">
                    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-bold text-muted">
                      {normalizedPhoneNumber}
                    </div>
                    {!phoneVerificationMode && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          className="grid min-h-28 gap-2 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-surface-muted"
                          onClick={() => setPhoneVerificationMode('SMS')}
                          type="button"
                        >
                          <span className="font-black">SMS OTP Method</span>
                          <span className="text-sm leading-relaxed text-muted">
                            Receive the normal one-time code by SMS.
                          </span>
                        </button>
                        <button
                          className="grid min-h-28 gap-2 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!manualPhoneVerificationEnabled}
                          onClick={() => setPhoneVerificationMode('WHATSAPP')}
                          type="button"
                        >
                          <span className="font-black">WhatsApp Method</span>
                          <span className="text-sm leading-relaxed text-muted">
                            Get a code to send to WhatsApp for admin review --{' '}
                            {manualPhoneVerificationFeeTokens} DL is charged once verified.
                          </span>
                        </button>
                      </div>
                    )}
                    {phoneVerificationMode === 'SMS' && (
                      <div className="grid gap-3">
                        <ActionButton
                          className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!phoneValid}
                          onClick={() => void sendPhoneOtp()}
                          pending={phoneOtpSending}
                          pendingLabel="Sending"
                          type="button"
                        >
                          {phoneOtpRequestId ? 'Resend code' : 'Send code'}
                        </ActionButton>
                        {phoneOtpRequestId && (
                          <label className="grid gap-1.5 text-sm font-bold">
                            SMS verification code
                            <input
                              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                              inputMode="numeric"
                              maxLength={6}
                              onChange={(event) => setPhoneOtpCode(event.target.value)}
                              value={phoneOtpCode}
                            />
                          </label>
                        )}
                        <ActionButton
                          className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!phoneValid || !phoneOtpRequestId || !phoneOtpCode.trim()}
                          onClick={() => void confirmPhoneCode()}
                          pending={phoneVerifying}
                          pendingLabel="Verifying"
                          type="button"
                        >
                          Verify
                        </ActionButton>
                      </div>
                    )}
                    {phoneVerificationMode === 'WHATSAPP' && (
                      <div className="grid gap-3">
                        {!manualPhoneRequest ? (
                          <>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                              {manualPhoneVerificationFeeTokens} DL will be charged from your
                              balance once an admin verifies your code -- make sure you have enough
                              DL before sending your WhatsApp message.
                            </div>
                            <ActionButton
                              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={!phoneValid || !manualPhoneVerificationEnabled}
                              onClick={() => void startManualPhoneVerification()}
                              pending={manualPhoneRequesting}
                              pendingLabel="Starting"
                              type="button"
                            >
                              Confirm and show code
                            </ActionButton>
                          </>
                        ) : manualPhoneCancelConfirm ? (
                          <div className="grid gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                            <p className="font-black text-amber-900 dark:text-amber-200">
                              Leave without sending?
                            </p>
                            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                              Your code hasn&apos;t been sent to WhatsApp yet, so this request can
                              never be reviewed. If you close now, you&apos;ll need to start over.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="min-h-10 rounded-lg border border-line bg-white px-4 font-extrabold text-ink hover:bg-surface-muted dark:bg-surface"
                                onClick={() => setManualPhoneCancelConfirm(false)}
                                type="button"
                              >
                                Go back, I&apos;ll send it
                              </button>
                              <button
                                className="min-h-10 rounded-lg border border-red-200 bg-white px-4 font-extrabold text-danger hover:bg-red-50 dark:bg-surface"
                                onClick={cancelManualPhoneVerification}
                                type="button"
                              >
                                Discard code and close
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-3 rounded-lg border-2 border-accent bg-accent/5 p-4">
                              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-accent">
                                <MessageSquareQuote className="size-4" />
                                Step required: send this code to WhatsApp
                              </div>
                              <div className="flex items-center justify-center gap-3 rounded-lg bg-white p-4 dark:bg-surface">
                                <span className="text-4xl font-black tracking-[0.2em] text-ink">
                                  {manualPhoneRequest.code}
                                </span>
                                <button
                                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                                  aria-label="Copy code"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(manualPhoneRequest.code);
                                    setManualPhoneCodeCopied(true);
                                    setTimeout(() => setManualPhoneCodeCopied(false), 1500);
                                  }}
                                  type="button"
                                >
                                  {manualPhoneCodeCopied ? (
                                    <Check className="size-4" />
                                  ) : (
                                    <Copy className="size-4" />
                                  )}
                                </button>
                              </div>
                              <p className="text-sm leading-relaxed text-ink">
                                Open WhatsApp and text{' '}
                                <span className="font-black">{manualPhoneRequest.code}</span> to{' '}
                                <span className="font-black">
                                  {manualPhoneRequest.whatsappNumber ||
                                    manualPhoneVerificationWhatsappNumber}
                                </span>
                                . This code expires in {manualPhoneVerificationExpiryMinutes}{' '}
                                minutes.
                              </p>
                              <p className="text-xs font-bold text-muted">
                                An admin can only review your request after you confirm below that
                                the message was actually sent -- this dialog stays open until then.
                              </p>
                            </div>
                            <ActionButton
                              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void confirmManualPhoneSent()}
                              pending={manualPhoneMarkingSent}
                              pendingLabel="Submitting"
                              type="button"
                            >
                              <Check className="mr-1.5 inline size-4" />
                              I have sent the WhatsApp message
                            </ActionButton>
                            <button
                              className="text-sm font-bold text-muted underline-offset-2 hover:text-danger hover:underline"
                              onClick={() => setManualPhoneCancelConfirm(true)}
                              type="button"
                            >
                              Cancel verification
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </form>

        <div className={`${cardClass} grid gap-4 p-5`}>
          <SectionTitle
            title="Identity verification"
            subtitle="A quick ID scan and selfie, verified by Didit -- required before your first withdrawal above the platform's threshold."
          />
          {kycStatus === 'APPROVED' ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              You&apos;re verified.
            </p>
          ) : kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW' ? (
            <>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Verification in progress -- we&apos;re reviewing your ID and selfie. If this is
                stuck, you can cancel it and try again.
              </p>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                  {error}
                </p>
              )}
              <ActionButton
                className="min-h-11 justify-self-start rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void cancelAndRetryKycVerification()}
                pending={isCancellingKyc || isStartingKyc}
                pendingLabel="Cancelling"
                type="button"
              >
                Cancel and retry verification
              </ActionButton>
            </>
          ) : (
            <>
              {(kycStatus === 'DECLINED' ||
                kycStatus === 'ABANDONED' ||
                kycStatus === 'EXPIRED') && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                  Your last verification didn&apos;t go through. Try again below.
                </p>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                  {error}
                </p>
              )}
              <ActionButton
                className="min-h-11 justify-self-start rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void startKycVerification()}
                pending={isStartingKyc}
                pendingLabel="Starting"
                type="button"
              >
                Verify now
              </ActionButton>
            </>
          )}
        </div>

        <div className={`${cardClass} grid gap-4 p-5`}>
          <SectionTitle
            title="Payout accounts"
            subtitle="One saved account list, used everywhere you receive money -- token withdrawals and P2P sales alike. Verified with your bank via Flutterwave."
          />
          {!phoneVerified && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Verify your phone number above before adding a payout account.
            </p>
          )}
          {payoutAccounts.length > 0 && (
            <ul className="grid gap-2">
              {payoutAccounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5"
                >
                  <div className="grid gap-0.5 overflow-hidden">
                    <span className="truncate font-extrabold text-ink">
                      {account.type === 'BANK'
                        ? (account.bankName ?? account.bankCode)
                        : account.type === 'MOBILE_MONEY'
                          ? account.mobileMoneyNetwork
                          : 'Stripe Connect'}
                      {account.isDefault && (
                        <span className="ml-2 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-extrabold text-accent-dark">
                          Default
                        </span>
                      )}
                    </span>
                    <span className="truncate text-sm text-muted">
                      {account.accountName ? `${account.accountName} · ` : ''}
                      {account.type === 'BANK'
                        ? account.accountNumberMasked
                        : account.type === 'MOBILE_MONEY'
                          ? account.mobileMoneyNumberMasked
                          : account.stripePayoutsEnabled
                            ? 'Onboarding complete'
                            : 'Onboarding not finished yet'}
                    </span>
                  </div>
                  <button
                    aria-label={`Remove ${
                      account.type === 'BANK'
                        ? (account.bankName ?? 'account')
                        : account.type === 'MOBILE_MONEY'
                          ? account.mobileMoneyNetwork
                          : 'Stripe Connect account'
                    }`}
                    className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-lg border border-line text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-950"
                    onClick={() =>
                      setDeletingPayoutAccount({
                        id: account.id,
                        label:
                          account.type === 'BANK'
                            ? (account.bankName ?? account.bankCode ?? 'this bank account')
                            : account.type === 'MOBILE_MONEY'
                              ? (account.mobileMoneyNumberMasked ?? 'this mobile money account')
                              : 'this Stripe Connect account',
                      })
                    }
                    type="button"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            className={`min-h-11 w-fit rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted ${!phoneVerified ? 'pointer-events-none opacity-60' : ''} inline-flex items-center`}
            href="/dashboard/payout-accounts"
          >
            + Add payout account
          </Link>
        </div>
        {deletingPayoutAccount && (
          <DeletePayoutAccountDialog
            account={deletingPayoutAccount}
            onClose={() => setDeletingPayoutAccount(null)}
          />
        )}

        <form className={`${cardClass} grid gap-4 p-5`} onSubmit={saveP2pPaymentInstructions}>
          <SectionTitle
            title="P2P payment note"
            subtitle="Shown to buyers on every P2P trade, no matter which of your bank accounts is used."
          />
          <label className="grid gap-1.5 text-sm font-bold">
            Notes <span className="font-normal text-muted">(optional)</span>
            <textarea
              className="min-h-20 resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
              onChange={(event) => setP2pPaymentInstructions(event.target.value)}
              placeholder="Anything a buyer should know before paying, e.g. preferred payment window or reference format"
              value={p2pPaymentInstructions}
            />
          </label>
          <ActionButton
            className="min-h-11 justify-self-start rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!instructionsDirty}
            pending={instructionsSaving}
            pendingLabel="Saving"
            type="submit"
          >
            Save note
          </ActionButton>
        </form>

        <form className={`${cardClass} grid gap-4 p-5`} onSubmit={saveDialect}>
          <SectionTitle
            title="Dialect"
            subtitle="Your country of origin identifies your account. Training country and dialect determine which words and prompts you receive."
          />
          <label className="grid gap-1.5 text-sm font-bold">
            Country of origin
            <select
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
              disabled={isLoadingCountries}
              onChange={(event) => setOriginCountryId(event.target.value)}
              required
              value={originCountryId}
            >
              <option value="">
                {isLoadingCountries ? 'Loading...' : 'Select your country of origin'}
              </option>
              {countries?.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Training country
            <select
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
              disabled={isLoadingCountries}
              onChange={(event) => selectCountry(event.target.value)}
              required
              value={countryId}
            >
              <option value="">{isLoadingCountries ? 'Loading...' : 'Select a country'}</option>
              {countries?.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Dialect
            <select
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!countryId || isLoadingDialects}
              onChange={(event) => selectDialect(event.target.value)}
              required
              value={dialectId}
            >
              <option value="">
                {!countryId
                  ? 'Select a training country first'
                  : isLoadingDialects
                    ? 'Loading...'
                    : 'Select a dialect'}
              </option>
              {dialects?.map((dialect) => (
                <option key={dialect.id} value={dialect.id}>
                  {dialect.name}
                </option>
              ))}
            </select>
          </label>
          {dialectId && (
            <label className="grid gap-1.5 text-sm font-bold">
              Subdialect
              <select
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!dialectVariants || dialectVariants.length === 0}
                onChange={(event) => setDialectVariantId(event.target.value)}
                required
                value={dialectVariantId}
              >
                <option value="">
                  {!dialectVariants || dialectVariants.length === 0
                    ? 'Loading...'
                    : 'Select a subdialect'}
                </option>
                {dialectVariants?.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {dialectMessage && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {dialectMessage}
            </p>
          )}
          {dialectError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {dialectError}
            </p>
          )}
          <div>
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!dialectDirty || !originCountryId || !countryId || !dialectId}
              pending={dialectSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save country and dialect
            </ActionButton>
          </div>
        </form>

        <div className={`${cardClass} grid content-start gap-4 p-5`}>
          <SectionTitle
            title="Notifications"
            subtitle="Choose how Dialect Library should reach you."
          />
          <div className="grid divide-y divide-line overflow-hidden rounded-lg border border-line">
            <NotificationToggleRow
              checked={notificationPrefs.emailNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Email"
              loading={notificationSaving === 'emailNotificationsEnabled'}
              onChange={(checked) =>
                void toggleNotificationPreference('emailNotificationsEnabled', checked)
              }
              subtitle="Account, task, payout, and security updates."
            />
            <NotificationToggleRow
              checked={notificationPrefs.smsNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="SMS"
              loading={notificationSaving === 'smsNotificationsEnabled'}
              onChange={(checked) =>
                void toggleNotificationPreference('smsNotificationsEnabled', checked)
              }
              subtitle="Urgent account and trade notifications."
            />
            <NotificationToggleRow
              checked={notificationPrefs.marketingNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Marketing"
              loading={notificationSaving === 'marketingNotificationsEnabled'}
              onChange={(checked) =>
                void toggleNotificationPreference('marketingNotificationsEnabled', checked)
              }
              subtitle="Product offers and campaign updates."
            />
            <NotificationToggleRow
              checked={notificationPrefs.blogNewsNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Blog & News"
              loading={notificationSaving === 'blogNewsNotificationsEnabled'}
              onChange={(checked) =>
                void toggleNotificationPreference('blogNewsNotificationsEnabled', checked)
              }
              subtitle="New articles and platform news."
            />
            <NotificationToggleRow
              checked={notificationPrefs.courseNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Courses"
              loading={notificationSaving === 'courseNotificationsEnabled'}
              onChange={(checked) =>
                void toggleNotificationPreference('courseNotificationsEnabled', checked)
              }
              subtitle="New learning courses and training guides."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type NotificationPreferenceKey =
  | 'emailNotificationsEnabled'
  | 'smsNotificationsEnabled'
  | 'marketingNotificationsEnabled'
  | 'blogNewsNotificationsEnabled'
  | 'courseNotificationsEnabled';

function NotificationToggleRow({
  checked,
  disabled,
  label,
  loading,
  onChange,
  subtitle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  loading: boolean;
  onChange: (checked: boolean) => void;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="font-extrabold text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>
      <button
        aria-checked={checked}
        aria-label={`${checked ? 'Disable' : 'Enable'} ${label} notifications`}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'border-accent bg-accent' : 'border-line bg-surface-muted'
        }`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`absolute top-1 grid size-5 place-items-center rounded-full bg-white text-accent shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        >
          {loading ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : null}
        </span>
      </button>
    </div>
  );
}

const submissionStatusLabels: Record<TrainerSubmissionSummary['status'], string> = {
  PENDING: 'Pending',
  TRANSCRIBED: 'Transcribed',
  REJECTED: 'Rejected',
  SCORED: 'Scored',
  SETTLED: 'Settled',
  EXPIRED: 'Not enough submissions — refunded',
};

const submissionStatusTones: Record<TrainerSubmissionSummary['status'], string> = {
  PENDING: 'bg-surface-muted text-muted',
  TRANSCRIBED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  REJECTED: 'bg-red-50 text-danger dark:bg-red-950',
  SCORED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  SETTLED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  EXPIRED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

function ScoresView() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { items, total, totalPages, isLoading, isFetching, isError, refetch } =
    useMergedSubmissions(['SCORED', 'SETTLED', 'REJECTED', 'EXPIRED'], page, pageSize, 10000);
  const { data: dialects } = useGetAllDialectsQuery();

  return (
    <div>
      <ViewHeading
        title="My Scores"
        subtitle="Consensus results from eligible voice training submissions."
      />
      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-[#fff0e8] text-[#b54b16] dark:bg-[#3a2119] dark:text-[#ff9b68]">
            <Star className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-black">Score history</h3>
            <p className="text-sm text-muted">Accuracy and review outcomes</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid min-h-52 place-items-center" role="status">
            <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
            <span className="sr-only">Loading score history</span>
          </div>
        ) : isError ? (
          <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
            <p className="font-extrabold">Could not load your submissions.</p>
            <button
              className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
              onClick={() => void refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : items.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <caption className="sr-only">Your submission history</caption>
                <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3.5" scope="col">
                      Prompt
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Dialect
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Status
                    </th>
                    <th className="px-5 py-3.5 text-right" scope="col">
                      Score
                    </th>
                    <th className="px-5 py-3.5 text-right" scope="col">
                      Payout (est.)
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((submission) => (
                    <tr className="hover:bg-surface-muted/60" key={submission.id}>
                      <td
                        className="max-w-64 truncate px-5 py-4 font-bold"
                        title={submission.promptText}
                      >
                        {submission.promptText}
                      </td>
                      <td className="px-5 py-4 text-muted">
                        {resolveDialectName(submission.dialectTag, dialects)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${submissionStatusTones[submission.status]}`}
                        >
                          {submissionStatusLabels[submission.status]}
                        </span>
                      </td>
                      <td
                        className="whitespace-nowrap px-5 py-4 text-right font-bold"
                        title={qualityBreakdownTitle(submission)}
                      >
                        {submission.score !== null
                          ? `${Number(submission.score).toFixed(1)}%`
                          : '—'}
                        {submission.compositeScore !== null &&
                          Number(submission.compositeScore).toFixed(1) !==
                            Number(submission.score).toFixed(1) && (
                            <span className="ml-1 font-normal text-muted">
                              ({Number(submission.compositeScore).toFixed(1)}% paid)
                            </span>
                          )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-black text-emerald-700 dark:text-emerald-300">
                        {submission.payoutTokenAmount !== null
                          ? `+${formatTokens(submission.payoutTokenAmount)}`
                          : submission.score !== null
                            ? `~${formatTokens(estimatedScoredPayout(submission.tokensSpent, submission.score))}`
                            : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted">
                        {formatDateTime(submission.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {items.map((submission) => (
                <article className="grid gap-3 p-4" key={submission.id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-bold" title={submission.promptText}>
                      {submission.promptText}
                    </p>
                    <span
                      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-extrabold ${submissionStatusTones[submission.status]}`}
                    >
                      {submissionStatusLabels[submission.status]}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-muted">
                        {resolveDialectName(submission.dialectTag, dialects)} &middot;{' '}
                        {formatDateTime(submission.createdAt)}
                      </p>
                      {submission.score !== null && (
                        <p className="font-bold" title={qualityBreakdownTitle(submission)}>
                          Score: {Number(submission.score).toFixed(1)}%
                          {submission.compositeScore !== null &&
                            Number(submission.compositeScore).toFixed(1) !==
                              Number(submission.score).toFixed(1) && (
                              <span className="font-normal text-muted">
                                {' '}
                                ({Number(submission.compositeScore).toFixed(1)}% paid)
                              </span>
                            )}
                        </p>
                      )}
                    </div>
                    {submission.payoutTokenAmount !== null ? (
                      <span className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">
                        +{formatTokens(submission.payoutTokenAmount)}
                      </span>
                    ) : submission.score !== null ? (
                      <span className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">
                        ~
                        {formatTokens(
                          estimatedScoredPayout(submission.tokensSpent, submission.score),
                        )}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel
            actionHref="/dashboard?view=training"
            actionLabel="Start training"
            icon={Headphones}
            title="No scored submissions yet"
            unframed
          />
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
            <p className="text-sm font-bold text-muted">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous page"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                aria-label="Next page"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                type="button"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

const FLUTTERWAVE_FUNDING_COUNTRIES: { code: string; currency: string; label: string }[] = [
  { code: 'NG', currency: 'NGN', label: 'Nigeria (NGN)' },
  { code: 'GH', currency: 'GHS', label: 'Ghana (GHS)' },
  { code: 'KE', currency: 'KES', label: 'Kenya (KES)' },
  { code: 'UG', currency: 'UGX', label: 'Uganda (UGX)' },
  { code: 'ZA', currency: 'ZAR', label: 'South Africa (ZAR)' },
  { code: 'TZ', currency: 'TZS', label: 'Tanzania (TZS)' },
];

const MOBILE_MONEY_NETWORKS = ['MTN', 'AIRTEL', 'VODAFONE', 'TIGO'];

function FundTokensDialog({
  tokenUsdRate,
  localCurrency,
}: {
  tokenUsdRate?: number;
  localCurrency?: LocalCurrency | null;
}) {
  const [method, setMethod] = useState<'crypto' | 'fiat'>('crypto');
  const [fiatMethod, setFiatMethod] = useState<'bank_transfer' | 'mobile_money'>('bank_transfer');
  const [amount, setAmount] = useState('100');
  const [currency, setCurrency] = useState<'USDC' | 'USDT'>('USDT');
  const [countryCode, setCountryCode] = useState(FLUTTERWAVE_FUNDING_COUNTRIES[0].code);
  const [mobileMoneyNetwork, setMobileMoneyNetwork] = useState(MOBILE_MONEY_NETWORKS[0]);
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [virtualAccount, setVirtualAccount] = useState<{
    depositId: string;
    accountNumber: string;
    bankName: string;
    note: string | null;
  } | null>(null);
  const [checkStatusMessage, setCheckStatusMessage] = useState<string | null>(null);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestDepositOtpMutation();
  const [createDeposit, { isLoading: isCreating }] = useCreateTokenDepositMutation();
  const [requestFlutterwaveOtp, { isLoading: isRequestingFlutterwaveOtp }] =
    useRequestFlutterwaveDepositOtpMutation();
  const [createFlutterwaveDeposit, { isLoading: isCreatingFlutterwave }] =
    useCreateFlutterwaveDepositMutation();
  const [checkFlutterwaveDepositStatus, { isLoading: isCheckingStatus }] =
    useCheckFlutterwaveDepositStatusMutation();
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const isV4Enabled = publicSettings?.isFlutterwaveV4Enabled ?? false;

  const selectedCountry =
    FLUTTERWAVE_FUNDING_COUNTRIES.find((c) => c.code === countryCode) ??
    FLUTTERWAVE_FUNDING_COUNTRIES[0];

  // The trainer types the DL amount they want to receive; the USD amount
  // actually sent to checkout (crypto or Flutterwave) is derived from the
  // live token/USD rate, same as WithdrawTokensDialog derives its USD
  // estimate from tokenAmount -- funding just runs that conversion in the
  // opposite direction since the backend's deposit endpoints take usdAmount.
  const tokenAmount = Number(amount) || 0;
  const usdAmount = tokenUsdRate ? tokenAmount * tokenUsdRate : 0;
  const localAmount = localCurrency ? usdAmount * Number(localCurrency.usdExchangeRate) : null;

  async function submitAmount(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      if (method === 'crypto') {
        const result = await requestOtp({ usdAmount, currency }).unwrap();
        setOtpRequestId(result.otpRequestId);
      } else {
        const result = await requestFlutterwaveOtp({
          usdAmount,
          currency: selectedCountry.currency,
        }).unwrap();
        setOtpRequestId(result.otpRequestId);
      }
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not send a confirmation code.'));
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!otpRequestId) return;
    setMessage(null);
    try {
      if (method === 'crypto') {
        const result = await createDeposit({
          usdAmount,
          currency,
          otpRequestId,
          code,
        }).unwrap();
        window.location.assign(result.hostedCheckoutUrl);
        return;
      }
      const result = await createFlutterwaveDeposit({
        usdAmount,
        currency: selectedCountry.currency,
        country: selectedCountry.code,
        ...(isV4Enabled
          ? {
              method: fiatMethod,
              ...(fiatMethod === 'mobile_money' ? { mobileMoneyNetwork, mobileMoneyNumber } : {}),
            }
          : {}),
        otpRequestId,
        code,
      }).unwrap();
      if ('hostedCheckoutUrl' in result) {
        window.location.assign(result.hostedCheckoutUrl);
      } else if ('redirectUrl' in result) {
        if (result.redirectUrl) window.location.assign(result.redirectUrl);
        else setMessage('Could not get a checkout link for this mobile money charge.');
      } else {
        setVirtualAccount({ depositId: result.depositId, ...result.virtualAccount });
      }
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not start DL funding.'));
    }
  }

  async function checkStatus() {
    if (!virtualAccount) return;
    setCheckStatusMessage(null);
    try {
      const result = await checkFlutterwaveDepositStatus(virtualAccount.depositId).unwrap();
      if (result.credited) {
        setCheckStatusMessage('Payment received -- your DL balance has been credited.');
      } else {
        setCheckStatusMessage(
          "We haven't received your transfer yet. It can take a few minutes -- check again shortly.",
        );
      }
    } catch (error) {
      setCheckStatusMessage(normalizeErrorMessage(error, 'Could not check payment status.'));
    }
  }

  function reset() {
    setOtpRequestId(null);
    setVirtualAccount(null);
    setCheckStatusMessage(null);
    setCode('');
    setMessage(null);
  }

  const isRequestingCode = method === 'crypto' ? isRequestingOtp : isRequestingFlutterwaveOtp;
  const isOpeningCheckout = method === 'crypto' ? isCreating : isCreatingFlutterwave;

  return (
    <Dialog onOpenChange={(open) => !open && reset()}>
      <DialogTrigger asChild>
        <button
          className="mt-0.5 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent-dark md:px-4"
          type="button"
        >
          <Plus className="size-4" aria-hidden="true" />{' '}
          <span className="hidden sm:inline">Fund DL</span>
          <span className="sm:hidden">Fund</span>
        </button>
      </DialogTrigger>
      {virtualAccount ? (
        <DialogContent
          title="Transfer to this account"
          description="Send the exact amount to the account below -- your DL balance is credited automatically once the transfer arrives."
        >
          <div className="grid gap-4">
            <div className="grid gap-1 rounded-lg border border-line bg-surface p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Bank</span>
              <span className="font-extrabold text-ink">{virtualAccount.bankName}</span>
              <span className="mt-2 text-xs font-bold uppercase tracking-wide text-muted">
                Account number
              </span>
              <span className="text-lg font-black tracking-wide text-ink">
                {virtualAccount.accountNumber}
              </span>
              {virtualAccount.note && (
                <p className="mt-2 text-sm text-muted">{virtualAccount.note}</p>
              )}
            </div>
            {checkStatusMessage && (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm font-bold text-ink">
                {checkStatusMessage}
              </p>
            )}
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
              onClick={() => void checkStatus()}
              pending={isCheckingStatus}
              pendingLabel="Checking"
              type="button"
            >
              I've sent the transfer -- check status
            </ActionButton>
          </div>
        </DialogContent>
      ) : otpRequestId ? (
        <DialogContent
          title="Enter your code"
          description="We emailed a 6-digit code to confirm this purchase."
        >
          <form className="grid gap-4" onSubmit={submitCode}>
            <input
              autoFocus
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-center text-lg font-bold tracking-[0.3em] text-ink outline-none focus:border-accent"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              value={code}
            />
            {message && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {message}
              </p>
            )}
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
              disabled={code.length !== 6}
              pending={isOpeningCheckout}
              pendingLabel="Opening checkout"
              type="submit"
            >
              Continue to checkout <ArrowUpRight className="size-4" aria-hidden="true" />
            </ActionButton>
          </form>
        </DialogContent>
      ) : (
        <DialogContent
          title="Fund DL"
          description="Continue to secure checkout for your chosen payment method."
        >
          <form className="grid gap-4" onSubmit={submitAmount}>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-bold">Payment method</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'crypto', label: 'Stablecoin' },
                    { value: 'fiat', label: 'Bank / Mobile Money' },
                  ] as const
                ).map((option) => (
                  <label
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-extrabold ${method === option.value ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                    key={option.value}
                  >
                    <input
                      className="sr-only"
                      checked={method === option.value}
                      name="method"
                      onChange={() => setMethod(option.value)}
                      type="radio"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1.5 text-sm font-bold">
              Amount in DL
              <input
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                min="0.00000001"
                onChange={(event) => setAmount(event.target.value)}
                required
                step="any"
                type="number"
                value={amount}
              />
              {tokenAmount > 0 && (
                <span className="text-xs font-semibold text-muted">
                  ≈ {formatUsd(usdAmount)}
                  {method === 'fiat' &&
                    localCurrency &&
                    localAmount !== null &&
                    ` · ≈ ${formatLocalCurrency(localAmount, localCurrency.code)}`}
                </span>
              )}
            </label>
            {method === 'crypto' ? (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-bold">Payment currency</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['USDT', 'USDC'] as const).map((option) => (
                    <label
                      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-extrabold ${currency === option ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                      key={option}
                    >
                      <input
                        className="sr-only"
                        checked={currency === option}
                        name="currency"
                        onChange={() => setCurrency(option)}
                        type="radio"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <>
                <label className="grid gap-1.5 text-sm font-bold">
                  Country
                  <select
                    className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                    onChange={(event) => setCountryCode(event.target.value)}
                    value={countryCode}
                  >
                    {FLUTTERWAVE_FUNDING_COUNTRIES.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {isV4Enabled && (
                  <>
                    <fieldset className="grid gap-2">
                      <legend className="mb-1 text-sm font-bold">Fiat method</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { value: 'bank_transfer', label: 'Bank transfer' },
                            { value: 'mobile_money', label: 'Mobile money' },
                          ] as const
                        ).map((option) => (
                          <label
                            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-extrabold ${fiatMethod === option.value ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                            key={option.value}
                          >
                            <input
                              className="sr-only"
                              checked={fiatMethod === option.value}
                              name="fiatMethod"
                              onChange={() => setFiatMethod(option.value)}
                              type="radio"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {fiatMethod === 'mobile_money' && (
                      <>
                        <label className="grid gap-1.5 text-sm font-bold">
                          Network
                          <select
                            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                            onChange={(event) => setMobileMoneyNetwork(event.target.value)}
                            value={mobileMoneyNetwork}
                          >
                            {MOBILE_MONEY_NETWORKS.map((network) => (
                              <option key={network} value={network}>
                                {network}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1.5 text-sm font-bold">
                          Phone number
                          <input
                            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                            onChange={(event) => setMobileMoneyNumber(event.target.value.trim())}
                            required
                            type="tel"
                            value={mobileMoneyNumber}
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {message && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {message}
              </p>
            )}
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={usdAmount <= 0}
              pending={isRequestingCode}
              pendingLabel="Sending code"
              type="submit"
            >
              Send confirmation code
            </ActionButton>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

const WITHDRAWAL_NETWORKS_BY_CURRENCY: Record<WithdrawalCurrency, WithdrawalNetwork[]> = {
  USDT: ['TRC20', 'ERC20', 'BEP20'],
  USDC: ['ERC20', 'SOL', 'POLYGON'],
};

// Light client-side sanity checks only -- the backend is the source of
// truth for what's actually allowed/valid (PlatformSettings allow-lists +
// NOWPayments itself rejecting a malformed address at payout time). This
// just catches an obviously-wrong paste before the OTP round-trip.
const WITHDRAWAL_ADDRESS_PATTERNS: Record<WithdrawalNetwork, RegExp> = {
  TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ERC20: /^0x[0-9a-fA-F]{40}$/,
  BEP20: /^0x[0-9a-fA-F]{40}$/,
  SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  POLYGON: /^0x[0-9a-fA-F]{40}$/,
};

// Mirrors WalletController.createWithdrawal's isStripeAccount/isCryptoSaved
// branches -- each PayoutAccount type maps to its own PayoutMethod value
// (CRYPTO_SAVED for STABLECOIN_WALLET, distinct from the ad-hoc CRYPTO path
// used by the ""Stablecoin" typed-address method below), matching the
// fiatSnapshot the backend actually records.
function payoutMethodForAccount(
  type: PayoutAccountType | undefined,
): 'BANK' | 'MOBILE_MONEY' | 'STRIPE' | 'CRYPTO_SAVED' {
  if (type === 'STRIPE_CONNECT') return 'STRIPE';
  if (type === 'STABLECOIN_WALLET') return 'CRYPTO_SAVED';
  if (type === 'MOBILE_MONEY') return 'MOBILE_MONEY';
  return 'BANK';
}

function payoutAccountLabel(account: PayoutAccount): string {
  if (account.type === 'BANK') return `${account.bankName ?? account.bankCode} · ${account.accountNumberMasked}`;
  if (account.type === 'MOBILE_MONEY') return `${account.mobileMoneyNetwork} · ${account.mobileMoneyNumberMasked}`;
  if (account.type === 'STABLECOIN_WALLET') {
    return `${account.stablecoinAsset} (${account.stablecoinNetwork}) · ${account.walletAddressMasked}`;
  }
  return 'Stripe Connect';
}

function WithdrawTokensDialog({
  balance,
  minWithdrawalTokens,
  minCompletedTasksForWithdrawal,
  completedTasksForWithdrawal,
  minWalletBalanceTokens,
  withdrawableBalanceTokens,
  tokenUsdRate,
  localCurrency,
}: {
  balance: string;
  minWithdrawalTokens: string;
  minCompletedTasksForWithdrawal: number;
  completedTasksForWithdrawal: number;
  minWalletBalanceTokens: string;
  withdrawableBalanceTokens: string;
  tokenUsdRate: number;
  localCurrency: LocalCurrency | null;
}) {
  const [method, setMethod] = useState<'crypto' | 'fiat'>('fiat');
  const [amount, setAmount] = useState(minWithdrawalTokens);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationCurrency, setDestinationCurrency] = useState<WithdrawalCurrency>('USDT');
  const [destinationNetwork, setDestinationNetwork] = useState<WithdrawalNetwork>('TRC20');
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [payoutAccountId, setPayoutAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<'details' | 'confirm' | 'code' | 'success'>('details');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestWithdrawalOtpMutation();
  const [createWithdrawal, { isLoading: isSubmitting }] = useCreateWithdrawalMutation();
  const { data: payoutAccounts } = useListPayoutAccountsQuery();
  const { data: kycStatusData } = useGetKycStatusQuery();
  const { data: publicSettings } = useGetPublicClientSettingsQuery();
  const [createKycSession, { isLoading: isStartingKyc }] = useCreateKycSessionMutation();
  const [cancelMyKyc, { isLoading: isCancellingKyc }] = useCancelMyKycMutation();
  const router = useRouter();

  const addressLooksValid =
    destinationAddress.length === 0 ||
    WITHDRAWAL_ADDRESS_PATTERNS[destinationNetwork].test(destinationAddress.trim());
  const amountNumber = Number(amount) || 0;
  const usdAmount = amountNumber * tokenUsdRate;
  const localAmount = localCurrency ? usdAmount * Number(localCurrency.usdExchangeRate) : null;
  const selectedPayoutAccount = payoutAccounts?.find((a) => a.id === payoutAccountId);
  const kycRequired =
    (publicSettings?.isKycRequiredForWithdrawals ?? false) &&
    amountNumber >= Number(publicSettings?.kycMinWithdrawalTokens ?? '0');
  const kycStatus = kycStatusData?.kycStatus ?? 'NOT_STARTED';
  const kycBlocked = kycRequired && kycStatus !== 'APPROVED';
  const tasksRemaining = Math.max(0, minCompletedTasksForWithdrawal - completedTasksForWithdrawal);
  const tasksBlocked = tasksRemaining > 0;
  const withdrawableBalanceNumber = Number(withdrawableBalanceTokens);
  const minWalletBalanceNumber = Number(minWalletBalanceTokens);
  const exceedsWithdrawableBalance = amountNumber > withdrawableBalanceNumber;

  // Live NOWPayments per-network minimum -- re-fetched whenever the
  // currency/network selection changes (crypto method only; fiat has no
  // NOWPayments minimum) so the amount input is gated before submit
  // instead of only failing server-side after the trainer hits "Review".
  const { data: providerMinAmount } = useGetWithdrawalMinAmountQuery(
    { currency: destinationCurrency, network: destinationNetwork },
    { skip: method !== 'crypto' },
  );
  const belowProviderMinimum =
    method === 'crypto' &&
    providerMinAmount !== undefined &&
    amountNumber > 0 &&
    amountNumber < Number(providerMinAmount.minTokens);

  async function startKycVerification() {
    setMessage(null);
    try {
      const session = await createKycSession().unwrap();
      window.location.href = session.url;
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not start identity verification.'));
    }
  }

  async function cancelAndRetryKycVerification() {
    setMessage(null);
    try {
      await cancelMyKyc().unwrap();
      await startKycVerification();
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not cancel your verification.'));
    }
  }

  function updateCurrency(currency: WithdrawalCurrency) {
    setDestinationCurrency(currency);
    setDestinationNetwork(WITHDRAWAL_NETWORKS_BY_CURRENCY[currency][0]);
    setAddressConfirmed(false);
  }

  function updateNetwork(network: WithdrawalNetwork) {
    setDestinationNetwork(network);
    setAddressConfirmed(false);
  }

  function submitDetails(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (exceedsWithdrawableBalance) {
      setMessage(
        minWalletBalanceNumber > 0
          ? `You must keep at least ${formatTokens(minWalletBalanceTokens)} DL in your wallet -- you can withdraw up to ${formatTokens(withdrawableBalanceTokens)} DL right now.`
          : `Insufficient balance -- your balance is ${formatTokens(balance)} DL.`,
      );
      return;
    }
    if (method === 'fiat') {
      if (!payoutAccountId) {
        setMessage('Choose a payout method before continuing.');
        return;
      }
      if (selectedPayoutAccount?.type === 'STRIPE_CONNECT' && !selectedPayoutAccount.stripePayoutsEnabled) {
        setMessage('Finish Stripe onboarding for this payout account before requesting a withdrawal.');
        return;
      }
    } else {
      if (belowProviderMinimum && providerMinAmount) {
        setMessage(
          `The payout provider requires at least ${formatTokens(providerMinAmount.minTokens)} DL for ${destinationCurrency} on ${destinationNetwork}.`,
        );
        return;
      }
      if (!addressLooksValid) {
        setMessage(`That doesn't look like a valid ${destinationNetwork} address.`);
        return;
      }
      if (!addressConfirmed) {
        setMessage('Confirm the destination address before continuing.');
        return;
      }
    }
    setStage('confirm');
  }

  async function confirmAndRequestOtp() {
    setMessage(null);
    try {
      if (method === 'fiat') {
        const result = await requestOtp({
          tokenAmount: amountNumber,
          payoutMethod: payoutMethodForAccount(selectedPayoutAccount?.type),
          payoutAccountId,
        }).unwrap();
        setOtpRequestId(result.otpRequestId);
      } else {
        const result = await requestOtp({
          tokenAmount: amountNumber,
          destinationAddress,
          destinationCurrency,
          destinationNetwork,
        }).unwrap();
        setOtpRequestId(result.otpRequestId);
      }
      setStage('code');
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not send a confirmation code.'));
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!otpRequestId) return;
    setMessage(null);
    try {
      if (method === 'fiat') {
        await createWithdrawal({
          tokenAmount: amountNumber,
          payoutMethod: payoutMethodForAccount(selectedPayoutAccount?.type),
          payoutAccountId,
          otpRequestId,
          code,
        }).unwrap();
        setPayoutAccountId('');
      } else {
        await createWithdrawal({
          tokenAmount: amountNumber,
          destinationAddress,
          destinationCurrency,
          destinationNetwork,
          otpRequestId,
          code,
        }).unwrap();
        setDestinationAddress('');
        setAddressConfirmed(false);
      }
      setMessage(null);
      setStage('success');
      setOtpRequestId(null);
      setAmount(minWithdrawalTokens);
      setCode('');
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not submit this withdrawal.'));
    }
  }

  function reset() {
    setStage('details');
    setOtpRequestId(null);
    setCode('');
    setMessage(null);
  }

  function handleSuccessClose() {
    setDialogOpen(false);
    reset();
    router.push('/dashboard?view=tokens');
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) reset();
      }}
      open={dialogOpen}
    >
      <DialogTrigger asChild>
        <button
          className="mt-0.5 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-extrabold text-ink hover:bg-surface-muted md:px-4"
          type="button"
        >
          <ArrowUpRight className="size-4" aria-hidden="true" />{' '}
          <span className="hidden sm:inline">Withdraw</span>
          <span className="sm:hidden">Withdraw</span>
        </button>
      </DialogTrigger>
      {tasksBlocked ? (
        <DialogContent
          title="Keep training to unlock withdrawals"
          description={`Withdrawals open up once you've completed ${minCompletedTasksForWithdrawal} tasks.`}
        >
          <div className="grid gap-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center">
              <Mic2 className="size-12 text-accent" aria-hidden="true" />
              <p className="font-extrabold">
                {completedTasksForWithdrawal}/{minCompletedTasksForWithdrawal} tasks completed
              </p>
              <p className="text-sm leading-relaxed text-muted">
                Complete {tasksRemaining} more task{tasksRemaining === 1 ? '' : 's'} to unlock
                withdrawals. This keeps payouts limited to trainers who&apos;ve shown real,
                consistent contribution.
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
              href="/dashboard?view=training"
              onClick={() => setDialogOpen(false)}
            >
              Start training
            </Link>
          </div>
        </DialogContent>
      ) : kycBlocked ? (
        <DialogContent
          title="Verify your identity"
          description="A quick ID scan and selfie confirms it's really you before your first withdrawal."
        >
          <div className="grid gap-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center">
              <ShieldIcon className="size-12 text-accent" aria-hidden="true" />
              {kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW' ? (
                <>
                  <p className="font-extrabold">Verification in progress.</p>
                  <p className="text-sm leading-relaxed text-muted">
                    We&apos;re reviewing your ID and selfie. This usually takes a few minutes --
                    check back shortly. If it&apos;s stuck, you can cancel and try again.
                  </p>
                </>
              ) : kycStatus === 'DECLINED' ||
                kycStatus === 'ABANDONED' ||
                kycStatus === 'EXPIRED' ? (
                <>
                  <p className="font-extrabold">Verification didn&apos;t go through.</p>
                  <p className="text-sm leading-relaxed text-muted">
                    Contact support if you think this is a mistake, or try again below.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-extrabold">Identity verification required.</p>
                  <p className="text-sm leading-relaxed text-muted">
                    Withdrawals above {publicSettings?.kycMinWithdrawalTokens ?? 0} DL require a
                    one-time ID + selfie check.
                  </p>
                </>
              )}
            </div>
            {message && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {message}
              </p>
            )}
            {kycStatus === 'IN_PROGRESS' || kycStatus === 'IN_REVIEW' ? (
              <ActionButton
                className="min-h-11 rounded-lg border border-line px-4 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void cancelAndRetryKycVerification()}
                pending={isCancellingKyc || isStartingKyc}
                pendingLabel="Cancelling"
                type="button"
              >
                Cancel and retry verification
              </ActionButton>
            ) : (
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void startKycVerification()}
                pending={isStartingKyc}
                pendingLabel="Starting"
                type="button"
              >
                Verify now
              </ActionButton>
            )}
          </div>
        </DialogContent>
      ) : stage === 'success' ? (
        <DialogContent
          title="Withdrawal submitted"
          description="Your withdrawal request has been received and is now being processed."
        >
          <div className="grid gap-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center">
              <CheckCircle2 className="size-12 text-accent" aria-hidden="true" />
              <p className="font-extrabold">Your withdrawal is on its way.</p>
              <p className="text-sm leading-relaxed text-muted">
                We&apos;ll update the status in your recent activity as it progresses.
              </p>
            </div>
            <button
              autoFocus
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
              onClick={handleSuccessClose}
              type="button"
            >
              OK
            </button>
          </div>
        </DialogContent>
      ) : stage === 'code' ? (
        <DialogContent
          title="Enter your code"
          description="We emailed a 6-digit code to confirm this withdrawal."
        >
          <form className="grid gap-4" onSubmit={submitCode}>
            <input
              autoFocus
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-center text-lg font-bold tracking-[0.3em] text-ink outline-none focus:border-accent"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              value={code}
            />
            {message && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {message}
              </p>
            )}
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
              disabled={code.length !== 6}
              pending={isSubmitting}
              pendingLabel="Submitting"
              type="submit"
            >
              Confirm withdrawal
            </ActionButton>
          </form>
        </DialogContent>
      ) : stage === 'confirm' ? (
        <DialogContent
          title="Confirm withdrawal amount"
          description="Double-check these figures -- once you send the code, this amount is what will be debited and paid out."
        >
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
              <ConfirmRow label="You withdraw" value={`${formatTokens(amountNumber)} DL`} />
              <ConfirmRow label="Estimated value" value={formatUsd(usdAmount)} />
              {method === 'fiat' && localCurrency && localAmount !== null && (
                <ConfirmRow
                  label={`You receive (${localCurrency.code})`}
                  value={formatLocalCurrency(localAmount, localCurrency.code)}
                  emphasize
                />
              )}
              {method === 'fiat' && selectedPayoutAccount && (
                <ConfirmRow label="Payout account" value={payoutAccountLabel(selectedPayoutAccount)} />
              )}
              {method === 'crypto' && (
                <ConfirmRow
                  label="Destination"
                  value={`${destinationCurrency} (${destinationNetwork}) · ${destinationAddress}`}
                />
              )}
            </div>
            {method === 'fiat' && (
              <p className="text-xs leading-relaxed text-muted">
                The local currency amount is estimated from the current exchange rate and may differ
                slightly from what your bank or mobile money provider credits.
              </p>
            )}
            {message && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {message}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="min-h-11 rounded-lg border border-line bg-surface px-4 font-extrabold text-ink hover:bg-surface-muted"
                onClick={() => setStage('details')}
                type="button"
              >
                Back
              </button>
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
                onClick={confirmAndRequestOtp}
                pending={isRequestingOtp}
                pendingLabel="Sending code"
                type="button"
              >
                Confirm &amp; send code
              </ActionButton>
            </div>
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Withdraw DL"
          description={
            minWalletBalanceNumber > 0
              ? `Available balance: ${formatTokens(balance)} DL · withdrawable: ${formatTokens(withdrawableBalanceTokens)} DL (${formatTokens(minWalletBalanceTokens)} DL minimum balance required).`
              : `Available balance: ${formatTokens(balance)} DL.`
          }
        >
          <form className="grid gap-4" onSubmit={submitDetails}>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-bold">Payout method</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'fiat', label: 'Bank / Mobile Money' },
                    { value: 'crypto', label: 'Stablecoin' },
                  ] as const
                ).map((option) => (
                  <label
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-extrabold ${method === option.value ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                    key={option.value}
                  >
                    <input
                      className="sr-only"
                      checked={method === option.value}
                      name="withdrawMethod"
                      onChange={() => setMethod(option.value)}
                      type="radio"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1.5 text-sm font-bold">
              Amount in DL
              <input
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                min="0.00000001"
                onChange={(event) => setAmount(event.target.value)}
                required
                step="any"
                type="number"
                value={amount}
              />
              {amountNumber > 0 && !exceedsWithdrawableBalance && (
                <span className="text-xs font-semibold text-muted">
                  ≈ {formatUsd(usdAmount)}
                  {method === 'fiat' &&
                    localCurrency &&
                    localAmount !== null &&
                    ` · ≈ ${formatLocalCurrency(localAmount, localCurrency.code)}`}
                </span>
              )}
              {amountNumber > 0 && exceedsWithdrawableBalance && (
                <span className="text-xs font-bold text-danger">
                  {minWalletBalanceNumber > 0
                    ? `You must keep at least ${formatTokens(minWalletBalanceTokens)} DL in your wallet -- you can withdraw up to ${formatTokens(withdrawableBalanceTokens)} DL.`
                    : `Exceeds your available balance of ${formatTokens(balance)} DL.`}
                </span>
              )}
              {belowProviderMinimum && providerMinAmount && (
                <span className="text-xs font-bold text-danger">
                  The payout provider requires at least{' '}
                  {formatTokens(providerMinAmount.minTokens)} DL for {destinationCurrency} on{' '}
                  {destinationNetwork} (≈ {providerMinAmount.minAmount} {destinationCurrency}).
                </span>
              )}
            </label>
            {method === 'crypto' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5 text-sm font-bold">
                    Currency
                    <select
                      className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                      onChange={(event) => updateCurrency(event.target.value as WithdrawalCurrency)}
                      value={destinationCurrency}
                    >
                      {Object.keys(WITHDRAWAL_NETWORKS_BY_CURRENCY).map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Network
                    <select
                      className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                      onChange={(event) => updateNetwork(event.target.value as WithdrawalNetwork)}
                      value={destinationNetwork}
                    >
                      {WITHDRAWAL_NETWORKS_BY_CURRENCY[destinationCurrency].map((network) => (
                        <option key={network} value={network}>
                          {network}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1.5 text-sm font-bold">
                  {destinationCurrency} destination address ({destinationNetwork})
                  <input
                    className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                    onChange={(event) => {
                      setDestinationAddress(event.target.value.trim());
                      setAddressConfirmed(false);
                    }}
                    placeholder={
                      destinationNetwork === 'TRC20'
                        ? 'T...'
                        : destinationNetwork === 'SOL'
                          ? 'Base58 address'
                          : '0x...'
                    }
                    required
                    type="text"
                    value={destinationAddress}
                  />
                  {!addressLooksValid && (
                    <span className="text-xs font-bold text-danger">
                      Doesn&apos;t look like a valid {destinationNetwork} address.
                    </span>
                  )}
                </label>
                <label className="flex items-start gap-2.5 text-sm font-bold">
                  <input
                    checked={addressConfirmed}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                    onChange={(event) => setAddressConfirmed(event.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span className="font-semibold leading-snug text-muted">
                    I confirm that the {destinationCurrency} address above is on the{' '}
                    {destinationNetwork} network, belongs to my own account, and I have
                    double-checked it is correct. Funds sent to a wrong or unsupported network
                    cannot be recovered.
                  </span>
                </label>
              </>
            ) : (payoutAccounts?.length ?? 0) === 0 ? (
              <p className="rounded-lg border border-line bg-surface p-4 text-sm">
                You don&apos;t have a saved payout method yet.{' '}
                <Link className="font-bold text-accent" href="/dashboard/payout-accounts">
                  Add one first
                </Link>
                .
              </p>
            ) : (
              <label className="grid gap-1.5 text-sm font-bold">
                Payout account
                <select
                  className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                  onChange={(event) => setPayoutAccountId(event.target.value)}
                  required
                  value={payoutAccountId}
                >
                  <option disabled value="">
                    Select a payout account
                  </option>
                  {payoutAccounts?.map((account) => (
                    <option key={account.id} value={account.id}>
                      {payoutAccountLabel(account)}
                      {account.type === 'STRIPE_CONNECT' && !account.stripePayoutsEnabled
                        ? ' (setup not finished)'
                        : ''}
                    </option>
                  ))}
                </select>
                <Link className="text-xs font-bold text-accent" href="/dashboard/payout-accounts">
                  Manage payout methods
                </Link>
              </label>
            )}
            {method === 'fiat' &&
              selectedPayoutAccount?.type === 'STRIPE_CONNECT' &&
              !selectedPayoutAccount.stripePayoutsEnabled && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                  Finish Stripe onboarding for this payout account before requesting a withdrawal.{' '}
                  <Link className="underline" href="/dashboard/payout-accounts">
                    Continue setup
                  </Link>
                  .
                </p>
              )}
            {message && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                {message}
              </p>
            )}
            <button
              className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                exceedsWithdrawableBalance ||
                (method === 'crypto'
                  ? !addressLooksValid || !addressConfirmed || belowProviderMinimum
                  : (payoutAccounts?.length ?? 0) === 0 ||
                    (selectedPayoutAccount?.type === 'STRIPE_CONNECT' &&
                      !selectedPayoutAccount.stripePayoutsEnabled))
              }
              type="submit"
            >
              Review withdrawal
            </button>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

function ConfirmRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <span className={emphasize ? 'text-lg font-black text-ink' : 'font-bold text-ink'}>
        {value}
      </span>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone,
  compact = false,
  href,
  tooltip,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  subValue?: string;
  tone: 'purple' | 'green' | 'amber' | 'blue';
  compact?: boolean;
  href?: string;
  tooltip?: string;
}) {
  const tones = {
    purple: 'bg-accent-soft text-accent',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  };
  // A relative <article> wrapper (not <Link>, even when href is set) so the
  // InfoTooltip's popover trigger button is never nested inside an <a> --
  // the value/label area below becomes the link surface instead.
  const Content = href ? Link : 'div';
  return (
    <article className={`${cardClass} relative flex min-h-32 items-start gap-3 p-4 md:p-5`}>
      {tooltip && (
        <div className="absolute right-3 top-3">
          <InfoTooltip label={label} text={tooltip} />
        </div>
      )}
      <Content
        className={`flex min-w-0 flex-1 items-start gap-3 ${href ? 'transition-colors hover:opacity-80' : ''}`}
        href={href as never}
      >
        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 pr-5 text-sm font-bold text-muted">
            {label}
            {href && <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />}
          </p>
          <p
            className={`mt-2 break-words font-black leading-tight ${compact ? 'text-xl' : 'text-2xl'}`}
          >
            {value}
          </p>
          {subValue && <p className="mt-1 text-xs font-bold text-muted">≈ {subValue}</p>}
        </div>
      </Content>
    </article>
  );
}

type ActivityEntry = {
  id: string;
  type: LedgerEntryType;
  amount: string;
  reference: string;
  createdAt: string;
};

function ActivityList({
  entries,
  compact = false,
}: {
  entries: ActivityEntry[];
  compact?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = compact ? 5 : 8;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const label = activityLabels[entry.type]?.toLowerCase() ?? '';
      return (
        label.includes(query) ||
        entry.reference.toLowerCase().includes(query) ||
        entry.type.toLowerCase().includes(query) ||
        formatDate(entry.createdAt).toLowerCase().includes(query)
      );
    });
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const shown = filtered.slice(startIndex, startIndex + pageSize);
  const showingFrom = filtered.length ? startIndex + 1 : 0;
  const showingTo = Math.min(startIndex + shown.length, filtered.length);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  if (!entries.length)
    return (
      <EmptyPanel
        icon={Clock3}
        title="No account activity yet"
        actionHref={undefined}
        actionLabel={undefined}
      />
    );

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="border-b border-line px-4 py-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm font-medium text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search activity by type, reference, or date..."
            type="search"
            value={search}
            aria-label="Search recent activity"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm font-bold text-muted">
          No activity matches "{search}".
        </p>
      ) : (
        <>
          <div className="divide-y divide-line md:hidden">
            {shown.map((entry) => (
              <ActivityMobileRow entry={entry} key={entry.id} />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-surface-muted/70 text-xs font-black uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((entry) => (
                  <ActivityTableRow entry={entry} key={entry.id} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {filtered.length > pageSize ? (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {showingFrom}-{showingTo} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous activity page"
              className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:opacity-45"
              disabled={page <= 1}
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              type="button"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-16 text-center font-bold text-ink">
              {page} / {totalPages}
            </span>
            <button
              aria-label="Next activity page"
              className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:opacity-45"
              disabled={page >= totalPages}
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              type="button"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActivityMobileRow({ entry }: { entry: ActivityEntry }) {
  const positive = Number(entry.amount) >= 0;
  const Icon = entry.type === 'DEPOSIT' ? ArrowDownLeft : positive ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="flex items-center gap-3 p-3.5 md:px-4">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-surface-muted text-muted'}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold md:text-base">{activityLabels[entry.type]}</p>
        <p className="text-xs text-muted md:text-sm">{formatDate(entry.createdAt)}</p>
      </div>
      <p
        className={`shrink-0 text-sm font-black md:text-base ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}
      >
        {positive ? '+' : ''}
        {formatTokens(entry.amount)}
      </p>
    </div>
  );
}

function ActivityTableRow({ entry }: { entry: ActivityEntry }) {
  const positive = Number(entry.amount) >= 0;
  const Icon = entry.type === 'DEPOSIT' ? ArrowDownLeft : positive ? ArrowDownLeft : ArrowUpRight;
  return (
    <tr className="align-middle">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-surface-muted text-muted'}`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="font-extrabold text-ink">{activityLabels[entry.type]}</span>
        </div>
      </td>
      <td className="max-w-72 truncate px-4 py-3 font-mono text-xs text-muted">
        {entry.reference || '-'}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">
        {formatDate(entry.createdAt)}
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3 text-right font-black ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}
      >
        {positive ? '+' : ''}
        {formatTokens(entry.amount)}
      </td>
    </tr>
  );
}

const earningsChartRangeLabels: Record<EarningsChartRange, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

const earningsChartRangeSubtitles: Record<EarningsChartRange, string> = {
  today: 'DL credited by 2-hour window, today.',
  week: 'DL credited by day, last 7 days.',
  month: 'DL credited by day, last 30 days.',
  year: 'DL credited by month, last 12 months.',
};

function EarningsChartSection({ tokenUsdRate }: { tokenUsdRate: number }) {
  const [range, setRange] = useState<EarningsChartRange>('month');
  const { data, isFetching } = useGetEarningsChartQuery({ range });
  const [activeBucket, setActiveBucket] = useState<EarningsChart_Bucket | null>(null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle
          title={earningsChartRangeLabels[range]}
          subtitle={earningsChartRangeSubtitles[range]}
        />
        <div
          className="inline-flex rounded-lg border border-line bg-surface p-1"
          role="tablist"
          aria-label="Earnings chart range"
        >
          {(Object.keys(earningsChartRangeLabels) as EarningsChartRange[]).map((option) => (
            <button
              aria-selected={range === option}
              className={`min-h-9 rounded-md px-3.5 text-sm font-extrabold transition-colors ${range === option ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
              key={option}
              onClick={() => setRange(option)}
              role="tab"
              type="button"
            >
              {earningsChartRangeLabels[option]}
            </button>
          ))}
        </div>
      </div>
      <EarningsChart
        buckets={data?.buckets ?? []}
        loading={isFetching && !data}
        onSelectBucket={setActiveBucket}
        range={range}
      />
      <BucketEarningsDialog
        bucket={activeBucket}
        onOpenChange={(open) => {
          if (!open) setActiveBucket(null);
        }}
        range={range}
        tokenUsdRate={tokenUsdRate}
      />
    </div>
  );
}

function EarningsChart({
  buckets,
  range,
  loading,
  onSelectBucket,
}: {
  buckets: EarningsChart_Bucket[];
  range: EarningsChartRange;
  loading: boolean;
  onSelectBucket: (bucket: EarningsChart_Bucket) => void;
}) {
  const max = Math.max(...buckets.map((bucket) => Number(bucket.amount)), 1);
  const dense = range !== 'year' && buckets.length > 14;

  if (loading) {
    return (
      <div className={`${cardClass} grid h-64 place-items-center`}>
        <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={`${cardClass} flex h-64 items-end gap-1.5 overflow-x-auto p-4 pt-8 sm:gap-3 md:p-5 md:pt-8`}
    >
      {buckets.map((bucket) => {
        const value = Number(bucket.amount);
        const height = value > 0 ? Math.max((value / max) * 100, 8) : 2;
        return (
          <button
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-md transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            key={bucket.label}
            onClick={() => onSelectBucket(bucket)}
            type="button"
          >
            {!dense && (
              <span className="text-xs font-bold text-muted">
                {value ? formatTokens(value) : ''}
              </span>
            )}
            <div
              className="flex h-[150px] w-full max-w-10 items-end rounded-md bg-surface-muted"
              title={`${formatTokens(value)} DL -- click to see these earnings`}
            >
              <div className="w-full rounded-md bg-accent" style={{ height: `${height}%` }} />
            </div>
            <span className="text-xs font-extrabold text-muted">
              {dense ? formatBucketDayNumber(bucket.label) : formatBucketLabel(bucket.label, range)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BucketEarningsDialog({
  bucket,
  range,
  tokenUsdRate,
  onOpenChange,
}: {
  bucket: EarningsChart_Bucket | null;
  range: EarningsChartRange;
  tokenUsdRate: number;
  onOpenChange: (open: boolean) => void;
}) {
  const dateRange = bucket ? bucketDateRange(bucket.label, range) : null;
  const { data, isLoading, isFetching, isError, refetch } = useGetEarningHistoryQuery(
    dateRange ? { page: 1, pageSize: 50, from: dateRange.from, to: dateRange.to } : skipToken,
  );

  const heading = bucket ? bucketHeading(bucket.label, range) : '';

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(bucket)}>
      <DialogContent
        description="Every training payout and referral bonus credited in this window."
        title={heading || 'Earnings'}
      >
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto">
          {isLoading ? (
            <div className="grid min-h-32 place-items-center" role="status">
              <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
              <span className="sr-only">Loading earnings</span>
            </div>
          ) : isError ? (
            <div className="grid min-h-32 place-items-center gap-3 text-center">
              <p className="font-extrabold">Could not load earnings.</p>
              <button
                className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
                onClick={() => void refetch()}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : data?.items.length ? (
            <div className="divide-y divide-line">
              {data.items.map((entry) => (
                <div className="grid gap-1 py-3 first:pt-0 last:pb-0" key={entry.id}>
                  <div className="flex items-start justify-between gap-3">
                    <EarningTypeLabel type={entry.type} />
                    <span className="whitespace-nowrap font-black text-emerald-700 dark:text-emerald-300">
                      +{formatTokens(entry.amount)}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold">{formatDateTime(entry.createdAt)}</p>
                      <p className="truncate font-mono text-xs text-muted">{entry.reference}</p>
                    </div>
                    <span className="shrink-0 font-bold text-muted">
                      {formatUsd(Number(entry.amount) * tokenUsdRate)}
                    </span>
                  </div>
                </div>
              ))}
              {data.total > data.items.length && (
                <p className="pt-2 text-center text-xs font-bold text-muted">
                  Showing the first {data.items.length} of {data.total} entries in this window.
                </p>
              )}
            </div>
          ) : (
            <EmptyPanel icon={Clock3} title="No earnings in this window" unframed />
          )}
          {isFetching && !isLoading && (
            <RefreshCw className="mx-auto size-4 animate-spin text-accent" aria-hidden="true" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Full, unabbreviated heading for a bucket's dialog title -- distinct from the chart's own compact axis labels (formatBucketLabel/formatBucketDayNumber). */
function bucketHeading(label: string, range: EarningsChartRange): string {
  if (!label) return '';
  if (range === 'today') {
    const start = new Date(label);
    if (Number.isNaN(start.getTime())) return '';
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'UTC',
    });
    return `${fmt.format(start)} - ${fmt.format(end)}`;
  }
  if (range === 'year') return formatMonth(label);
  const date = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

type EarningsChart_Bucket = { label: string; amount: string };

/** Bare day-of-month number (e.g. "14"), used when there are too many bars for the full "14 Aug" label. */
function formatBucketDayNumber(label: string) {
  if (!label) return '';
  const date = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return String(date.getUTCDate());
}

function formatBucketLabel(label: string, range: EarningsChartRange) {
  if (!label) return '';
  if (range === 'year') return formatMonth(label);
  if (range === 'today') {
    // Bucket labels are full ISO timestamps (2-hour window start) for
    // 'today', unlike the date-only labels the other ranges use.
    const date = new Date(label);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'UTC',
    }).format(date);
  }
  const date = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** Mirrors the bucket boundaries the backend's getEarningsChart computed for this label/range, so a bar's click-through filter matches exactly what's plotted. */
function bucketDateRange(
  label: string,
  range: EarningsChartRange,
): { from: string; to: string } | null {
  if (!label) return null;
  if (range === 'today') {
    const start = new Date(label);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (range === 'year') {
    const start = new Date(`${label}-01T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { from: start.toISOString(), to: end.toISOString() };
  }
  const start = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

function RateRow({ label, rate, enabled }: { label: string; rate: string; enabled: boolean }) {
  const percentage = enabled ? Number(rate) * 100 : 0;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
      <div>
        <p className="font-extrabold">{label}</p>
        <p className="text-sm text-muted">{enabled && percentage > 0 ? 'Active' : 'Not active'}</p>
      </div>
      <span
        className={`text-xl font-black ${enabled && percentage > 0 ? 'text-accent' : 'text-muted'}`}
      >
        {percentage.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
      </span>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="dashboard-theme min-h-screen animate-pulse bg-bg">
      <div className="h-16 border-b border-line bg-surface" />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="h-16 w-72 rounded-lg bg-surface-muted" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-32 rounded-lg bg-surface" />
          <div className="h-32 rounded-lg bg-surface" />
          <div className="h-32 rounded-lg bg-surface" />
        </div>
      </div>
    </div>
  );
}

function ViewLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-14 w-64 rounded-lg bg-surface-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-32 rounded-lg bg-surface" />
        <div className="h-32 rounded-lg bg-surface" />
        <div className="h-32 rounded-lg bg-surface" />
      </div>
      <div className="h-64 rounded-lg bg-surface" />
    </div>
  );
}

function DashboardError({ retry }: { retry: () => void }) {
  return (
    <section className={`${cardClass} grid min-h-64 place-items-center p-6 text-center`}>
      <div className="grid justify-items-center gap-3">
        <RefreshCw className="size-6 text-danger" aria-hidden="true" />
        <h2 className="text-xl font-black">Dashboard data is unavailable</h2>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white"
          onClick={retry}
          type="button"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </section>
  );
}

export function formatTokens(value: string | number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatCompactTokensValue(value: string | number) {
  return formatCompactNumber(value);
}

function formatCompactTokensLabel(value: string | number) {
  return `${formatCompactNumber(value)} DL`;
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
}

function normalizePhoneNumber(value: string) {
  const parsed = parsePhoneNumberFromString(value);
  return parsed?.number ?? `+${value.replace(/\D/g, '')}`;
}

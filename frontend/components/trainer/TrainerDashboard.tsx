'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText as FileTextIcon,
  GraduationCap,
  Headphones,
  Landmark,
  LogOut,
  Mic2,
  Plus,
  Play,
  RefreshCw,
  Shield as ShieldIcon,
  Sparkles,
  Square,
  Star,
  User as UserIcon,
  Users,
  WalletCards,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { formatCompactLocalCurrency, formatCompactNumber, formatCompactUsd } from '@/lib/format';
import { WordTrainingDialog } from '@/components/trainer/WordTrainingDialog';
import { MarketView } from '@/components/p2p/MarketView';
import { Avatar, cardClass, EmptyPanel, formatDate, formatDateTime, SectionTitle } from '@/components/dashboard/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  EarningsChartRange,
  LedgerEntryType,
  TrainerDashboardSummary,
  TrainerSubmissionSummary,
  normalizeErrorMessage,
  useCreateP2PPaymentMethodMutation,
  useGetP2PPaymentMethodsQuery,
  useGetP2PReferenceRateQuery,
  useGetMeQuery,
  useResendEmailVerificationMutation,
  useRequestPhoneOtpMutation,
  useVerifyPhoneMutation,
  useRequestP2PPaymentMethodOtpMutation,
  useRequestDepositOtpMutation,
  useCreateTokenDepositMutation,
  useRequestWithdrawalOtpMutation,
  useCreateWithdrawalMutation,
  WithdrawalCurrency,
  WithdrawalNetwork,
  useGetEarningHistoryQuery,
  useGetEarningsChartQuery,
  useGetMySubmissionsQuery,
  useGetMyWordRecordingsQuery,
  useGetTrainerDashboardQuery,
  useGetWalletActivityQuery,
  useSendReferralInviteMutation,
  useUpdateP2PPaymentMethodMutation,
  useUpdateProfileMutation,
} from '@/store/api';
import type { Session } from 'next-auth';

type SessionUpdateFn = (data?: Record<string, unknown>) => Promise<Session | null>;

type DashboardView = 'home' | 'tokens' | 'earnings' | 'training' | 'market' | 'referrals' | 'scores' | 'profile';

const views: { id: DashboardView; label: string; icon: typeof WalletCards }[] = [
  { id: 'tokens', label: 'Tokens', icon: WalletCards },
  { id: 'earnings', label: 'Earnings', icon: CircleDollarSign },
  { id: 'training', label: 'Training', icon: Mic2 },
  { id: 'market', label: 'Market', icon: Landmark },
  { id: 'scores', label: 'My Scores', icon: Star },
];

// Reachable only from the account dropdown, not the main tab bar/mobile nav.
const allViewIds: DashboardView[] = [...views.map((view) => view.id), 'home', 'referrals', 'profile'];

const activityLabels: Record<LedgerEntryType, string> = {
  DEPOSIT: 'DL funding',
  TRAINING_PAYOUT: 'Training payout',
  TASK_LOCK: 'DL held for task',
  TASK_REFUND: 'Held DL returned',
  WITHDRAWAL: 'Payout request',
  WITHDRAWAL_REVERSED: 'Payout returned',
  REFERRAL_COMMISSION: 'Referral bonus',
  REFERRAL_FUNDING_BONUS: 'Funding referral bonus',
  REFERRAL_PAYOUT_BONUS: 'Training referral bonus',
  P2P_ESCROW_LOCK: 'P2P escrow lock',
  P2P_ESCROW_REFUND: 'P2P escrow returned',
  P2P_ESCROW_RELEASE: 'P2P escrow released',
  P2P_ESCROW_CREDIT: 'P2P DL purchase',
};


export function TrainerDashboard() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false);
  const requestedView = searchParams.get('view');
  const displayName = [session?.user.firstName, session?.user.lastName].filter(Boolean).join(' ');
  const activeView = allViewIds.includes(requestedView as DashboardView) ? (requestedView as DashboardView) : 'home';
  const { data, isLoading, isFetching, error, refetch } = useGetTrainerDashboardQuery(undefined, {
    skip: status !== 'authenticated' || session?.user.role === 'ADMIN' || session?.user.role === 'DISTRIBUTOR',
  });
  const { data: me } = useGetMeQuery(undefined, { skip: status !== 'authenticated' || session?.user.role === 'ADMIN' || session?.user.role === 'DISTRIBUTOR' });

  // Pre-check affordability client-side so a trainer sees an actionable
  // "fund your account" prompt instead of only discovering insufficient
  // balance after WordTrainingDialog's submissions.controller.ts/
  // words.service.ts 422 -- that server-side guard stays the authoritative
  // backstop, this just moves the failure earlier.
  function handleStartTask() {
    if (data && Number(data.balance) < Number(data.taskTokenCost)) {
      setLowBalanceOpen(true);
      return;
    }
    setTrainingOpen(true);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session.user.role === 'ADMIN') router.replace('/admin');
    if (session.user.role === 'DISTRIBUTOR') router.replace('/distributor');
    else if (!session.user.onboardingComplete) router.replace('/onboarding');
  }, [router, session, status]);

  if (
    status === 'loading' ||
    (status === 'authenticated' && (session.user.role === 'ADMIN' || session.user.role === 'DISTRIBUTOR' || !session.user.onboardingComplete))
  ) {
    return <DashboardLoading />;
  }

  if (!session) {
    return (
      <main className="dashboard-theme grid min-h-screen place-items-center bg-bg p-5 text-ink">
        <section className={`${cardClass} grid w-full max-w-sm gap-4 p-5`}>
          <BrandLogo size={36} />
          <h1 className="text-2xl font-black">Trainer dashboard</h1>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-extrabold text-white" href="/login">
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
        />

        {me && !me.emailVerified && <EmailVerificationBanner />}

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          {activeView === 'home' && (
            <section className="mb-7 flex flex-wrap items-center gap-3 border-b border-line pb-6 md:gap-4">
              <Avatar email={session.user.email ?? 'Trainer'} image={session.user.image} large />
              <div className="min-w-0">
                <p className="text-sm font-bold text-muted">Welcome back</p>
                <h1 className="truncate text-2xl font-black md:text-3xl">{displayName || emailName(session.user.email)}</h1>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                  <BadgeCheck className="size-4 text-emerald-600" aria-hidden="true" />
                  <span>{session.user.dialectTag ? `${session.user.dialectTag.toUpperCase()} trainer` : 'Dialect trainer'}</span>
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

          {activeView === 'profile' ? (
            <ProfileView session={session} update={update} />
          ) : error ? (
            <DashboardError retry={() => void refetch()} />
          ) : isLoading || !data ? (
            <ViewLoading />
          ) : (
            <DashboardViewContent
              activeView={activeView}
              data={data}
              dialectTag={session.user.dialectTag}
              email={session.user.email ?? ''}
              refreshing={isFetching}
              onStartTask={handleStartTask}
            />
          )}
        </main>

        <MobileNavigation activeView={activeView} />
        <WordTrainingDialog
          onOpenChange={setTrainingOpen}
          open={trainingOpen}
          recordingTimeoutSeconds={data?.recordingRoundTimeoutSeconds}
          recordingMaxTimeoutSeconds={data?.recordingRoundMaxTimeoutSeconds}
        />
        <LowBalanceDialog
          onOpenChange={setLowBalanceOpen}
          open={lowBalanceOpen}
          taskTokenCost={data?.taskTokenCost ?? '0'}
        />
      </PortalContainerProvider>
    </div>
  );
}

function LowBalanceDialog({
  open,
  onOpenChange,
  taskTokenCost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTokenCost: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        title="Fund your account to continue"
        description={`Starting a task holds ${formatTokens(taskTokenCost)} DL from your balance until it's scored. You don't have enough available DL to cover that right now.`}
      >
        <FundTokensDialog />
      </DialogContent>
    </Dialog>
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

function EmailVerificationCard({ email, emailVerified }: { email: string; emailVerified: boolean }) {
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
      <SectionTitle title="Email address" subtitle={emailVerified ? 'Verified.' : 'Verify your email address.'} />
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
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{error}</p>}
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

function DashboardHeader({
  activeView,
  displayName,
  email,
  image,
}: {
  activeView: DashboardView;
  displayName: string;
  email: string;
  image?: string | null;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <BrandLogo href='/dashboard' size={34} className="text-base" textClassName="hidden font-black sm:inline" />
        <nav className="hidden h-full items-stretch lg:flex" aria-label="Trainer dashboard">
          {views.map((view) => (
            <DashboardNavLink active={activeView === view.id} key={view.id} view={view} />
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {activeView !== 'home' && (
            <Link
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-sm font-bold text-accent transition-colors hover:bg-surface-muted"
              href="/dashboard"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-1.5 pr-2 text-left hover:bg-surface-muted" type="button">
                <Avatar email={email} image={image} />
                <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden="true" />
                <span className="sr-only">Open account menu</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="px-2.5 py-1.5">
                <p className="truncate text-sm font-extrabold text-ink">{displayName}</p>
                <p className="truncate text-xs font-medium text-muted">{email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/dashboard?view=profile')}>
                <UserIcon className="size-4" aria-hidden="true" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/dashboard?view=referrals')}>
                <Users className="size-4" aria-hidden="true" /> Referrals
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/learn')}>
                <GraduationCap className="size-4" aria-hidden="true" /> Learning Center
              </DropdownMenuItem>
              <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="size-4" aria-hidden="true" /> Logout
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/privacy')}>
                <ShieldIcon className="size-4" aria-hidden="true" /> Privacy Policy
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/terms')}>
                <FileTextIcon className="size-4" aria-hidden="true" /> Terms of Use
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function DashboardNavLink({ active, view }: { active: boolean; view: (typeof views)[number] }) {
  const Icon = view.icon;
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-w-24 items-center justify-center gap-2 px-3 text-sm font-bold transition-colors ${
        active ? 'text-accent' : 'text-muted hover:text-ink'
      }`}
      href={`/dashboard?view=${view.id}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {view.label}
      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />}
    </Link>
  );
}

function MobileNavigation({ activeView }: { activeView: DashboardView }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Trainer dashboard">
      {views.map((view) => {
        const Icon = view.icon;
        const active = view.id === activeView;
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold ${active ? 'text-accent' : 'text-muted'}`}
            href={`/dashboard?view=${view.id}`}
            key={view.id}
          >
            <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
            <span className="max-w-full truncate">{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function DashboardViewContent({
  activeView,
  data,
  dialectTag,
  email,
  refreshing,
  onStartTask,
}: {
  activeView: DashboardView;
  data: TrainerDashboardSummary;
  dialectTag: string | null;
  email: string;
  refreshing: boolean;
  onStartTask: () => void;
}) {
  if (activeView === 'earnings') return <EarningsView data={data} refreshing={refreshing} />;
  if (activeView === 'training') return <TrainingView dialectTag={dialectTag} onStartTask={onStartTask} />;
  if (activeView === 'market') return <MarketView />;
  if (activeView === 'referrals') return <ReferralsView data={data} email={email} />;
  if (activeView === 'scores') return <ScoresView />;
  if (activeView === 'tokens') return <TokensView refreshing={refreshing} />;
  return <HomeView data={data} refreshing={refreshing} />;
}

function ViewHeading({ title, subtitle, refreshing }: { title: string; subtitle: string; refreshing?: boolean }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black md:text-[28px]">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted md:text-base">{subtitle}</p>
      </div>
      {refreshing && <RefreshCw className="mt-1 size-4 animate-spin text-muted" aria-label="Refreshing" />}
    </div>
  );
}

function HomeView({ data, refreshing }: { data: TrainerDashboardSummary; refreshing: boolean }) {
  const usdValue = Number(data.balance) * data.tokenUsdRate;
  const router = useRouter();
  const latest = data.recentActivity.slice(0, 10);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <ViewHeading title="Dashboard" subtitle="Your available platform balance at a glance." refreshing={refreshing} />
        <div className="flex shrink-0 items-center gap-2">
          <WithdrawTokensDialog balance={data.balance} minWithdrawalTokens={data.minWithdrawalTokens} />
          <FundTokensDialog />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-4" aria-label="DL balance">
        <MetricCard icon={WalletCards} label="Available DL" value={formatCompactTokensValue(data.balance)} tone="purple" />
        <MetricCard icon={Clock3} label="Held in review" value={formatCompactTokensValue(data.lockedBalance)} tone="blue" compact />
        <MetricCard icon={Banknote} label="Estimated value" value={formatCompactUsd(usdValue)} tone="green" />
        <MetricCard icon={CircleDollarSign} label="Current rate" value={`${formatUsd(data.tokenUsdRate)} / DL`} tone="amber" compact />
      </section>
      {data.localCurrency && data.balanceInLocalCurrency && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          ≈ {formatCompactLocalCurrency(data.balanceInLocalCurrency, data.localCurrency.code)}
          {data.localCurrency.updatedAt && ` · rate as of ${formatDateTime(data.localCurrency.updatedAt)}`}
        </p>
      )}
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

function TokensView({ refreshing }: { refreshing: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading, isFetching, isError, refetch } = useGetWalletActivityQuery({ page, pageSize });

  return (
    <div>
      <ViewHeading title="Tokens" subtitle="Full history of your token activity." refreshing={refreshing || isFetching} />
      <section className={`${cardClass} overflow-hidden`}>
        {isLoading ? (
          <div className="grid min-h-52 place-items-center" role="status">
            <RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" />
            <span className="sr-only">Loading token activity</span>
          </div>
        ) : isError ? (
          <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
            <p className="font-extrabold">Could not load your token activity.</p>
            <button className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted" onClick={() => void refetch()} type="button">
              Try again
            </button>
          </div>
        ) : data && data.items.length ? (
          <>
            <div className="divide-y divide-line md:hidden">
              {data.items.map((entry) => <ActivityMobileRow entry={entry} key={entry.id} />)}
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
                  {data.items.map((entry) => <ActivityTableRow entry={entry} key={entry.id} />)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)} of {data.total}
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
                  onClick={() => setPage((currentPage) => Math.min(data.totalPages, currentPage + 1))}
                  type="button"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyPanel icon={Clock3} title="No account activity yet" actionHref={undefined} actionLabel={undefined} />
        )}
      </section>
    </div>
  );
}

function EarningsView({ data, refreshing }: { data: TrainerDashboardSummary; refreshing: boolean }) {
  const total = Number(data.trainingEarningsTokens) + Number(data.referralEarningsTokens);
  return (
    <div>
      <ViewHeading title="Earnings" subtitle="Training payouts and referral bonuses credited to your wallet." refreshing={refreshing} />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Earnings summary">
        <MetricCard icon={Sparkles} label="Total earned" value={formatCompactTokensLabel(total)} tone="purple" compact />
        <MetricCard icon={Mic2} label="Training" value={formatCompactTokensValue(data.trainingEarningsTokens)} tone="green" />
        <MetricCard icon={Users} label="Referrals" value={formatCompactTokensValue(data.referralEarningsTokens)} tone="amber" />
        <MetricCard icon={ArrowUpRight} label="Paid out" value={formatCompactTokensValue(data.paidOutTokens)} tone="blue" />
      </section>
      <section className="mt-8">
        <EarningsChartSection />
      </section>
      <EarningHistoryTable tokenUsdRate={data.tokenUsdRate} />
    </div>
  );
}

function EarningHistoryTable({ tokenUsdRate }: { tokenUsdRate: number }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading, isFetching, isError, refetch } = useGetEarningHistoryQuery({ page, pageSize });
  const totalPages = data?.totalPages ?? 1;
  const firstRow = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data?.total ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <section className="mt-8" aria-labelledby="earning-history-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black md:text-xl" id="earning-history-title">Earning history</h2>
          <p className="mt-0.5 text-sm text-muted">Every training payout and referral bonus credited to your wallet.</p>
        </div>
        {data && data.total > 0 ? (
          <p className="text-sm font-bold text-muted">Showing {firstRow}-{lastRow} of {data.total.toLocaleString()}</p>
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
            <button className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted" onClick={() => void refetch()} type="button">
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
                    <th className="px-5 py-3.5" scope="col">Date</th>
                    <th className="px-5 py-3.5" scope="col">Source</th>
                    <th className="px-5 py-3.5" scope="col">Reference</th>
                    <th className="px-5 py-3.5 text-right" scope="col">Value</th>
                    <th className="px-5 py-3.5 text-right" scope="col">DL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((entry) => (
                    <tr className="hover:bg-surface-muted/60" key={entry.id}>
                      <td className="whitespace-nowrap px-5 py-4 font-bold">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-5 py-4"><EarningTypeLabel type={entry.type} /></td>
                      <td className="max-w-52 truncate px-5 py-4 font-mono text-xs text-muted" title={entry.reference}>{entry.reference}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-muted">{formatUsd(Number(entry.amount) * tokenUsdRate)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-black text-emerald-700 dark:text-emerald-300">+{formatTokens(entry.amount)}</td>
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
                    <span className="whitespace-nowrap font-black text-emerald-700 dark:text-emerald-300">+{formatTokens(entry.amount)}</span>
                  </div>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold">{formatDateTime(entry.createdAt)}</p>
                      <p className="truncate font-mono text-xs text-muted">{entry.reference}</p>
                    </div>
                    <span className="shrink-0 font-bold text-muted">{formatUsd(Number(entry.amount) * tokenUsdRate)}</span>
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
            <p className="text-sm font-bold text-muted">Page {data.page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button aria-label="Previous earnings page" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button aria-label="Next earnings page" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= totalPages || isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
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
        {type === 'TRAINING_PAYOUT' ? <Mic2 className="size-4" aria-hidden="true" /> : <Users className="size-4" aria-hidden="true" />}
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
function useScoringSlaMs(): number {
  const { data } = useGetTrainerDashboardQuery();
  return (data?.scoringSlaMinutes ?? 60) * 60 * 1000;
}

/** e.g. 90_000 -> "1m", 5_400_000 -> "1h 30m", 3_600_000 -> "1h" -- now that the SLA is minute-configurable, a fixed "Xh" label would misrepresent sub-hour or non-round-hour values. */
function formatDurationLabel(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

type TrainingTab = 'training' | 'tasks';

function TrainingView({ dialectTag, onStartTask }: { dialectTag: string | null; onStartTask: () => void }) {
  const [tab, setTab] = useState<TrainingTab>('tasks');

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

      <div className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1" role="tablist" aria-label="Training sections">
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
        <article className={`${cardClass} grid min-h-64 max-w-2xl content-between gap-6 p-5 md:p-6`}>
          <div>
            <div className="mb-5 flex items-start justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent"><Mic2 className="size-5" aria-hidden="true" /></span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Available
              </span>
            </div>
            <h3 className="text-xl font-black">Word training</h3>
            <p className="mt-2 leading-relaxed text-muted">Translate individual words, record their pronunciation, and validate dialect submissions.</p>
          </div>
          <div>
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold text-muted">
              <span className="rounded-md bg-surface-muted px-2 py-1">Translation + voice</span>
              <span className="rounded-md bg-surface-muted px-2 py-1">{dialectTag?.toUpperCase() ?? 'Your dialect'}</span>
            </div>
            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark sm:w-auto" onClick={onStartTask} type="button">
              Start task <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </article>
      ) : (
        <MyTasksView />
      )}
    </div>
  );
}

type TaskDisplayStatus = 'PENDING' | 'TRANSCRIBED' | 'SCORED' | 'SETTLED' | 'REJECTED' | 'EXPIRED' | 'FAILED';

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
function deriveTaskStatus(submission: TrainerSubmissionSummary, nowMs: number, slaMs: number): TaskDisplayStatus {
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
  const parts = [`Transcript/exact-match: ${submission.score !== null ? Number(submission.score).toFixed(1) : '—'}%`];
  if (submission.noiseScore !== null) parts.push(`Background noise: ${Number(submission.noiseScore).toFixed(1)}%`);
  if (submission.qualityScore !== null) parts.push(`Audio quality: ${Number(submission.qualityScore).toFixed(1)}%`);
  if (submission.livenessScore !== null) parts.push(`Voice liveness: ${Number(submission.livenessScore).toFixed(1)}%`);
  parts.push(`Composite (used for payout): ${Number(submission.compositeScore).toFixed(1)}%`);
  return parts.join('\n');
}

/**
 * Two independent task pipelines feed My Tasks/My Scores: sentence-dictation
 * Submissions (consensus-scored) and word-training WordRecordings (scored
 * via exact-match / peer reverse-validation) -- see WordRecording's doc
 * comment in schema.prisma. Both share the same status/score/payout shape,
 * so they're merged into one client-side-paginated list here rather than
 * shown as two separate tables.
 */
const MERGE_FETCH_PAGE_SIZE = 50;

function useMergedSubmissions(status: TrainerSubmissionSummary['status'][], page: number, pageSize: number, pollingInterval?: number) {
  const submissions = useGetMySubmissionsQuery({ page: 1, pageSize: MERGE_FETCH_PAGE_SIZE, status }, { pollingInterval });
  const wordRecordings = useGetMyWordRecordingsQuery({ page: 1, pageSize: MERGE_FETCH_PAGE_SIZE, status }, { pollingInterval });

  const isLoading = submissions.isLoading || wordRecordings.isLoading;
  const isFetching = submissions.isFetching || wordRecordings.isFetching;
  const isError = submissions.isError && wordRecordings.isError;

  const merged = [...(submissions.data?.items ?? []), ...(wordRecordings.data?.items ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = merged.slice((page - 1) * pageSize, page * pageSize);

  function refetch() {
    void submissions.refetch();
    void wordRecordings.refetch();
  }

  return { items, total, totalPages, isLoading, isFetching, isError, refetch };
}

function MyTasksView() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { items, total, totalPages, isLoading, isFetching, isError, refetch } = useMergedSubmissions(
    ['PENDING', 'TRANSCRIBED'],
    page,
    pageSize,
    10000,
  );
  const now = Date.now();
  const scoringSlaLabel = formatDurationLabel(useScoringSlaMs());

  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-4">
        <span className="grid size-9 place-items-center rounded-lg bg-[#e8f0fe] text-[#3B6DF0]"><Clock3 className="size-5" aria-hidden="true" /></span>
        <div>
          <h3 className="font-black">Submitted tasks</h3>
          <p className="text-sm text-muted">Consensus scoring completes once enough trainers submit the same prompt, typically within {scoringSlaLabel}.</p>
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
          <button className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted" onClick={() => void refetch()} type="button">
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
                  <th className="px-5 py-3.5" scope="col">Prompt</th>
                  <th className="px-5 py-3.5" scope="col">Dialect</th>
                  <th className="px-5 py-3.5" scope="col">Status</th>
                  <th className="px-5 py-3.5" scope="col">Time to scoring</th>
                  <th className="px-5 py-3.5 text-right" scope="col">Est. reward</th>
                  <th className="px-5 py-3.5" scope="col">Submitted</th>
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
        <EmptyPanel actionHref="/dashboard?view=training" actionLabel="Start training" icon={Headphones} title="No tasks submitted yet" unframed />
      )}

      {total > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
          <p className="text-sm font-bold text-muted">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button aria-label="Previous page" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button aria-label="Next page" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= totalPages || isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
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
  const finalized = submission.status === 'SCORED' || submission.status === 'SETTLED' || submission.status === 'REJECTED';
  if (finalized) return <span className="text-muted">—</span>;
  if (remaining <= 0) return <span className="font-bold text-danger">Expired</span>;
  return <span className="font-mono font-bold">{formatCountdown(remaining)}</span>;
}

let activeTaskAudio: HTMLAudioElement | null = null;

function TaskAudioButton({ audioUrl, label }: { audioUrl: string | null; label: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (activeTaskAudio === audioRef.current) activeTaskAudio = null;
    }
  }, []);

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

  const title = audioUrl ? `${isPlaying || isLoading ? 'Stop' : 'Play'} recording for ${label}` : 'Recording unavailable';

  return (
    <button
      aria-label={title}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-accent shadow-sm transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!audioUrl}
      onClick={togglePlayback}
      title={title}
      type="button"
    >
      {isPlaying || isLoading ? <Square className="size-4 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />}
    </button>
  );
}

function TaskRow({ submission, now }: { submission: TrainerSubmissionSummary; now: number }) {
  const displayStatus = deriveTaskStatus(submission, now, useScoringSlaMs());
  return (
    <tr className="hover:bg-surface-muted/60">
      <td className="max-w-64 px-5 py-4" title={submission.promptText}>
        <div className="flex min-w-0 items-center gap-3">
          <TaskAudioButton audioUrl={submission.audioUrl} label={submission.promptText} />
          <span className="min-w-0 truncate font-bold">{submission.promptText}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-muted">{submission.dialectTag.toUpperCase()}</td>
      <td className="px-5 py-4">
        <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${taskStatusTones[displayStatus]}`}>
          {taskStatusLabels[displayStatus]}
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-4">
        <TaskCountdownCell submission={submission} />
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-muted">
        {submission.payoutTokenAmount !== null ? `+${formatTokens(submission.payoutTokenAmount)} DL` : estimatedReward(submission.tokensSpent)}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-muted">{formatDateTime(submission.createdAt)}</td>
    </tr>
  );
}

function TaskCard({ submission, now }: { submission: TrainerSubmissionSummary; now: number }) {
  const displayStatus = deriveTaskStatus(submission, now, useScoringSlaMs());
  const finalized = submission.status === 'SCORED' || submission.status === 'SETTLED' || submission.status === 'REJECTED';
  return (
    <article className="grid gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TaskAudioButton audioUrl={submission.audioUrl} label={submission.promptText} />
          <p className="min-w-0 truncate font-bold" title={submission.promptText}>{submission.promptText}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-extrabold ${taskStatusTones[displayStatus]}`}>
          {taskStatusLabels[displayStatus]}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-muted">{submission.dialectTag.toUpperCase()} &middot; {formatDateTime(submission.createdAt)}</p>
          {!finalized && (
            <p className="font-bold">
              Time to scoring: <TaskCountdownCell submission={submission} />
            </p>
          )}
        </div>
        <span className="shrink-0 font-black text-muted">
          {submission.payoutTokenAmount !== null ? `+${formatTokens(submission.payoutTokenAmount)}` : estimatedReward(submission.tokensSpent)}
        </span>
      </div>
    </article>
  );
}

function ReferralsView({ data, email }: { data: TrainerDashboardSummary; email: string }) {
  const [copied, setCopied] = useState(false);
  const [referralLink, setReferralLink] = useState(`/register?ref=${data.referrals.code}`);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sendReferralInvite, { isLoading: inviteSending }] = useSendReferralInviteMutation();

  useEffect(() => setReferralLink(`${window.location.origin}/register?ref=${data.referrals.code}`), [data.referrals.code]);

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
      await sendReferralInvite({ firstName: inviteFirstName.trim(), email: inviteEmail.trim() }).unwrap();
      setInviteMessage('Invitation sent successfully.');
      setInviteFirstName('');
      setInviteEmail('');
      setInviteOpen(false);
    } catch (err) {
      setInviteError(normalizeErrorMessage(err, 'Unable to send invitation right now.'));
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <ViewHeading title="Referrals" subtitle="Your invitations and credited lifetime referral bonuses." />
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
        <MetricCard icon={Users} label="People invited" value={data.referrals.invitedCount.toLocaleString()} tone="purple" />
        <MetricCard icon={CircleDollarSign} label="Bonus earned" value={formatCompactTokensLabel(data.referralEarningsTokens)} tone="green" compact />
        <MetricCard icon={BadgeCheck} label="Referral code" value={data.referrals.code} tone="blue" compact />
      </section>
      <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className={`${cardClass} p-5`}>
          <h3 className="text-lg font-black">Invitation link</h3>
          <p className="mt-1 text-sm text-muted">Signed in as {email}</p>
          <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-muted p-2 pl-3">
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{referralLink}</span>
            <button className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white" onClick={copyLink} type="button" title="Copy invitation link">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              <span className="sr-only">{copied ? 'Copied' : 'Copy invitation link'}</span>
            </button>
          </div>
        </div>
        <div className={`${cardClass} grid gap-4 p-5`}>
          <RateRow enabled={data.referrals.fundingBonusEnabled} label="Funding bonus" rate={data.referrals.fundingBonusRate} />
          <RateRow enabled={data.referrals.payoutBonusEnabled} label="Training payout bonus" rate={data.referrals.payoutBonusRate} />
        </div>
      </section>
      <section className="mt-8">
        <SectionTitle title="Recent invitations" subtitle="People invited or registered under your referral network." />
        {data.referrals.recentInvites.length ? (
          <div className={`${cardClass} divide-y divide-line`}>
            {data.referrals.recentInvites.map((invite) => (
              <div className="flex items-center gap-3 p-4" key={invite.id}>
                <Avatar email={invite.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{invite.firstName ?? invite.email}</p>
                  <p className="truncate text-sm text-muted">{invite.email}</p>
                  <p className="text-sm text-muted">
                    {invite.status === 'JOINED' ? 'Joined' : 'Invited'} {formatDate(invite.createdAt)}
                  </p>
                </div>
                {invite.status === 'JOINED' ? (
                  <BadgeCheck className="size-5 shrink-0 text-emerald-600" aria-label="Joined" />
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">Invited</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel icon={Users} title="No invitations yet" actionHref={undefined} actionLabel={undefined} />
        )}
      </section>
    </div>
  );
}

function ProfileView({ session, update }: { session: Session; update: SessionUpdateFn }) {
  const [firstName, setFirstName] = useState(session.user.firstName ?? '');
  const [lastName, setLastName] = useState(session.user.lastName ?? '');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [instructions, setInstructions] = useState('');
  const [paymentOtpRequestId, setPaymentOtpRequestId] = useState('');
  const [paymentOtpCode, setPaymentOtpCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const { data: me } = useGetMeQuery();
  const { data: methods = [] } = useGetP2PPaymentMethodsQuery();
  const [requestPaymentOtp, { isLoading: paymentOtpSending }] = useRequestP2PPaymentMethodOtpMutation();
  const [createPaymentMethod, { isLoading: paymentCreating }] = useCreateP2PPaymentMethodMutation();
  const [updatePaymentMethod, { isLoading: paymentUpdating }] = useUpdateP2PPaymentMethodMutation();
  const primaryMethod = methods.find((method) => method.enabled);
  const paymentSaving = paymentCreating || paymentUpdating;
  const { data: referenceRate } = useGetP2PReferenceRateQuery();
  const phoneVerified = me?.phoneVerified ?? false;
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtpRequestId, setPhoneOtpRequestId] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [requestPhoneOtp, { isLoading: phoneOtpSending }] = useRequestPhoneOtpMutation();
  const [verifyPhone, { isLoading: phoneVerifying }] = useVerifyPhoneMutation();
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const phoneValid = isValidPhoneNumber(normalizedPhoneNumber);
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotificationsEnabled: true,
    smsNotificationsEnabled: true,
    marketingNotificationsEnabled: false,
    blogNewsNotificationsEnabled: false,
  });
  const [notificationSaving, setNotificationSaving] = useState<NotificationPreferenceKey | null>(null);

  const dirty = firstName.trim() !== (session.user.firstName ?? '') || lastName.trim() !== (session.user.lastName ?? '');
  const paymentPayload = {
    label: 'Bank transfer',
    methodType: 'BANK_TRANSFER',
    fiatCurrency: primaryMethod?.fiatCurrency ?? referenceRate?.currencyCode ?? 'NGN',
    bankName: bankName.trim(),
    accountName: accountName.trim(),
    accountNumber: accountNumber.trim(),
    instructions: instructions.trim() || undefined,
    enabled: true,
  };
  const paymentDirty = bankName.trim() !== (primaryMethod?.bankName ?? '') ||
    accountName.trim() !== (primaryMethod?.accountName ?? '') ||
    accountNumber.trim() !== (primaryMethod?.accountNumber ?? '') ||
    instructions.trim() !== (primaryMethod?.instructions ?? '');

  useEffect(() => {
    setBankName(primaryMethod?.bankName ?? '');
    setAccountName(primaryMethod?.accountName ?? '');
    setAccountNumber(primaryMethod?.accountNumber ?? '');
    setInstructions(primaryMethod?.instructions ?? '');
    setPaymentOtpRequestId('');
    setPaymentOtpCode('');
  }, [primaryMethod?.id, primaryMethod?.bankName, primaryMethod?.accountName, primaryMethod?.accountNumber, primaryMethod?.instructions]);

  function updatePaymentField(setter: (value: string) => void, value: string) {
    setter(value);
    setPaymentOtpRequestId('');
    setPaymentOtpCode('');
  }

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
    });
  }, [
    me?.emailNotificationsEnabled,
    me?.smsNotificationsEnabled,
    me?.marketingNotificationsEnabled,
    me?.blogNewsNotificationsEnabled,
  ]);

  function updatePhoneField(value: string) {
    setPhoneNumber(normalizePhoneNumber(value));
    setPhoneOtpRequestId('');
    setPhoneOtpCode('');
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

  async function submitPhoneVerification(event: FormEvent) {
    event.preventDefault();
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      if (!phoneOtpRequestId) {
        await sendPhoneOtp();
        return;
      }
      await verifyPhone({ phoneNumber: normalizedPhoneNumber, otpRequestId: phoneOtpRequestId, code: phoneOtpCode.trim() }).unwrap();
      setPhoneOtpRequestId('');
      setPhoneOtpCode('');
      setPhoneMessage('Phone number verified.');
    } catch (err) {
      setPhoneError(normalizeErrorMessage(err, 'Could not verify phone number.'));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const profile = await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() }).unwrap();
      await update({ firstName: profile.firstName, lastName: profile.lastName });
      setMessage('Profile updated.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save your profile.'));
    }
  }

  async function requestPaymentMethodOtp() {
    setMessage(null);
    setError(null);
    try {
      const otp = await requestPaymentOtp({ ...paymentPayload, id: primaryMethod?.id }).unwrap();
      setPaymentOtpRequestId(otp.otpRequestId);
      setPaymentOtpCode('');
      setMessage('Verification code sent to your email.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send verification code.'));
    }
  }

  async function savePaymentMethod(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      if (!paymentOtpRequestId) {
        await requestPaymentMethodOtp();
        return;
      }
      const body = { ...paymentPayload, otpRequestId: paymentOtpRequestId, code: paymentOtpCode.trim() };
      if (primaryMethod) {
        await updatePaymentMethod({ id: primaryMethod.id, body }).unwrap();
      } else {
        await createPaymentMethod(body).unwrap();
      }
      setPaymentOtpRequestId('');
      setPaymentOtpCode('');
      setMessage('Payment method saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save payment method.'));
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
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
            <span className="text-xs font-medium text-muted">Email can&apos;t be changed here.</span>
          </label>
          {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{message}</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{error}</p>}
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

        <EmailVerificationCard email={session.user.email ?? ''} emailVerified={me?.emailVerified ?? false} />

        <form className={`${cardClass} grid gap-4 p-5`} onSubmit={submitPhoneVerification}>
          <SectionTitle
            title="Phone number"
            subtitle={phoneVerified ? 'Verified. Required for payment methods and P2P trading.' : 'Verify by SMS before adding a payment method or trading on the P2P market.'}
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
                buttonClassName: '!min-h-11 !rounded-l-lg !rounded-r-none !border !border-line !border-r-0 !bg-surface !pl-3',
                buttonContentWrapperClassName: '!gap-1.5',
                flagClassName: '!m-0',
              }}
              dialCodePreviewStyleProps={{
                className: '!min-h-11 !items-center !border !border-line !border-r-0 !bg-surface !px-2 !font-extrabold !text-muted',
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
          {!phoneVerified && phoneOtpRequestId ? (
            <label className="grid gap-1.5 text-sm font-bold">
              SMS verification code
              <input
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setPhoneOtpCode(event.target.value)}
                required
                value={phoneOtpCode}
              />
            </label>
          ) : null}
          {phoneMessage && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{phoneMessage}</p>}
          {phoneError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{phoneError}</p>}
          {!phoneVerified && (
            <div className="flex flex-wrap gap-2">
              <ActionButton
                className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!phoneValid}
                onClick={() => void sendPhoneOtp()}
                pending={phoneOtpSending}
                pendingLabel="Sending"
                type="button"
              >
                Send code
              </ActionButton>
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!phoneValid || !phoneOtpRequestId || !phoneOtpCode.trim()}
                pending={phoneVerifying}
                pendingLabel="Verifying"
                type="submit"
              >
                Verify
              </ActionButton>
            </div>
          )}
        </form>

        <form className={`${cardClass} grid gap-4 p-5`} onSubmit={savePaymentMethod}>
          <SectionTitle title="Payment method" subtitle="Stored in Profile and protected by email 2FA for every edit." />
          {!phoneVerified && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Verify your phone number above before adding a payment method.
            </p>
          )}
          <fieldset className="contents" disabled={!phoneVerified}>
          <label className="grid gap-1.5 text-sm font-bold">
            Bank name
            <input
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
              onChange={(event) => updatePaymentField(setBankName, event.target.value)}
              required
              value={bankName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Account number
            <input
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
              inputMode="numeric"
              onChange={(event) => updatePaymentField(setAccountNumber, event.target.value)}
              required
              value={accountNumber}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Account name
            <input
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
              onChange={(event) => updatePaymentField(setAccountName, event.target.value)}
              required
              value={accountName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Notes <span className="font-normal text-muted">(optional)</span>
            <textarea
              className="min-h-20 resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
              onChange={(event) => updatePaymentField(setInstructions, event.target.value)}
              placeholder="Anything a buyer should know before paying, e.g. preferred payment window or reference format"
              value={instructions}
            />
          </label>
          {paymentOtpRequestId ? (
            <label className="grid gap-1.5 text-sm font-bold">
              Email verification code
              <input
                className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setPaymentOtpCode(event.target.value)}
                required
                value={paymentOtpCode}
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ActionButton
              className="min-h-11 rounded-lg border border-line px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!paymentDirty || !bankName.trim() || !accountName.trim() || !accountNumber.trim()}
              onClick={() => void requestPaymentMethodOtp()}
              pending={paymentOtpSending}
              pendingLabel="Sending"
              type="button"
            >
              Email code
            </ActionButton>
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!paymentDirty || !paymentOtpRequestId || !paymentOtpCode.trim()}
              pending={paymentSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save bank details
            </ActionButton>
          </div>
          </fieldset>
        </form>

        <div className={`${cardClass} grid content-start gap-4 p-5`}>
          <SectionTitle title="Notifications" subtitle="Choose how Dialect Library should reach you." />
          <div className="grid divide-y divide-line overflow-hidden rounded-lg border border-line">
            <NotificationToggleRow
              checked={notificationPrefs.emailNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Email"
              loading={notificationSaving === 'emailNotificationsEnabled'}
              onChange={(checked) => void toggleNotificationPreference('emailNotificationsEnabled', checked)}
              subtitle="Account, task, payout, and security updates."
            />
            <NotificationToggleRow
              checked={notificationPrefs.smsNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="SMS"
              loading={notificationSaving === 'smsNotificationsEnabled'}
              onChange={(checked) => void toggleNotificationPreference('smsNotificationsEnabled', checked)}
              subtitle="Urgent account and trade notifications."
            />
            <NotificationToggleRow
              checked={notificationPrefs.marketingNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Marketing"
              loading={notificationSaving === 'marketingNotificationsEnabled'}
              onChange={(checked) => void toggleNotificationPreference('marketingNotificationsEnabled', checked)}
              subtitle="Product offers and campaign updates."
            />
            <NotificationToggleRow
              checked={notificationPrefs.blogNewsNotificationsEnabled}
              disabled={notificationSaving !== null}
              label="Blog & News"
              loading={notificationSaving === 'blogNewsNotificationsEnabled'}
              onChange={(checked) => void toggleNotificationPreference('blogNewsNotificationsEnabled', checked)}
              subtitle="New articles, platform news, and learning content."
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
  | 'blogNewsNotificationsEnabled';

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
  const { items, total, totalPages, isLoading, isFetching, isError, refetch } = useMergedSubmissions(
    ['SCORED', 'SETTLED', 'REJECTED', 'EXPIRED'],
    page,
    pageSize,
    10000,
  );

  return (
    <div>
      <ViewHeading title="My Scores" subtitle="Consensus results from eligible voice training submissions." />
      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-[#fff0e8] text-[#b54b16] dark:bg-[#3a2119] dark:text-[#ff9b68]"><Star className="size-5" aria-hidden="true" /></span>
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
            <button className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted" onClick={() => void refetch()} type="button">
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
                    <th className="px-5 py-3.5" scope="col">Prompt</th>
                    <th className="px-5 py-3.5" scope="col">Dialect</th>
                    <th className="px-5 py-3.5" scope="col">Status</th>
                    <th className="px-5 py-3.5 text-right" scope="col">Score</th>
                    <th className="px-5 py-3.5 text-right" scope="col">Payout (est.)</th>
                    <th className="px-5 py-3.5" scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((submission) => (
                    <tr className="hover:bg-surface-muted/60" key={submission.id}>
                      <td className="max-w-64 truncate px-5 py-4 font-bold" title={submission.promptText}>{submission.promptText}</td>
                      <td className="px-5 py-4 text-muted">{submission.dialectTag.toUpperCase()}</td>
                      <td className="px-5 py-4">
                        <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${submissionStatusTones[submission.status]}`}>
                          {submissionStatusLabels[submission.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-bold" title={qualityBreakdownTitle(submission)}>
                        {submission.score !== null ? `${Number(submission.score).toFixed(1)}%` : '—'}
                        {submission.compositeScore !== null && Number(submission.compositeScore).toFixed(1) !== Number(submission.score).toFixed(1) && (
                          <span className="ml-1 font-normal text-muted">({Number(submission.compositeScore).toFixed(1)}% paid)</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-black text-emerald-700 dark:text-emerald-300">
                        {submission.payoutTokenAmount !== null
                          ? `+${formatTokens(submission.payoutTokenAmount)}`
                          : submission.score !== null
                            ? `~${formatTokens(estimatedScoredPayout(submission.tokensSpent, submission.score))}`
                            : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted">{formatDateTime(submission.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {items.map((submission) => (
                <article className="grid gap-3 p-4" key={submission.id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-bold" title={submission.promptText}>{submission.promptText}</p>
                    <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-extrabold ${submissionStatusTones[submission.status]}`}>
                      {submissionStatusLabels[submission.status]}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-muted">{submission.dialectTag.toUpperCase()} &middot; {formatDateTime(submission.createdAt)}</p>
                      {submission.score !== null && (
                        <p className="font-bold" title={qualityBreakdownTitle(submission)}>
                          Score: {Number(submission.score).toFixed(1)}%
                          {submission.compositeScore !== null && Number(submission.compositeScore).toFixed(1) !== Number(submission.score).toFixed(1) && (
                            <span className="font-normal text-muted"> ({Number(submission.compositeScore).toFixed(1)}% paid)</span>
                          )}
                        </p>
                      )}
                    </div>
                    {submission.payoutTokenAmount !== null ? (
                      <span className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">+{formatTokens(submission.payoutTokenAmount)}</span>
                    ) : submission.score !== null ? (
                      <span className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">~{formatTokens(estimatedScoredPayout(submission.tokensSpent, submission.score))}</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel actionHref="/dashboard?view=training" actionLabel="Start training" icon={Headphones} title="No scored submissions yet" unframed />
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3 md:px-5">
            <p className="text-sm font-bold text-muted">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button aria-label="Previous page" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button aria-label="Next page" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= totalPages || isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FundTokensDialog() {
  const [amount, setAmount] = useState('10');
  const [currency, setCurrency] = useState<'USDC' | 'USDT'>('USDT');
  const [message, setMessage] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestDepositOtpMutation();
  const [createDeposit, { isLoading: isCreating }] = useCreateTokenDepositMutation();

  async function submitAmount(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const usdAmount = Number(amount);
      const result = await requestOtp({ usdAmount, currency }).unwrap();
      setOtpRequestId(result.otpRequestId);
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not send a confirmation code.'));
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!otpRequestId) return;
    setMessage(null);
    try {
      const result = await createDeposit({ usdAmount: Number(amount), currency, otpRequestId, code }).unwrap();
      window.location.assign(result.hostedCheckoutUrl);
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not start DL funding.'));
    }
  }

  function reset() {
    setOtpRequestId(null);
    setCode('');
    setMessage(null);
  }

  return (
    <Dialog onOpenChange={(open) => !open && reset()}>
      <DialogTrigger asChild>
        <button className="mt-0.5 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent-dark md:px-4" type="button">
          <Plus className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Fund DL</span><span className="sm:hidden">Fund</span>
        </button>
      </DialogTrigger>
      {otpRequestId ? (
        <DialogContent title="Enter your code" description="We emailed a 6-digit code to confirm this purchase.">
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
            {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{message}</p>}
            <ActionButton className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark" disabled={code.length !== 6} pending={isCreating} pendingLabel="Opening checkout" type="submit">
              Continue to checkout <ArrowUpRight className="size-4" aria-hidden="true" />
            </ActionButton>
          </form>
        </DialogContent>
      ) : (
        <DialogContent title="Fund DL" description="Continue to secure USDC or USDT checkout.">
          <form className="grid gap-4" onSubmit={submitAmount}>
            <label className="grid gap-1.5 text-sm font-bold">
              Amount in USD
              <input className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent" min="1" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} />
            </label>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-bold">Payment currency</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['USDT', 'USDC'] as const).map((option) => (
                  <label className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-extrabold ${currency === option ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`} key={option}>
                    <input className="sr-only" checked={currency === option} name="currency" onChange={() => setCurrency(option)} type="radio" />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
            {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{message}</p>}
            <ActionButton className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark" pending={isRequestingOtp} pendingLabel="Sending code" type="submit">
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

function WithdrawTokensDialog({ balance, minWithdrawalTokens }: { balance: string; minWithdrawalTokens: string }) {
  const [amount, setAmount] = useState(minWithdrawalTokens);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationCurrency, setDestinationCurrency] = useState<WithdrawalCurrency>('USDT');
  const [destinationNetwork, setDestinationNetwork] = useState<WithdrawalNetwork>('TRC20');
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [requestOtp, { isLoading: isRequestingOtp }] = useRequestWithdrawalOtpMutation();
  const [createWithdrawal, { isLoading: isSubmitting }] = useCreateWithdrawalMutation();

  const addressLooksValid = destinationAddress.length === 0 || WITHDRAWAL_ADDRESS_PATTERNS[destinationNetwork].test(destinationAddress.trim());

  function updateCurrency(currency: WithdrawalCurrency) {
    setDestinationCurrency(currency);
    setDestinationNetwork(WITHDRAWAL_NETWORKS_BY_CURRENCY[currency][0]);
    setAddressConfirmed(false);
  }

  function updateNetwork(network: WithdrawalNetwork) {
    setDestinationNetwork(network);
    setAddressConfirmed(false);
  }

  async function submitDetails(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!addressLooksValid) {
      setMessage(`That doesn't look like a valid ${destinationNetwork} address.`);
      return;
    }
    if (!addressConfirmed) {
      setMessage('Confirm the destination address before continuing.');
      return;
    }
    try {
      const result = await requestOtp({ tokenAmount: Number(amount), destinationAddress, destinationCurrency, destinationNetwork }).unwrap();
      setOtpRequestId(result.otpRequestId);
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not send a confirmation code.'));
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!otpRequestId) return;
    setMessage(null);
    try {
      await createWithdrawal({ tokenAmount: Number(amount), destinationAddress, destinationCurrency, destinationNetwork, otpRequestId, code }).unwrap();
      setMessage(null);
      setOtpRequestId(null);
      setAmount(minWithdrawalTokens);
      setDestinationAddress('');
      setAddressConfirmed(false);
      setCode('');
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not submit this withdrawal.'));
    }
  }

  function reset() {
    setOtpRequestId(null);
    setCode('');
    setMessage(null);
  }

  return (
    <Dialog onOpenChange={(open) => !open && reset()}>
      <DialogTrigger asChild>
        <button className="mt-0.5 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-extrabold text-ink hover:bg-surface-muted md:px-4" type="button">
          <ArrowUpRight className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Withdraw</span><span className="sm:hidden">Withdraw</span>
        </button>
      </DialogTrigger>
      {otpRequestId ? (
        <DialogContent title="Enter your code" description="We emailed a 6-digit code to confirm this withdrawal.">
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
            {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{message}</p>}
            <ActionButton className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark" disabled={code.length !== 6} pending={isSubmitting} pendingLabel="Submitting" type="submit">
              Confirm withdrawal
            </ActionButton>
          </form>
        </DialogContent>
      ) : (
        <DialogContent title="Withdraw DL" description={`Available balance: ${formatTokens(balance)} DL.`}>
          <form className="grid gap-4" onSubmit={submitDetails}>
            <label className="grid gap-1.5 text-sm font-bold">
              Amount in DL
              <input className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent" min="0.00000001" onChange={(event) => setAmount(event.target.value)} required step="any" type="number" value={amount} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1.5 text-sm font-bold">
                Currency
                <select
                  className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-accent"
                  onChange={(event) => updateCurrency(event.target.value as WithdrawalCurrency)}
                  value={destinationCurrency}
                >
                  {Object.keys(WITHDRAWAL_NETWORKS_BY_CURRENCY).map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
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
                    <option key={network} value={network}>{network}</option>
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
                placeholder={destinationNetwork === 'TRC20' ? 'T...' : destinationNetwork === 'SOL' ? 'Base58 address' : '0x...'}
                required
                type="text"
                value={destinationAddress}
              />
              {!addressLooksValid && <span className="text-xs font-bold text-danger">Doesn&apos;t look like a valid {destinationNetwork} address.</span>}
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
                I confirm that the {destinationCurrency} address above is on the {destinationNetwork} network, belongs
                to my own account, and I have double-checked it is correct. Funds sent to a wrong or unsupported
                network cannot be recovered.
              </span>
            </label>
            {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{message}</p>}
            <ActionButton className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark" disabled={!addressLooksValid || !addressConfirmed} pending={isRequestingOtp} pendingLabel="Sending code" type="submit">
              Send confirmation code
            </ActionButton>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

function MetricCard({ icon: Icon, label, value, tone, compact = false }: { icon: typeof WalletCards; label: string; value: string; tone: 'purple' | 'green' | 'amber' | 'blue'; compact?: boolean }) {
  const tones = {
    purple: 'bg-accent-soft text-accent',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  };
  return (
    <article className={`${cardClass} flex min-h-32 items-start gap-3 p-4 md:p-5`}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-muted">{label}</p>
        <p className={`mt-2 break-words font-black leading-tight ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</p>
      </div>
    </article>
  );
}

type ActivityEntry = { id: string; type: LedgerEntryType; amount: string; reference: string; createdAt: string };

function ActivityList({ entries, compact = false }: { entries: ActivityEntry[]; compact?: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = compact ? Math.max(entries.length, 1) : 8;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const startIndex = compact ? 0 : (page - 1) * pageSize;
  const shown = entries.slice(startIndex, startIndex + pageSize);
  const showingFrom = entries.length ? startIndex + 1 : 0;
  const showingTo = Math.min(startIndex + shown.length, entries.length);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  if (!entries.length) return <EmptyPanel icon={Clock3} title="No account activity yet" actionHref={undefined} actionLabel={undefined} />;

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="divide-y divide-line md:hidden">
        {shown.map((entry) => <ActivityMobileRow entry={entry} key={entry.id} />)}
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
            {shown.map((entry) => <ActivityTableRow entry={entry} key={entry.id} />)}
          </tbody>
        </table>
      </div>
      {!compact && entries.length > pageSize ? (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {showingFrom}-{showingTo} of {entries.length}
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
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-surface-muted text-muted'}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold md:text-base">{activityLabels[entry.type]}</p>
        <p className="text-xs text-muted md:text-sm">{formatDate(entry.createdAt)}</p>
      </div>
      <p className={`shrink-0 text-sm font-black md:text-base ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}>
        {positive ? '+' : ''}{formatTokens(entry.amount)}
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
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-surface-muted text-muted'}`}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="font-extrabold text-ink">{activityLabels[entry.type]}</span>
        </div>
      </td>
      <td className="max-w-72 truncate px-4 py-3 font-mono text-xs text-muted">{entry.reference || '-'}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">{formatDate(entry.createdAt)}</td>
      <td className={`whitespace-nowrap px-4 py-3 text-right font-black ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}>
        {positive ? '+' : ''}{formatTokens(entry.amount)}
      </td>
    </tr>
  );
}

const earningsChartRangeLabels: Record<EarningsChartRange, string> = {
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

const earningsChartRangeSubtitles: Record<EarningsChartRange, string> = {
  week: 'DL credited by day, last 7 days.',
  month: 'DL credited by day, last 30 days.',
  year: 'DL credited by month, last 12 months.',
};

function EarningsChartSection() {
  const [range, setRange] = useState<EarningsChartRange>('month');
  const { data, isFetching } = useGetEarningsChartQuery({ range });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle title={earningsChartRangeLabels[range]} subtitle={earningsChartRangeSubtitles[range]} />
        <div className="inline-flex rounded-lg border border-line bg-surface p-1" role="tablist" aria-label="Earnings chart range">
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
      <EarningsChart buckets={data?.buckets ?? []} loading={isFetching && !data} range={range} />
    </div>
  );
}

function EarningsChart({ buckets, range, loading }: { buckets: EarningsChart_Bucket[]; range: EarningsChartRange; loading: boolean }) {
  const max = Math.max(...buckets.map((bucket) => Number(bucket.amount)), 1);
  const dense = range !== 'year' && buckets.length > 14;

  if (loading) {
    return <div className={`${cardClass} grid h-64 place-items-center`}><RefreshCw className="size-5 animate-spin text-accent" aria-hidden="true" /></div>;
  }

  return (
    <div className={`${cardClass} flex h-64 items-end gap-1.5 overflow-x-auto p-4 pt-8 sm:gap-3 md:p-5 md:pt-8`}>
      {buckets.map((bucket) => {
        const value = Number(bucket.amount);
        const height = value > 0 ? Math.max((value / max) * 100, 8) : 2;
        return (
          <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" key={bucket.label}>
            {!dense && <span className="text-xs font-bold text-muted">{value ? formatTokens(value) : ''}</span>}
            <div className="flex h-[150px] w-full max-w-10 items-end rounded-md bg-surface-muted" title={`${formatTokens(value)} DL`}>
              <div className="w-full rounded-md bg-accent" style={{ height: `${height}%` }} />
            </div>
            <span className="text-xs font-extrabold text-muted">
              {dense ? formatBucketDayNumber(bucket.label) : formatBucketLabel(bucket.label, range)}
            </span>
          </div>
        );
      })}
    </div>
  );
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
  const date = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function RateRow({ label, rate, enabled }: { label: string; rate: string; enabled: boolean }) {
  const percentage = enabled ? Number(rate) * 100 : 0;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
      <div>
        <p className="font-extrabold">{label}</p>
        <p className="text-sm text-muted">{enabled && percentage > 0 ? 'Active' : 'Not active'}</p>
      </div>
      <span className={`text-xl font-black ${enabled && percentage > 0 ? 'text-accent' : 'text-muted'}`}>{percentage.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</span>
    </div>
  );
}

function DashboardLoading() {
  return <div className="dashboard-theme min-h-screen animate-pulse bg-bg"><div className="h-16 border-b border-line bg-surface" /><div className="mx-auto max-w-6xl space-y-6 px-4 py-8"><div className="h-16 w-72 rounded-lg bg-surface-muted" /><div className="grid gap-3 sm:grid-cols-3"><div className="h-32 rounded-lg bg-surface" /><div className="h-32 rounded-lg bg-surface" /><div className="h-32 rounded-lg bg-surface" /></div></div></div>;
}

function ViewLoading() {
  return <div className="animate-pulse space-y-5"><div className="h-14 w-64 rounded-lg bg-surface-muted" /><div className="grid gap-3 sm:grid-cols-3"><div className="h-32 rounded-lg bg-surface" /><div className="h-32 rounded-lg bg-surface" /><div className="h-32 rounded-lg bg-surface" /></div><div className="h-64 rounded-lg bg-surface" /></div>;
}

function DashboardError({ retry }: { retry: () => void }) {
  return <section className={`${cardClass} grid min-h-64 place-items-center p-6 text-center`}><div className="grid justify-items-center gap-3"><RefreshCw className="size-6 text-danger" aria-hidden="true" /><h2 className="text-xl font-black">Dashboard data is unavailable</h2><button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white" onClick={retry} type="button"><RefreshCw className="size-4" aria-hidden="true" />Try again</button></div></section>;
}

function formatTokens(value: string | number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCompactTokensValue(value: string | number) {
  return formatCompactNumber(value);
}

function formatCompactTokensLabel(value: string | number) {
  return `${formatCompactNumber(value)} DL`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
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

function emailName(email?: string | null) {
  if (!email) return 'Trainer';
  return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

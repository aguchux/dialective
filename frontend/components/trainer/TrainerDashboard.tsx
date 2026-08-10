'use client';

import { FormEvent, useEffect, useState } from 'react';
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
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  Database,
  FileText as FileTextIcon,
  Headphones,
  LogOut,
  Mic2,
  Plus,
  RefreshCw,
  Shield as ShieldIcon,
  Sparkles,
  Star,
  User as UserIcon,
  Users,
  WalletCards,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  LedgerEntryType,
  TrainerDashboardSummary,
  normalizeErrorMessage,
  useCreateTokenDepositMutation,
  useGetTrainerDashboardQuery,
  useUpdateProfileMutation,
} from '@/store/api';
import type { Session } from 'next-auth';

type SessionUpdateFn = (data?: Record<string, unknown>) => Promise<Session | null>;

type DashboardView = 'tokens' | 'earnings' | 'pools' | 'referrals' | 'scores' | 'profile';

const views: { id: DashboardView; label: string; icon: typeof WalletCards }[] = [
  { id: 'tokens', label: 'Tokens', icon: WalletCards },
  { id: 'earnings', label: 'Earnings', icon: CircleDollarSign },
  { id: 'pools', label: 'Pools', icon: Database },
  { id: 'referrals', label: 'Referrals', icon: Users },
  { id: 'scores', label: 'My Scores', icon: Star },
];

// Reachable only from the account dropdown, not the main tab bar/mobile nav.
const allViewIds: DashboardView[] = [...views.map((view) => view.id), 'profile'];

const earningTypes: LedgerEntryType[] = [
  'TRAINING_PAYOUT',
  'REFERRAL_COMMISSION',
  'REFERRAL_FUNDING_BONUS',
  'REFERRAL_PAYOUT_BONUS',
];

const activityLabels: Record<LedgerEntryType, string> = {
  DEPOSIT: 'Token funding',
  TRAINING_PAYOUT: 'Training payout',
  WITHDRAWAL: 'Payout request',
  WITHDRAWAL_REVERSED: 'Payout returned',
  REFERRAL_COMMISSION: 'Referral bonus',
  REFERRAL_FUNDING_BONUS: 'Funding referral bonus',
  REFERRAL_PAYOUT_BONUS: 'Training referral bonus',
};

const cardClass = 'min-w-0 rounded-lg border border-line bg-surface shadow-[0_8px_24px_rgba(31,25,41,0.04)]';

export function TrainerDashboard() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);
  const requestedView = searchParams.get('view');
  const displayName = [session?.user.firstName, session?.user.lastName].filter(Boolean).join(' ');
  const activeView = allViewIds.includes(requestedView as DashboardView) ? (requestedView as DashboardView) : 'tokens';
  const { data, isLoading, isFetching, error, refetch } = useGetTrainerDashboardQuery(undefined, {
    skip: status !== 'authenticated' || session?.user.role === 'ADMIN',
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session.user.role === 'ADMIN') router.replace('/admin');
    else if (!session.user.onboardingComplete) router.replace('/onboarding');
  }, [router, session, status]);

  if (
    status === 'loading' ||
    (status === 'authenticated' && (session.user.role === 'ADMIN' || !session.user.onboardingComplete))
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

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          <section className="mb-7 flex items-center gap-3 border-b border-line pb-6 md:gap-4">
            <Avatar email={session.user.email ?? 'Trainer'} image={session.user.image} large />
            <div className="min-w-0">
              <p className="text-sm font-bold text-muted">Welcome back</p>
              <h1 className="truncate text-2xl font-black md:text-3xl">{displayName || emailName(session.user.email)}</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                <BadgeCheck className="size-4 text-emerald-600" aria-hidden="true" />
                <span>{session.user.dialectTag ? `${session.user.dialectTag.toUpperCase()} trainer` : 'Dialect trainer'}</span>
              </div>
            </div>
          </section>

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
            />
          )}
        </main>

        <MobileNavigation activeView={activeView} />
      </PortalContainerProvider>
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
}: {
  activeView: DashboardView;
  data: TrainerDashboardSummary;
  dialectTag: string | null;
  email: string;
  refreshing: boolean;
}) {
  if (activeView === 'earnings') return <EarningsView data={data} refreshing={refreshing} />;
  if (activeView === 'pools') return <PoolsView dialectTag={dialectTag} />;
  if (activeView === 'referrals') return <ReferralsView data={data} email={email} />;
  if (activeView === 'scores') return <ScoresView />;
  return <TokensView data={data} refreshing={refreshing} />;
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

function TokensView({ data, refreshing }: { data: TrainerDashboardSummary; refreshing: boolean }) {
  const usdValue = Number(data.balance) * data.tokenUsdRate;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <ViewHeading title="Tokens" subtitle="Your available platform balance and account activity." refreshing={refreshing} />
        <FundTokensDialog />
      </div>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Token balance">
        <MetricCard icon={WalletCards} label="Available tokens" value={formatTokens(data.balance)} tone="purple" />
        <MetricCard icon={Banknote} label="Estimated value" value={formatUsd(usdValue)} tone="green" />
        <MetricCard icon={CircleDollarSign} label="Current rate" value={`${formatUsd(data.tokenUsdRate)} / token`} tone="amber" compact />
      </section>
      <section className="mt-8">
        <SectionTitle title="Recent activity" subtitle="Funding, earnings, referrals, and payouts." />
        <ActivityList entries={data.recentActivity} />
      </section>
    </div>
  );
}

function EarningsView({ data, refreshing }: { data: TrainerDashboardSummary; refreshing: boolean }) {
  const total = Number(data.trainingEarningsTokens) + Number(data.referralEarningsTokens);
  const earnings = data.recentActivity.filter((entry) => earningTypes.includes(entry.type));
  return (
    <div>
      <ViewHeading title="Earnings" subtitle="Training payouts and referral bonuses credited to your wallet." refreshing={refreshing} />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Earnings summary">
        <MetricCard icon={Sparkles} label="Total earned" value={`${formatTokens(total)} tokens`} tone="purple" compact />
        <MetricCard icon={Mic2} label="Training" value={formatTokens(data.trainingEarningsTokens)} tone="green" />
        <MetricCard icon={Users} label="Referrals" value={formatTokens(data.referralEarningsTokens)} tone="amber" />
        <MetricCard icon={ArrowUpRight} label="Paid out" value={formatTokens(data.paidOutTokens)} tone="blue" />
      </section>
      <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div>
          <SectionTitle title="Six-month earnings" subtitle="Tokens credited by month." />
          <EarningsChart months={data.monthlyEarnings} />
        </div>
        <div>
          <SectionTitle title="Earning history" subtitle="Most recent credited entries." />
          <ActivityList compact entries={earnings} />
        </div>
      </section>
    </div>
  );
}

function PoolsView({ dialectTag }: { dialectTag: string | null }) {
  const pools = [
    {
      title: 'Sentence Voice Pool',
      description: 'Record prompted sentences for speech recognition evaluation.',
      icon: Mic2,
      href: '/pipeline-test',
      task: 'Voice recording',
    },
    {
      title: 'Word Translation Pool',
      description: 'Translate common English words and record their local pronunciation.',
      icon: BookOpenCheck,
      href: '/pipeline-test#word-library',
      task: 'Translation + voice',
    },
  ];

  return (
    <div>
      <ViewHeading title="Available Pools" subtitle="Open contribution pools matched to your trainer account." />
      <div className="grid gap-4 md:grid-cols-2">
        {pools.map((pool) => {
          const Icon = pool.icon;
          return (
            <article className={`${cardClass} grid min-h-64 content-between gap-6 p-5 md:p-6`} key={pool.title}>
              <div>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent"><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Available
                  </span>
                </div>
                <h3 className="text-xl font-black">{pool.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{pool.description}</p>
              </div>
              <div>
                <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold text-muted">
                  <span className="rounded-md bg-surface-muted px-2 py-1">{pool.task}</span>
                  <span className="rounded-md bg-surface-muted px-2 py-1">{dialectTag?.toUpperCase() ?? 'Your dialect'}</span>
                </div>
                <Link className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark sm:w-auto" href={pool.href}>
                  Open pool <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ReferralsView({ data, email }: { data: TrainerDashboardSummary; email: string }) {
  const [copied, setCopied] = useState(false);
  const [referralLink, setReferralLink] = useState(`/register?ref=${data.referrals.code}`);

  useEffect(() => setReferralLink(`${window.location.origin}/register?ref=${data.referrals.code}`), [data.referrals.code]);

  async function copyLink() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div>
      <ViewHeading title="Referrals" subtitle="Your invitations and credited lifetime referral bonuses." />
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Referral summary">
        <MetricCard icon={Users} label="People invited" value={data.referrals.invitedCount.toLocaleString()} tone="purple" />
        <MetricCard icon={CircleDollarSign} label="Bonus earned" value={`${formatTokens(data.referralEarningsTokens)} tokens`} tone="green" compact />
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
        <SectionTitle title="Recent invitations" subtitle="The latest trainers registered with your code." />
        {data.referrals.recentInvites.length ? (
          <div className={`${cardClass} divide-y divide-line`}>
            {data.referrals.recentInvites.map((invite) => (
              <div className="flex items-center gap-3 p-4" key={invite.id}>
                <Avatar email={invite.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{invite.email}</p>
                  <p className="text-sm text-muted">Joined {formatDate(invite.createdAt)}</p>
                </div>
                <BadgeCheck className="size-5 text-emerald-600" aria-label="Registered" />
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  const dirty = firstName.trim() !== (session.user.firstName ?? '') || lastName.trim() !== (session.user.lastName ?? '');

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

        <div className={`${cardClass} grid gap-4 p-5`}>
          <div className="flex items-center gap-3">
            <Avatar email={session.user.email ?? 'Trainer'} image={session.user.image} large />
            <div className="min-w-0">
              <p className="truncate font-black">{[firstName, lastName].filter(Boolean).join(' ') || emailName(session.user.email)}</p>
              <p className="truncate text-sm text-muted">{session.user.dialectTag ? `${session.user.dialectTag.toUpperCase()} trainer` : 'Dialect trainer'}</p>
            </div>
          </div>
          <div className="grid gap-2 border-t border-line pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Referral code</span>
              <span className="font-extrabold">{session.user.referralCode ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Role</span>
              <span className="font-extrabold">Trainer</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoresView() {
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
        <EmptyPanel actionHref="/dashboard?view=pools" actionLabel="Browse pools" icon={Headphones} title="No scored submissions yet" unframed />
      </section>
    </div>
  );
}

function FundTokensDialog() {
  const [amount, setAmount] = useState('10');
  const [currency, setCurrency] = useState<'USDC' | 'USDT'>('USDT');
  const [message, setMessage] = useState<string | null>(null);
  const [createDeposit, { isLoading }] = useCreateTokenDepositMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await createDeposit({ usdAmount: Number(amount), currency }).unwrap();
      window.location.assign(result.hostedCheckoutUrl);
    } catch (error) {
      setMessage(normalizeErrorMessage(error, 'Could not start token funding.'));
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="mt-0.5 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-extrabold text-white hover:bg-accent-dark md:px-4" type="button">
          <Plus className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Fund tokens</span><span className="sm:hidden">Fund</span>
        </button>
      </DialogTrigger>
      <DialogContent title="Fund tokens" description="Continue to secure USDC or USDT checkout.">
        <form className="grid gap-4" onSubmit={submit}>
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
          <ActionButton className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark" pending={isLoading} pendingLabel="Opening checkout" type="submit">
            Continue to checkout <ArrowUpRight className="size-4" aria-hidden="true" />
          </ActionButton>
        </form>
      </DialogContent>
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

function ActivityList({ entries, compact = false }: { entries: TrainerDashboardSummary['recentActivity']; compact?: boolean }) {
  if (!entries.length) return <EmptyPanel icon={Clock3} title="No account activity yet" actionHref={undefined} actionLabel={undefined} />;
  const shown = compact ? entries.slice(0, 6) : entries;
  return (
    <div className={`${cardClass} divide-y divide-line overflow-hidden`}>
      {shown.map((entry) => {
        const positive = Number(entry.amount) >= 0;
        const Icon = entry.type === 'DEPOSIT' ? ArrowDownLeft : positive ? ArrowDownLeft : ArrowUpRight;
        return (
          <div className="flex items-center gap-3 p-3.5 md:px-4" key={entry.id}>
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
      })}
    </div>
  );
}

function EarningsChart({ months }: { months: TrainerDashboardSummary['monthlyEarnings'] }) {
  const max = Math.max(...months.map((month) => Number(month.amount)), 1);
  return (
    <div className={`${cardClass} flex h-64 items-end gap-3 p-4 pt-8 sm:gap-5 md:p-5 md:pt-8`}>
      {months.map((month) => {
        const value = Number(month.amount);
        const height = value > 0 ? Math.max((value / max) * 100, 8) : 2;
        return (
          <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" key={month.month}>
            <span className="text-xs font-bold text-muted">{value ? formatTokens(value) : ''}</span>
            <div className="flex h-[150px] w-full max-w-10 items-end rounded-md bg-surface-muted">
              <div className="w-full rounded-md bg-accent" style={{ height: `${height}%` }} />
            </div>
            <span className="text-xs font-extrabold text-muted">{formatMonth(month.month)}</span>
          </div>
        );
      })}
    </div>
  );
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

function EmptyPanel({ icon: Icon, title, actionHref, actionLabel, unframed = false }: { icon: typeof Users; title: string; actionHref?: string; actionLabel?: string; unframed?: boolean }) {
  return (
    <div className={`${unframed ? '' : cardClass} grid min-h-48 place-items-center p-6 text-center`}>
      <div className="grid justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-surface-muted text-muted"><Icon className="size-5" aria-hidden="true" /></span>
        <p className="font-black">{title}</p>
        {actionHref && actionLabel && <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 font-extrabold text-ink hover:bg-surface-muted" href={actionHref}>{actionLabel}<ArrowRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-3"><h3 className="text-lg font-black md:text-xl">{title}</h3><p className="mt-0.5 text-sm text-muted">{subtitle}</p></div>;
}

function Avatar({ email, image, large = false }: { email: string; image?: string | null; large?: boolean }) {
  const size = large ? 'size-14 text-lg' : 'size-8 text-sm';
  if (image) {
    return <Image alt="" className={`${size} rounded-full border border-line object-cover`} height={large ? 56 : 32} src={image} unoptimized width={large ? 56 : 32} />;
  }
  return <span className={`${size} grid shrink-0 place-items-center rounded-full bg-accent font-black text-white`} aria-hidden="true">{email.charAt(0).toUpperCase()}</span>;
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

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${value}-01T00:00:00Z`));
}

function emailName(email?: string | null) {
  if (!email) return 'Trainer';
  return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

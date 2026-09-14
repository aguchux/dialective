'use client';

import { useRef, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { SettingsSearch, SettingsSearchMatch } from './SettingsSearch';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { ReferralBonusSettingsPanel } from './ReferralBonusSettingsPanel';
import { TrainingTasksSettingsPanel } from './TrainingTasksSettingsPanel';
import { WordGenerationSettingsPanel } from './WordGenerationSettingsPanel';
import { QualityGateSettingsPanel } from './QualityGateSettingsPanel';
import { TestimonySettingsPanel } from './TestimonySettingsPanel';
import { SpeechExpressionSettingsPanel } from './SpeechExpressionSettingsPanel';
import { SpellingNormalizationSettingsPanel } from './SpellingNormalizationSettingsPanel';
import { P2PMarketSettingsPanel } from './P2PMarketSettingsPanel';
import { SmsSettingsPanel } from './SmsSettingsPanel';
import { WhatsappMessagingSettingsPanel } from './WhatsappMessagingSettingsPanel';
import { WithdrawalSettingsPanel } from './WithdrawalSettingsPanel';
import { FlutterwaveSettingsPanel } from './FlutterwaveSettingsPanel';
import { KycSettingsPanel } from './KycSettingsPanel';
import { MaintenanceSettingsPanel } from './MaintenanceSettingsPanel';
import { DistributorSettingsPanel } from './DistributorSettingsPanel';
import { LiveChatSettingsPanel } from './LiveChatSettingsPanel';
import { DatasetStorageSettingsPanel } from './DatasetStorageSettingsPanel';
import { LandingPageSettingsPanel } from './LandingPageSettingsPanel';
import { ApiAccessTokensSettingsPanel } from './ApiAccessTokensSettingsPanel';
import { StripeSubscriptionsSettingsPanel } from './StripeSubscriptionsSettingsPanel';
import { PwaSettingsPanel } from './PwaSettingsPanel';
import { DykSettingsPanel } from './DykSettingsPanel';
import { CommunitySettingsPanel } from './CommunitySettingsPanel';
import { StreamSettingsPanel } from './StreamSettingsPanel';
import { DomainConversationSettingsPanel } from './DomainConversationSettingsPanel';
import { DialectValidationSettingsPanel } from './DialectValidationSettingsPanel';
import { AdsMonetisationSettingsPanel } from './AdsMonetisationSettingsPanel';

const groups = [
  { key: 'general', label: 'General Settings' },
  { key: 'stream', label: 'Stream Settings' },
  { key: 'adsMonetisation', label: 'Ads & Monetisation' },
  { key: 'landingPage', label: 'Landing Page' },
  { key: 'maintenance', label: 'Site Maintenance' },
  { key: 'referrals', label: 'Referral Bonuses' },
  { key: 'distributors', label: 'Distributor Settings' },
  { key: 'trainingTasks', label: 'Training & Tasks' },
  { key: 'domainConversation', label: 'Domain Conversation' },
  { key: 'dialectValidation', label: 'Dialect Validation' },
  { key: 'notifications', label: 'Notification Settings' },
  { key: 'liveChat', label: 'Live Chat' },
  { key: 'pwa', label: 'Web App Install' },
  { key: 'dyk', label: 'Do you know?' },
  { key: 'community', label: 'Community' },
  { key: 'wordGeneration', label: 'Word Generation' },
  { key: 'qualityGate', label: 'Voice Quality Gate' },
  { key: 'testimonials', label: 'Testimony Settings' },
  { key: 'speechExpression', label: 'Speech Expression' },
  { key: 'spellingNormalization', label: 'Spelling Normalization' },
  { key: 'p2pMarket', label: 'P2P Market' },
  { key: 'sms', label: 'SMS Providers' },
  { key: 'whatsappMessaging', label: 'WhatsApp Messaging' },
  { key: 'withdrawals', label: 'Crypto Withdrawals' },
  { key: 'flutterwave', label: 'Flutterwave (Fiat)' },
  { key: 'kyc', label: 'Identity Verification' },
  { key: 'datasetStorage', label: 'Dataset & Storage' },
  { key: 'apiAccessTokens', label: 'API Access Tokens' },
  { key: 'stripeSubscriptions', label: 'Stripe & Subscriptions' },
] as const;

type GroupKey = (typeof groups)[number]['key'];

const panelComponents: Record<GroupKey, () => JSX.Element> = {
  general: GeneralSettingsPanel,
  stream: StreamSettingsPanel,
  adsMonetisation: AdsMonetisationSettingsPanel,
  landingPage: LandingPageSettingsPanel,
  maintenance: MaintenanceSettingsPanel,
  referrals: ReferralBonusSettingsPanel,
  distributors: DistributorSettingsPanel,
  trainingTasks: TrainingTasksSettingsPanel,
  domainConversation: DomainConversationSettingsPanel,
  dialectValidation: DialectValidationSettingsPanel,
  notifications: NotificationSettingsPanel,
  liveChat: LiveChatSettingsPanel,
  pwa: PwaSettingsPanel,
  dyk: DykSettingsPanel,
  community: CommunitySettingsPanel,
  wordGeneration: WordGenerationSettingsPanel,
  qualityGate: QualityGateSettingsPanel,
  testimonials: TestimonySettingsPanel,
  speechExpression: SpeechExpressionSettingsPanel,
  spellingNormalization: SpellingNormalizationSettingsPanel,
  p2pMarket: P2PMarketSettingsPanel,
  sms: SmsSettingsPanel,
  whatsappMessaging: WhatsappMessagingSettingsPanel,
  withdrawals: WithdrawalSettingsPanel,
  flutterwave: FlutterwaveSettingsPanel,
  kyc: KycSettingsPanel,
  datasetStorage: DatasetStorageSettingsPanel,
  apiAccessTokens: ApiAccessTokensSettingsPanel,
  stripeSubscriptions: StripeSubscriptionsSettingsPanel,
};

const HIGHLIGHT_CLASS = 'settings-search-highlight';

export default function AdminSettingsPage() {
  const [active, setActive] = useState<GroupKey>('general');
  const [matchedPanels, setMatchedPanels] = useState<Set<string> | null>(null);
  const panelsContainerRef = useRef<HTMLDivElement>(null);

  function handleNavigate(match: SettingsSearchMatch) {
    setActive(match.panelKey as GroupKey);
    // The target panel is currently `hidden` (or was just made visible this
    // tick) -- wait a frame so it actually paints before scrolling/measuring
    // its position, otherwise scrollIntoView runs against stale layout.
    requestAnimationFrame(() => {
      match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      match.element.classList.add(HIGHLIGHT_CLASS);
      setTimeout(() => match.element.classList.remove(HIGHLIGHT_CLASS), 1500);
    });
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <h1 className="text-3xl font-black">Settings</h1>
            <p className="leading-relaxed text-muted">
              Platform configuration that previously required a redeploy to change. Anything left
              blank falls back to its deployment default.
            </p>
          </div>
          <div className="w-full sm:w-72">
            <SettingsSearch
              containerRef={panelsContainerRef}
              onMatchedPanelsChange={setMatchedPanels}
              onNavigate={handleNavigate}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav
            className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1"
            aria-label="Settings groups"
          >
            {groups.map((group) => {
              const dimmed = matchedPanels !== null && !matchedPanels.has(group.key);
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setActive(group.key)}
                  className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                    active === group.key
                      ? 'bg-accent text-white'
                      : 'bg-white text-ink hover:bg-surface-muted'
                  } ${dimmed ? 'opacity-50' : ''}`}
                >
                  {group.label}
                </button>
              );
            })}
          </nav>

          <div ref={panelsContainerRef}>
            {groups.map((group) => {
              const PanelComponent = panelComponents[group.key];
              return (
                <div
                  data-panel-label={group.label}
                  data-settings-panel={group.key}
                  hidden={active !== group.key}
                  key={group.key}
                >
                  <PanelComponent />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

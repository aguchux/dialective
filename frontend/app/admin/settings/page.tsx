'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
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

const groups = [
  { key: 'general', label: 'General Settings' },
  { key: 'landingPage', label: 'Landing Page' },
  { key: 'maintenance', label: 'Site Maintenance' },
  { key: 'referrals', label: 'Referral Bonuses' },
  { key: 'distributors', label: 'Distributor Settings' },
  { key: 'trainingTasks', label: 'Training & Tasks' },
  { key: 'notifications', label: 'Notification Settings' },
  { key: 'liveChat', label: 'Live Chat' },
  { key: 'pwa', label: 'Web App Install' },
  { key: 'wordGeneration', label: 'Word Generation' },
  { key: 'qualityGate', label: 'Voice Quality Gate' },
  { key: 'testimonials', label: 'Testimony Settings' },
  { key: 'speechExpression', label: 'Speech Expression' },
  { key: 'spellingNormalization', label: 'Spelling Normalization' },
  { key: 'p2pMarket', label: 'P2P Market' },
  { key: 'sms', label: 'SMS Providers' },
  { key: 'withdrawals', label: 'Crypto Withdrawals' },
  { key: 'flutterwave', label: 'Flutterwave (Fiat)' },
  { key: 'kyc', label: 'Identity Verification' },
  { key: 'datasetStorage', label: 'Dataset & Storage' },
  { key: 'apiAccessTokens', label: 'API Access Tokens' },
  { key: 'stripeSubscriptions', label: 'Stripe & Subscriptions' },
] as const;

type GroupKey = (typeof groups)[number]['key'];

export default function AdminSettingsPage() {
  const [active, setActive] = useState<GroupKey>('general');

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Settings</h1>
          <p className="leading-relaxed text-muted">
            Platform configuration that previously required a redeploy to change. Anything left
            blank falls back to its deployment default.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav
            className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1"
            aria-label="Settings groups"
          >
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActive(group.key)}
                className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                  active === group.key
                    ? 'bg-accent text-white'
                    : 'bg-white text-ink hover:bg-surface-muted'
                }`}
              >
                {group.label}
              </button>
            ))}
          </nav>

          <div>
            {active === 'general' && <GeneralSettingsPanel />}
            {active === 'landingPage' && <LandingPageSettingsPanel />}
            {active === 'maintenance' && <MaintenanceSettingsPanel />}
            {active === 'referrals' && <ReferralBonusSettingsPanel />}
            {active === 'distributors' && <DistributorSettingsPanel />}
            {active === 'trainingTasks' && <TrainingTasksSettingsPanel />}
            {active === 'notifications' && <NotificationSettingsPanel />}
            {active === 'liveChat' && <LiveChatSettingsPanel />}
            {active === 'pwa' && <PwaSettingsPanel />}
            {active === 'wordGeneration' && <WordGenerationSettingsPanel />}
            {active === 'qualityGate' && <QualityGateSettingsPanel />}
            {active === 'testimonials' && <TestimonySettingsPanel />}
            {active === 'speechExpression' && <SpeechExpressionSettingsPanel />}
            {active === 'spellingNormalization' && <SpellingNormalizationSettingsPanel />}
            {active === 'p2pMarket' && <P2PMarketSettingsPanel />}
            {active === 'sms' && <SmsSettingsPanel />}
            {active === 'withdrawals' && <WithdrawalSettingsPanel />}
            {active === 'flutterwave' && <FlutterwaveSettingsPanel />}
            {active === 'kyc' && <KycSettingsPanel />}
            {active === 'datasetStorage' && <DatasetStorageSettingsPanel />}
            {active === 'apiAccessTokens' && <ApiAccessTokensSettingsPanel />}
            {active === 'stripeSubscriptions' && <StripeSubscriptionsSettingsPanel />}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

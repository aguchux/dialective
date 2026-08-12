'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { ReferralBonusSettingsPanel } from './ReferralBonusSettingsPanel';
import { WordGenerationSettingsPanel } from './WordGenerationSettingsPanel';

const groups = [
  { key: 'general', label: 'General Settings' },
  { key: 'referrals', label: 'Referral Bonuses' },
  { key: 'notifications', label: 'Notification Settings' },
  { key: 'wordGeneration', label: 'Word Generation' },
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
            Platform configuration that previously required a redeploy to change. Anything left blank falls back to
            its deployment default.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Settings groups">
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActive(group.key)}
                className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                  active === group.key ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-surface-muted'
                }`}
              >
                {group.label}
              </button>
            ))}
          </nav>

          <div>
            {active === 'general' && <GeneralSettingsPanel />}
            {active === 'referrals' && <ReferralBonusSettingsPanel />}
            {active === 'notifications' && <NotificationSettingsPanel />}
            {active === 'wordGeneration' && <WordGenerationSettingsPanel />}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

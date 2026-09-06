'use client';

import Link from 'next/link';
import { Bell, ChevronRight, CircleHelp, Globe2, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Card, PageFrame, PageHeading, StatusBanner, Toggle } from '@/components/ui';

export default function SettingsPage() {
  const [replies, setReplies] = useState(true);
  const [mentions, setMentions] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [translationSuggestions, setTranslationSuggestions] = useState(true);

  return (
    <PageFrame className="max-w-[920px]">
      <PageHeading subtitle="Manage your account and community preferences." title="Settings" />
      <div className="mb-4">
        <StatusBanner tone="info">
          Preference controls are ready for the Community settings API. Until it is connected,
          changes apply to this session only.
        </StatusBanner>
      </div>
      <div className="grid gap-4">
        <SettingsSection
          icon={<UserRound aria-hidden="true" />}
          title="Profile settings"
          subtitle="Update your public profile and account details."
        >
          <SettingsLink href="/profile" label="Edit profile" />
          <SettingsLink
            external
            href="https://dialectlibrary.com/dashboard/settings"
            label="Change email"
          />
          <SettingsLink
            external
            href="https://dialectlibrary.com/dashboard/settings"
            label="Change password"
          />
        </SettingsSection>
        <SettingsSection
          icon={<Bell aria-hidden="true" />}
          title="Notification preferences"
          subtitle="Choose what you want to be notified about."
        >
          <SettingsToggle
            label="New replies to your posts"
            checked={replies}
            onChange={setReplies}
          />
          <SettingsToggle label="Mentions (@username)" checked={mentions} onChange={setMentions} />
          <SettingsToggle label="Community updates" checked={updates} onChange={setUpdates} />
        </SettingsSection>
        <SettingsSection
          icon={<Globe2 aria-hidden="true" />}
          title="Language preferences"
          subtitle="Set your default language and display preferences."
        >
          <SettingsLink
            external
            label="Default language"
            value="English"
            href="https://dialectlibrary.com/dashboard/settings"
          />
          <SettingsToggle
            label="Show translation suggestions"
            checked={translationSuggestions}
            onChange={setTranslationSuggestions}
          />
        </SettingsSection>
        <SettingsSection
          icon={<ShieldCheck aria-hidden="true" />}
          title="Privacy"
          subtitle="Control your visibility and data."
        >
          <SettingsLink
            label="Profile visibility"
            value="Public"
            href="https://dialectlibrary.com/dashboard/settings"
            external
          />
          <SettingsLink
            label="Data and privacy"
            href="https://dialectlibrary.com/privacy"
            external
          />
        </SettingsSection>
        <SettingsSection
          icon={<CircleHelp aria-hidden="true" />}
          title="Help"
          subtitle="Get support or learn more about the community."
        >
          <SettingsLink label="Help center" href="https://dialectlibrary.com/faq" external />
          <SettingsLink label="Contact support" href="https://dialectlibrary.com/about" external />
        </SettingsSection>
      </div>
    </PageFrame>
  );
}

function SettingsSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-ink sm:text-xl">{title}</h2>
          <p className="mt-0.5 text-sm text-muted sm:text-base">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 divide-y divide-line">{children}</div>
    </Card>
  );
}

function SettingsLink({
  label,
  value,
  href,
  external = false,
}: {
  label: string;
  value?: string;
  href: string;
  external?: boolean;
}) {
  const className =
    'flex min-h-12 items-center justify-between gap-3 py-2 text-sm text-ink transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 sm:text-base';
  const content = (
    <>
      <span>{label}</span>
      <span className="flex items-center gap-2 text-muted">
        {value}
        <ChevronRight aria-hidden="true" className="size-5" />
      </span>
    </>
  );
  return external ? (
    <a className={className} href={href} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <Link className={className} href={href}>
      {content}
    </Link>
  );
}

function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm text-ink sm:text-base">
      <span>{label}</span>
      <Toggle checked={checked} label={label} onChange={onChange} />
    </div>
  );
}

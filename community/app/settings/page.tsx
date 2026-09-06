'use client';

import Link from 'next/link';
import { Bell, ChevronRight, CircleHelp, Globe2, ShieldCheck, UserRound } from 'lucide-react';
import { Card, PageFrame, PageHeading } from '@/components/ui';

const MAIN_SETTINGS_URL = 'https://dialectlibrary.com/dashboard?view=profile';

export default function SettingsPage() {
  return (
    <PageFrame className="max-w-[920px]">
      <PageHeading subtitle="Manage your account and community preferences." title="Settings" />
      <div className="grid gap-4">
        <SettingsSection
          icon={<UserRound aria-hidden="true" />}
          title="Profile settings"
          subtitle="Update your public community profile."
        >
          <SettingsLink href="/profile" label="Edit community profile" />
        </SettingsSection>
        <SettingsSection
          icon={<Bell aria-hidden="true" />}
          title="Notifications"
          subtitle="Community notifications appear in the Notifications tab."
        >
          <SettingsLink href="/notifications" label="View notifications" />
        </SettingsSection>
        <SettingsSection
          icon={<Globe2 aria-hidden="true" />}
          title="Account settings"
          subtitle="Email, password, and account preferences are managed on your main Dialect Library account."
        >
          <SettingsLink external href={MAIN_SETTINGS_URL} label="Manage account" />
        </SettingsSection>
        <SettingsSection
          icon={<ShieldCheck aria-hidden="true" />}
          title="Privacy"
          subtitle="Control your visibility and data."
        >
          <SettingsLink
            external
            label="Data and privacy policy"
            href="https://dialectlibrary.com/privacy"
          />
        </SettingsSection>
        <SettingsSection
          icon={<CircleHelp aria-hidden="true" />}
          title="Help"
          subtitle="Get support or learn more about the community."
        >
          <SettingsLink external label="Help center" href="https://dialectlibrary.com/faq" />
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
  href,
  external = false,
}: {
  label: string;
  href: string;
  external?: boolean;
}) {
  const className =
    'flex min-h-12 items-center justify-between gap-3 py-2 text-sm text-ink transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 sm:text-base';
  const content = (
    <>
      <span>{label}</span>
      <ChevronRight aria-hidden="true" className="size-5 text-muted" />
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

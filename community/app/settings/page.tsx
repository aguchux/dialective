'use client';

import Link from 'next/link';
import { Card, PageHeading } from '@/components/ui';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeading title="Settings" />
      <Card className="p-6">
        <p className="text-sm text-muted">
          Account details, password, and notification preferences are managed from your{' '}
          <Link className="font-bold text-accent" href="https://dialectlibrary.com/dashboard/settings">
            Dialect Library account settings
          </Link>
          . Community-specific preferences will appear here in a future update.
        </p>
      </Card>
    </div>
  );
}

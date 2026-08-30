'use client';

import { useEffect } from 'react';

export function ReferralInviteRedirect({
  code,
  campaignShareId,
}: {
  code: string;
  campaignShareId: string;
}) {
  useEffect(() => {
    window.location.replace(
      `/register?ref=${encodeURIComponent(code)}&campaign=${encodeURIComponent(campaignShareId)}`,
    );
  }, [code, campaignShareId]);

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 text-ink">
      <p className="text-center text-sm font-bold text-muted">
        Opening your Dialect Library invitation...
      </p>
    </main>
  );
}

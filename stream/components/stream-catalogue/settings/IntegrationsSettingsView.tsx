'use client';

import { ApiKeysSection } from './ApiKeysSection';
import { OAuthClientsSection } from './OAuthClientsSection';
import { WebhooksSection } from './WebhooksSection';

export function IntegrationsSettingsView() {
  return (
    <div className="grid gap-5">
      <ApiKeysSection />
      <OAuthClientsSection />
      <WebhooksSection />
    </div>
  );
}

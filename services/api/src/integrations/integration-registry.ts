/**
 * Code-defined catalog of P2P & Integrations products. Each entry here is a
 * real, implemented feature (its own service/controller/frontend pages) --
 * this registry is the single place a new integration is "created". Admin
 * never types a new integration into existence; IntegrationsService syncs
 * this list into the `integrations` table on boot (creating any row missing
 * for a slug here, never deleting/renaming existing rows for slugs removed
 * from this list, since a live row may still have subscriptions/history).
 * Admin's only power over a row is gating it: enabled, feeTokenAmount,
 * sortOrder -- see UpdateIntegrationDto.
 */
export interface IntegrationDefinition {
  slug: string;
  name: string;
  description: string;
  category: string;
  iconKey: string | null;
  /** Default fee shown/used until an admin changes it via the gate. */
  defaultFeeTokenAmount: number;
  defaultSortOrder: number;
  /** Default concurrent-claim cap per subscribed member, until an admin changes it via the gate. */
  defaultMaxConcurrentClaims: number;
}

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    slug: 'whatsapp-validator',
    name: 'WhatsApp Validator',
    description: "Peer-verify a member's WhatsApp number and earn DL for fulfilling requests.",
    category: 'Verification',
    iconKey: 'MessageCircle',
    defaultFeeTokenAmount: 2,
    defaultSortOrder: 0,
    defaultMaxConcurrentClaims: 5,
  },
];

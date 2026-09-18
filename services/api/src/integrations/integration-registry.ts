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
  /** Default minutes an issued code/request stays valid before expiring, until an admin changes it via the gate. */
  defaultCodeValidityMinutes: number;
  /**
   * Who is allowed to request access at all. Checked when a member hits
   * subscribe, and shown on the marketplace card so the bar is visible
   * before they try rather than only in a rejection.
   *
   * This is a property of the integration, not a global policy: fulfilling
   * ID Review means handling other members' identity documents, which
   * warrants a verified, established member. WhatsApp Validator carries no
   * such exposure and deliberately has no bar.
   */
  eligibility: IntegrationEligibilityRule;
}

/** An empty rule (all fields absent/0) means anyone may request access. */
export interface IntegrationEligibilityRule {
  requirePhoneVerified?: boolean;
  requireKycApproved?: boolean;
  /** Lifetime completed word recordings ("tasks") the member must have. */
  minTasks?: number;
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
    defaultCodeValidityMinutes: 60 * 24,
    /**
     * A validator confirms someone else's phone number, so they must have
     * proven their own first -- and be an identified person, since the
     * requester is trusting a stranger with a one-time code. No task bar:
     * relaying a code is not how value leaves the platform.
     */
    eligibility: { requirePhoneVerified: true, requireKycApproved: true },
  },
  {
    slug: 'p2p-kyc-review',
    name: 'ID Review',
    description:
      "Check a member's ID document against their account name and earn DL. Two agreeing reviewers send it to an admin, who makes the final decision.",
    category: 'Verification',
    iconKey: 'ScanFace',
    // Paid by the PLATFORM on admin approval, not by the member being
    // verified -- KYC is a platform requirement, not a purchase.
    defaultFeeTokenAmount: 1,
    defaultSortOrder: 1,
    // Deliberately low: a reviewer holding many identity documents open at
    // once is exactly what this feature should not encourage.
    defaultMaxConcurrentClaims: 2,
    defaultCodeValidityMinutes: 60 * 24,
    /**
     * A reviewer here reads other members' identity documents, so the bar
     * is deliberately high: they must have proven their own phone and
     * passed KYC themselves, and have a real track record on the platform
     * rather than being a fresh account that signed up to harvest IDs.
     */
    eligibility: { requirePhoneVerified: true, requireKycApproved: true, minTasks: 100 },
  },
];

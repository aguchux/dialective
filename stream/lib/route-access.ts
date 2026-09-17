import type { SubscriberOrgRole } from './api-client';

/**
 * Role sets for the UI's permission checks, mirroring the server-side
 * @SubscriberRoles() guards -- these only decide what to render; the API is
 * what actually enforces access.
 *
 * Deliberately typed `readonly SubscriberOrgRole[]` rather than
 * `as const satisfies ...`. The const form narrows each list to a union of
 * exactly its own members, which then makes `ROLES.includes(userRole)` a
 * type error for any role outside that list -- i.e. TypeScript rejects
 * precisely the question these lists exist to answer ("is this role one of
 * ours?"). Widening keeps the membership test callable with any role while
 * still catching a typo'd role name in the literals below.
 */
export const ORG_ADMIN_ROLES: readonly SubscriberOrgRole[] = ['OWNER', 'ADMIN'];
export const BILLING_ROLES: readonly SubscriberOrgRole[] = [
  'OWNER',
  'ADMIN',
  'BILLING_MANAGER',
  'AUDITOR',
];
export const INTEGRATION_ROLES: readonly SubscriberOrgRole[] = [
  'OWNER',
  'ADMIN',
  'DATASET_MANAGER',
  'API_DEVELOPER',
];
export const VALIDATION_ROLES: readonly SubscriberOrgRole[] = [
  'OWNER',
  'ADMIN',
  'DATASET_MANAGER',
  'VALIDATOR',
];
export const DECK_MANAGER_ROLES: readonly SubscriberOrgRole[] = [
  'OWNER',
  'ADMIN',
  'DATASET_MANAGER',
];
export const CHECKOUT_ROLES: readonly SubscriberOrgRole[] = [
  'OWNER',
  'BILLING_MANAGER',
];
export const REPORTING_ROLES: readonly SubscriberOrgRole[] = [
  'OWNER',
  'ADMIN',
  'DATASET_MANAGER',
  'API_DEVELOPER',
  'AUDITOR',
];

const ROUTE_ROLE_POLICIES: Array<{
  path: string;
  roles: readonly SubscriberOrgRole[];
}> = [
  { path: '/dashboard/oauth-clients', roles: INTEGRATION_ROLES },
  { path: '/dashboard/api-keys', roles: INTEGRATION_ROLES },
  { path: '/dashboard/webhooks', roles: INTEGRATION_ROLES },
  { path: '/dashboard/validation', roles: VALIDATION_ROLES },
  { path: '/dashboard/analytics', roles: REPORTING_ROLES },
  { path: '/dashboard/reports', roles: REPORTING_ROLES },
  { path: '/dashboard/team', roles: ORG_ADMIN_ROLES },
  { path: '/dashboard/billing', roles: BILLING_ROLES },
  { path: '/settings/organization', roles: ORG_ADMIN_ROLES },
  { path: '/settings/security', roles: ORG_ADMIN_ROLES },
  { path: '/settings/integrations', roles: INTEGRATION_ROLES },
  { path: '/settings/billing', roles: BILLING_ROLES },
  { path: '/settings/advanced', roles: ORG_ADMIN_ROLES },
];

export const LEGACY_PROTECTED_ROUTE_REDIRECTS: Record<string, string> = {
  '/discover': '/dashboard/explore',
  '/voice-library': '/dashboard/explore',
  '/stream-decks': '/dashboard/decks',
  '/validation': '/dashboard/validation',
  '/api': '/dashboard/api-keys',
  '/usage': '/dashboard/analytics',
  '/team': '/dashboard/team',
};

export function allowedRolesForPath(pathname: string): readonly SubscriberOrgRole[] | null {
  const policy = ROUTE_ROLE_POLICIES.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return policy?.roles ?? null;
}

export function canAccessPath(role: SubscriberOrgRole | undefined, pathname: string): boolean {
  const allowedRoles = allowedRolesForPath(pathname);
  return !allowedRoles || Boolean(role && allowedRoles.includes(role));
}

export function canonicalProtectedPath(pathname: string): string | null {
  for (const [legacyPath, canonicalPath] of Object.entries(LEGACY_PROTECTED_ROUTE_REDIRECTS)) {
    if (pathname === legacyPath || pathname.startsWith(`${legacyPath}/`)) {
      return `${canonicalPath}${pathname.slice(legacyPath.length)}`;
    }
  }
  return null;
}

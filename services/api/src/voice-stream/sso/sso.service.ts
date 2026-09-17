import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import type { CacheItem, CacheProvider, Profile } from '@node-saml/node-saml';
import { ActivityEventType, SsoIdpConfig, SubscriberUser } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgActivityService } from '../org-activity/org-activity.service';
import {
  SubscriberAuthResult,
  SubscriberAuthService,
} from '../subscriber-auth/subscriber-auth.service';

const REQUEST_ID_TTL_MS = 5 * 60 * 1000; // 5 min, matches requestIdExpirationPeriodMs below

function apiBaseUrl(): string {
  return process.env.API_PUBLIC_BASE_URL ?? 'https://api.dialectlibrary.com';
}

export function acsUrlFor(organizationId: string): string {
  return `${apiBaseUrl()}/voice-stream/sso/acs?org=${organizationId}`;
}

/**
 * node-saml CacheProvider backed by SsoRequestCache, replacing node-saml's
 * default InMemoryCacheProvider -- that default is explicitly documented as
 * unsuitable across multiple server instances (the AuthnRequest may be
 * generated on one API pod and its response validated on another). This is
 * what enforces InResponseTo replay/single-use protection for SP-initiated
 * logins: saveAsync is called when we issue an AuthnRequest,
 * getAsync/removeAsync when node-saml validates the response's
 * InResponseTo internally.
 */
export class PrismaSamlCacheProvider implements CacheProvider {
  constructor(private readonly prisma: PrismaService) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    try {
      const row = await this.prisma.ssoRequestCache.create({ data: { key, value } });
      return { value: row.value, createdAt: row.createdAt.getTime() };
    } catch {
      // Unique constraint on key -- matches InMemoryCacheProvider's
      // first-write-wins semantics (returns null on collision).
      return null;
    }
  }

  async getAsync(key: string): Promise<string | null> {
    const row = await this.prisma.ssoRequestCache.findUnique({ where: { key } });
    if (!row) return null;
    if (Date.now() - row.createdAt.getTime() > REQUEST_ID_TTL_MS) {
      await this.prisma.ssoRequestCache.delete({ where: { key } }).catch(() => undefined);
      return null;
    }
    return row.value;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      await this.prisma.ssoRequestCache.delete({ where: { key } });
      return key;
    } catch {
      return null;
    }
  }
}

export interface SsoAssertion {
  nameId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * SAML validation and JIT provisioning -- distinct from SsoIdpConfigService,
 * which is dashboard CRUD for IdP configuration. Exact split precedent:
 * oauth-clients.service.ts (dashboard CRUD) vs oauth-token.controller.ts
 * (untrusted external-caller token issuance).
 */
@Injectable()
export class SsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriberAuth: SubscriberAuthService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  buildSamlClient(config: SsoIdpConfig): SAML {
    return new SAML({
      callbackUrl: acsUrlFor(config.organizationId),
      entryPoint: config.idpSsoUrl,
      issuer: config.spEntityId, // OUR entity id -- sent as Issuer in the AuthnRequest, validated as Audience on the response
      idpIssuer: config.idpEntityId, // defense-in-depth: cross-checks the *response's* Issuer against this org's configured IdP entity id, not just the certificate/signature chain -- catches a misconfigured/wrong-org cert accepted for the wrong IdP
      idpCert: config.idpCertificate,
      wantAssertionsSigned: true, // mandatory -- never trust an unsigned assertion
      wantAuthnResponseSigned: false, // most IdPs sign the assertion, not the outer response; assertion-signing stays mandatory above
      identifierFormat: config.nameIdFormat,
      validateInResponseTo: ValidateInResponseTo.ifPresent, // IdP-initiated flows omit InResponseTo entirely (spec-legal); SP-initiated flows must have it match a request we issued
      requestIdExpirationPeriodMs: REQUEST_ID_TTL_MS,
      disableRequestedAuthnContext: true,
      cacheProvider: new PrismaSamlCacheProvider(this.prisma),
    });
  }

  generateMetadata(config: SsoIdpConfig): string {
    const saml = this.buildSamlClient(config);
    return saml.generateServiceProviderMetadata(null, null);
  }

  async getLoginRedirectUrl(config: SsoIdpConfig): Promise<string> {
    const saml = this.buildSamlClient(config);
    // RelayState empty -- could carry a post-login return path once a
    // dashboard exists to consume it; the request ID itself is persisted by
    // PrismaSamlCacheProvider.saveAsync as a side effect of this call, not
    // returned here (node-saml has no public API to read it back).
    return saml.getAuthorizeUrlAsync('', undefined, {});
  }

  /**
   * Validates a POSTed SAML response for the given org's IdP config and, on
   * success, resolves the asserting identity to a SubscriberAuthResult.
   * Throws UnauthorizedException on any validation failure (unsigned
   * assertion, expired/replayed InResponseTo, audience mismatch, etc.) --
   * node-saml enforces signature/timestamp/audience checks internally;
   * this method never inspects the raw XML itself.
   */
  async handleAcsPost(
    config: SsoIdpConfig,
    body: Record<string, string>,
  ): Promise<SubscriberAuthResult> {
    const saml = this.buildSamlClient(config);

    let profile: Profile | null;
    let loggedOut: boolean;
    try {
      ({ profile, loggedOut } = await saml.validatePostResponseAsync(body));
    } catch {
      throw new UnauthorizedException('Invalid SAML response');
    }
    if (loggedOut || !profile) {
      throw new UnauthorizedException('Invalid SAML response');
    }

    const assertion = this.mapAssertion(config, profile);
    return this.handleAssertion(config, assertion);
  }

  private mapAssertion(config: SsoIdpConfig, profile: Profile): SsoAssertion {
    const rawEmail = profile[config.emailAttribute];
    const email = (typeof rawEmail === 'string' ? rawEmail : undefined) ?? profile.nameID;
    const rawFirstName = profile[config.firstNameAttribute];
    const firstName =
      (typeof rawFirstName === 'string' ? rawFirstName : undefined) ?? email.split('@')[0];
    const rawLastName = profile[config.lastNameAttribute];
    const lastName = (typeof rawLastName === 'string' ? rawLastName : undefined) ?? '';
    return { nameId: profile.nameID, email, firstName, lastName };
  }

  /**
   * JIT (just-in-time) provisioning: links a repeat SSO login to its
   * existing SsoIdentity, links a first-time SSO login to an existing
   * SubscriberUser sharing the asserted email (e.g. a password-registered
   * user whose org later turned on SSO), or creates a brand-new
   * password-less SubscriberUser. Never grants SubscriberOrgRole.OWNER via
   * JIT -- config.defaultRole is validated at config-creation/update time
   * (SsoIdpConfigService) to never be OWNER.
   */
  async handleAssertion(
    config: SsoIdpConfig,
    assertion: SsoAssertion,
  ): Promise<SubscriberAuthResult> {
    const existingIdentity = await this.prisma.ssoIdentity.findUnique({
      where: { idpConfigId_nameId: { idpConfigId: config.id, nameId: assertion.nameId } },
      include: { user: true },
    });
    if (existingIdentity) {
      await this.prisma.ssoIdentity.update({
        where: { id: existingIdentity.id },
        data: { lastLoginAt: new Date() },
      });
      void this.orgActivity.record(
        config.organizationId,
        ActivityEventType.SSO_LOGIN,
        existingIdentity.userId,
        { nameId: assertion.nameId },
      );
      return this.subscriberAuth.issueAuthResult(existingIdentity.user);
    }

    const existingUserByEmail = await this.prisma.subscriberUser.findUnique({
      where: { email: assertion.email },
    });

    // A still-pending SubscriberInvite (tokenHash emailed, not yet accepted)
    // is the invited person's proof-of-email-ownership step -- it hasn't
    // happened yet. Without this check, an attacker who merely controls
    // what email the IdP asserts (a misconfigured/permissive IdP, or an IdP
    // account they registered themselves with the victim's email) could JIT-
    // create a SubscriberUser for that email THROUGH SSO before the real
    // invitee ever clicks their invite link, squatting the email: the real
    // invite's later acceptInvite() call would then attach to the
    // attacker's account (subscriberUser.findUnique by email) instead of
    // creating a fresh one. Only blocks brand-new-account creation --
    // linking SSO to an ALREADY-existing SubscriberUser is unaffected, since
    // that account's email is already established, not being claimed here.
    if (!existingUserByEmail) {
      const pendingInvite = await this.prisma.subscriberInvite.findFirst({
        where: { email: assertion.email, acceptedAt: null, expiresAt: { gt: new Date() } },
      });
      if (pendingInvite) {
        throw new UnauthorizedException(
          'This email has a pending invite that must be accepted directly; SSO cannot claim it first',
        );
      }
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const targetUser: SubscriberUser =
        existingUserByEmail ??
        (await tx.subscriberUser.create({
          data: {
            email: assertion.email,
            passwordHash: null, // SSO-only account
            firstName: assertion.firstName,
            lastName: assertion.lastName,
            emailVerifiedAt: new Date(), // the IdP already vouched for this identity -- no separate OTP-email-verify step needed
          },
        }));

      await tx.ssoIdentity.create({
        data: { userId: targetUser.id, idpConfigId: config.id, nameId: assertion.nameId },
      });

      const existingMembership = await tx.subscriberMembership.findUnique({
        where: {
          userId_organizationId: { userId: targetUser.id, organizationId: config.organizationId },
        },
      });
      if (!existingMembership) {
        await tx.subscriberMembership.create({
          data: {
            userId: targetUser.id,
            organizationId: config.organizationId,
            role: config.defaultRole,
            acceptedAt: new Date(), // SSO membership needs no separate accept step -- the successful IdP auth IS the acceptance
          },
        });
      }

      return targetUser;
    });

    void this.orgActivity.record(config.organizationId, ActivityEventType.SSO_LOGIN, user.id, {
      nameId: assertion.nameId,
      jit: !existingUserByEmail,
    });
    return this.subscriberAuth.issueAuthResult(user);
  }
}

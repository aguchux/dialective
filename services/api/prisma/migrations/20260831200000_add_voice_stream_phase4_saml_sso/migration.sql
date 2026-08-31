-- Dialect Library Voice Stream -- Phase 4 (SAML 2.0 SSO, enterprise tier).
-- Backend SP only: IdP configuration storage, SP-initiated login-link
-- replay tracking, and per-org SAML identity linking.

ALTER TABLE "subscriber_users" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "subscription_plans" ADD COLUMN "ssoEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ActivityEventType" ADD VALUE 'SSO_CONFIGURED';
ALTER TYPE "ActivityEventType" ADD VALUE 'SSO_DISABLED';
ALTER TYPE "ActivityEventType" ADD VALUE 'SSO_LOGIN';

CREATE TABLE "sso_idp_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "idpEntityId" TEXT NOT NULL,
    "idpSsoUrl" TEXT NOT NULL,
    "idpCertificate" TEXT NOT NULL,
    "spEntityId" TEXT NOT NULL,
    "nameIdFormat" TEXT NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    "emailAttribute" TEXT NOT NULL DEFAULT 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    "firstNameAttribute" TEXT NOT NULL DEFAULT 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    "lastNameAttribute" TEXT NOT NULL DEFAULT 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    "defaultRole" "SubscriberOrgRole" NOT NULL DEFAULT 'VALIDATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_idp_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sso_idp_configs_organizationId_key" ON "sso_idp_configs"("organizationId");

ALTER TABLE "sso_idp_configs" ADD CONSTRAINT "sso_idp_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sso_login_links" (
    "id" TEXT NOT NULL,
    "idpConfigId" TEXT NOT NULL,
    "samlRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "sso_login_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sso_login_links_samlRequestId_key" ON "sso_login_links"("samlRequestId");

CREATE INDEX "sso_login_links_idpConfigId_idx" ON "sso_login_links"("idpConfigId");

CREATE INDEX "sso_login_links_expiresAt_idx" ON "sso_login_links"("expiresAt");

ALTER TABLE "sso_login_links" ADD CONSTRAINT "sso_login_links_idpConfigId_fkey" FOREIGN KEY ("idpConfigId") REFERENCES "sso_idp_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sso_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idpConfigId" TEXT NOT NULL,
    "nameId" TEXT NOT NULL,
    "firstLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sso_identities_idpConfigId_nameId_key" ON "sso_identities"("idpConfigId", "nameId");

CREATE UNIQUE INDEX "sso_identities_idpConfigId_userId_key" ON "sso_identities"("idpConfigId", "userId");

ALTER TABLE "sso_identities" ADD CONSTRAINT "sso_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "subscriber_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_identities" ADD CONSTRAINT "sso_identities_idpConfigId_fkey" FOREIGN KEY ("idpConfigId") REFERENCES "sso_idp_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

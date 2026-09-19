import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IntegrationSubscriptionStatus } from '@dialectiva/db';
import { Type } from 'class-transformer';

export class ListIntegrationsDto {
  // Matched against name/description/category, case-insensitive substring.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['name', 'category', 'createdAt', 'sortOrder'])
  sortBy?: 'name' | 'category' | 'createdAt' | 'sortOrder' = 'sortOrder';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'asc';
}

/**
 * Admin's only write path onto an Integration row -- deliberately has no
 * name/description/category/iconKey/slug fields. Those are owned by
 * INTEGRATION_REGISTRY (see integration-registry.ts) and refreshed on
 * every boot; an integration is created by implementing it in code, not
 * by an admin typing metadata into a form. This DTO only gates an
 * already-registered row: whether it's live, what it costs, and where it
 * sorts in the marketplace.
 */
export class UpdateIntegrationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeTokenAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxConcurrentClaims?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  codeValidityMinutes?: number;

  /**
   * Agreeing verdicts that decide an item outright, with no admin step.
   *
   * Floored at 1 rather than 0: on ID Review this number moves a member's
   * KycStatus unsupervised, and 0 would approve documents nobody looked at.
   * Capped so a typo cannot park every applicant in permanent review.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  consensusCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  // Who may request access. Enforced in IntegrationsService.subscribe and
  // shown on the marketplace card.
  @IsOptional()
  @IsBoolean()
  requirePhoneVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  requireKycApproved?: boolean;

  /** Settled tasks required. 0 switches the task bar off entirely. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minCompletedTasks?: number;
}

export class ListIntegrationSubscriptionsDto {
  @IsOptional()
  @IsIn([
    IntegrationSubscriptionStatus.PENDING,
    IntegrationSubscriptionStatus.APPROVED,
    IntegrationSubscriptionStatus.REJECTED,
  ])
  status?: IntegrationSubscriptionStatus;

  // Scopes the queue to one integration, for its dedicated admin page.
  @IsOptional()
  @IsString()
  slug?: string;
}

/**
 * An admin's decision on a member's access request. Approving is what
 * actually grants access -- IntegrationsService.isSubscribed accepts only
 * APPROVED -- so this is the gate, not a formality.
 */
export class ReviewIntegrationSubscriptionDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  // Shown to the member on a rejection, so a decline says something useful.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

/**
 * Certified (staff-grade) reviewer status. Deliberately its own endpoint
 * rather than a field on the approve/reject DTO: granting it is a
 * separate, larger decision than approving access.
 */
export class SetSubscriptionCertifiedDto {
  @IsBoolean()
  certified!: boolean;
}

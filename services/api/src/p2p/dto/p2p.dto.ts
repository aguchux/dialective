import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { P2PDisputeStatus, P2POfferStatus, P2POfferType, P2PTradeStatus } from '@dialectiva/db';

export class UpdateP2pPaymentInstructionsDto {
  @IsOptional()
  @IsString()
  p2pPaymentInstructions?: string;
}

/**
 * Owner edit of a post nobody has traded against. Every field optional --
 * an edit that only changes the payment accounts must not have to restate
 * the amount. `type` is deliberately absent: flipping a SELL into a BUY
 * changes what the escrow means, so that is a delete and repost.
 */
export class UpdateOfferDto {
  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  tokenAmount?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fiatCurrency?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  paymentMethod?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  paymentMethodIds?: string[];
}

export class CreateOfferDto {
  @IsIn([P2POfferType.SELL, P2POfferType.BUY])
  type!: P2POfferType;

  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  @IsNotEmpty()
  fiatCurrency!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  // The full set of the seller's own payout accounts they're willing to
  // receive payment into for this offer -- see P2POfferPaymentMethod.
  // First entry becomes the offer's "primary" paymentMethodId (backward
  // compat with anything still reading that single field).
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  paymentMethodIds?: string[];


  // Required only when PlatformSettings.phoneVerificationRequired is off
  // (replacing the standing phone-verified gate) -- see
  // P2pService.requireVerifiedForTrading.
  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}

export class ListOffersDto {
  @IsOptional()
  @IsIn([P2POfferType.SELL, P2POfferType.BUY])
  type?: P2POfferType;

  @IsOptional()
  @IsIn([
    P2POfferStatus.ACTIVE,
    P2POfferStatus.RESERVED,
    P2POfferStatus.EXPIRED,
    P2POfferStatus.CANCELLED,
    P2POfferStatus.COMPLETED,
    P2POfferStatus.DISPUTED,
  ])
  status?: P2POfferStatus;

  // Matched against the offer's trader firstName/lastName/email,
  // case-insensitive substring.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  fiatCurrency?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTokenAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTokenAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minFiatAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxFiatAmount?: number;

  // 'price' is the derived fiatAmount/tokenAmount unit rate -- computed via
  // raw SQL in listOffers (no stored column to order by directly).
  @IsOptional()
  @IsIn(['createdAt', 'tokenAmount', 'fiatAmount', 'price'])
  sortBy: 'createdAt' | 'tokenAmount' | 'fiatAmount' | 'price' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class AcceptOfferDto {
  @IsOptional()
  @IsUUID()
  sellerPaymentMethodId?: string;

  // Required only when PlatformSettings.phoneVerificationRequired is off --
  // see CreateOfferDto's otpRequestId/code fields.
  @IsOptional()
  @IsUUID()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code?: string;
}

export class RequestP2pTradeOtpDto {
  @IsIn(['create-offer', 'accept-offer'])
  action!: 'create-offer' | 'accept-offer';

  // create-offer context
  @ValidateIf((dto: RequestP2pTradeOtpDto) => dto.action === 'create-offer')
  @IsIn([P2POfferType.SELL, P2POfferType.BUY])
  type?: P2POfferType;

  @ValidateIf((dto: RequestP2pTradeOtpDto) => dto.action === 'create-offer')
  @IsNumber()
  @Min(0.00000001)
  tokenAmount?: number;

  @ValidateIf((dto: RequestP2pTradeOtpDto) => dto.action === 'create-offer')
  @IsString()
  @IsNotEmpty()
  fiatCurrency?: string;

  @ValidateIf((dto: RequestP2pTradeOtpDto) => dto.action === 'create-offer')
  @IsString()
  @IsNotEmpty()
  paymentMethod?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  paymentMethodIds?: string[];

  // accept-offer context
  @IsOptional()
  @IsUUID()
  offerId?: string;
}

export class RaiseDisputeDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

export class ResolveDisputeDto {
  @IsIn(['buyer', 'seller'])
  winner!: 'buyer' | 'seller';

  @IsOptional()
  @IsString()
  resolutionNote?: string;
}

/**
 * Admin force-resolution of a stuck trade -- one sitting in PAID_MARKED with
 * no dispute, where the buyer claimed payment and then went quiet and the
 * seller never confirmed.
 *
 * `outcome` is explicit rather than inferred because the two directions are
 * not symmetric in risk. `refund-seller` restores the pre-trade state: the
 * escrow was already the seller's, and nothing has been paid out. That is
 * the default for an unverified payment claim. `release-buyer` gives away a
 * seller's tokens on the strength of that same unverified claim, so it
 * exists only for when the admin has actually seen proof of payment, and
 * the reason is where they record what they saw.
 */
export class ForceResolveTradeDto {
  @IsIn(['refund-seller', 'release-buyer'])
  outcome!: 'refund-seller' | 'release-buyer';

  /**
   * Required, and long enough to be a sentence. This action has no dispute
   * row behind it carrying a reported reason, so unlike resolveDispute
   * there is no other record anywhere of why an admin moved someone's
   * escrow. The audit row is it.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class RequestForceResolveOtpDto {
  @IsIn(['refund-seller', 'release-buyer'])
  outcome!: 'refund-seller' | 'release-buyer';
}

export class UpdateP2PMarketSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sellOffersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  buyRequestsEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  minTradeTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  maxTradeTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  paymentWindowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cancelGraceMinutes?: number;


  @IsOptional()
  @IsInt()
  @Min(1)
  maxOpenOffersPerUser?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOpenTradesPerUser?: number;

  @IsOptional()
  @IsString()
  allowedFiatCurrencies?: string;

  @IsOptional()
  @IsString()
  allowedPaymentMethods?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  disputeWindowMinutes?: number;

  @IsOptional()
  @IsBoolean()
  adminOtpRequiredForDisputes?: boolean;
}

export class ListTradesDto {
  @IsOptional()
  @IsIn([
    P2PTradeStatus.AWAITING_PAYMENT,
    P2PTradeStatus.PAID_MARKED,
    P2PTradeStatus.RELEASED,
    P2PTradeStatus.CANCEL_PENDING,
    P2PTradeStatus.CANCELLED,
    P2PTradeStatus.DISPUTED,
    P2PTradeStatus.EXPIRED,
  ])
  status?: P2PTradeStatus;
}

export class ListDisputesDto {
  @IsOptional()
  @IsIn([P2PDisputeStatus.OPEN, P2PDisputeStatus.RESOLVED_BUYER, P2PDisputeStatus.RESOLVED_SELLER])
  status?: P2PDisputeStatus;
}

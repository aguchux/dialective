import {
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
  Min,
} from 'class-validator';
import { P2PDisputeStatus, P2POfferStatus, P2POfferType, P2PTradeStatus } from '@dialectiva/db';

export class UpdateP2pPaymentInstructionsDto {
  @IsOptional()
  @IsString()
  p2pPaymentInstructions?: string;
}

export class CreateOfferDto {
  @IsIn([P2POfferType.SELL, P2POfferType.BUY])
  type!: P2POfferType;

  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsNumber()
  @Min(0.01)
  fiatAmount!: number;

  @IsString()
  @IsNotEmpty()
  fiatCurrency!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10080)
  expiresInMinutes?: number;

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
  @IsOptional()
  @IsIn([P2POfferType.SELL, P2POfferType.BUY])
  type?: P2POfferType;

  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  tokenAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  fiatAmount?: number;

  @IsOptional()
  @IsString()
  fiatCurrency?: string;

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
  @Min(5)
  offerExpiryMinutes?: number;

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

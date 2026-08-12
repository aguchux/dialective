import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { P2PDisputeStatus, P2POfferStatus, P2POfferType, P2PTradeStatus } from '@dialectiva/db';

export class UpsertPaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  methodType!: string;

  @IsString()
  @IsNotEmpty()
  fiatCurrency!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsUUID()
  otpRequestId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class RequestPaymentMethodOtpDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  methodType!: string;

  @IsString()
  @IsNotEmpty()
  fiatCurrency!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
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
}

export class ListOffersDto {
  @IsOptional()
  @IsIn([P2POfferType.SELL, P2POfferType.BUY])
  type?: P2POfferType;

  @IsOptional()
  @IsIn([P2POfferStatus.ACTIVE, P2POfferStatus.RESERVED, P2POfferStatus.EXPIRED, P2POfferStatus.CANCELLED, P2POfferStatus.COMPLETED, P2POfferStatus.DISPUTED])
  status?: P2POfferStatus;
}

export class AcceptOfferDto {
  @IsOptional()
  @IsUUID()
  sellerPaymentMethodId?: string;
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

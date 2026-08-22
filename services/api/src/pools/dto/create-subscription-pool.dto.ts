import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateSubscriptionPoolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subscriberName!: string;

  @IsEmail()
  subscriberEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsNumber()
  @Min(0.01)
  usdAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsUUID()
  dataAccessLeadId?: string;
}

export class UpdateSubscriptionPoolDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subscriberName?: string;

  @IsOptional()
  @IsEmail()
  subscriberEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  usdAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsUUID()
  dataAccessLeadId?: string;
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertSubscriptionPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'key must be lowercase letters, numbers, hyphens, or underscores only',
  })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  stripePriceId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monthlyUsdAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxStreamDecks?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxTeamMembers?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

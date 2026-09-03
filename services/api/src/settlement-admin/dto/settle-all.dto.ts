import { IsBoolean, IsOptional } from 'class-validator';

export class SettleAllDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

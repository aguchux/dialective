import { IsBoolean, IsOptional } from 'class-validator';

export class SettleOneDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

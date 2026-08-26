import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class SettleAllDto {
  @IsOptional()
  @IsIn(['word', 'submission'])
  kind?: 'word' | 'submission';

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

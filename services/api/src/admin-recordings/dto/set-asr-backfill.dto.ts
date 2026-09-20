import { IsBoolean } from 'class-validator';

export class SetAsrBackfillDto {
  @IsBoolean()
  enabled!: boolean;
}

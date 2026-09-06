import { IsBoolean } from 'class-validator';

export class SetDisabledDto {
  @IsBoolean()
  disabled!: boolean;
}

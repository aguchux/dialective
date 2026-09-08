import { IsEnum } from 'class-validator';
import { ValidatorLevel } from '@dialectiva/db';

export class UpdateValidatorLevelDto {
  @IsEnum(ValidatorLevel)
  validatorLevel!: ValidatorLevel;
}

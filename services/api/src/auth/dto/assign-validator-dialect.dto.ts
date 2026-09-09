import { IsUUID } from 'class-validator';

export class AssignValidatorDialectDto {
  @IsUUID()
  dialectId!: string;
}

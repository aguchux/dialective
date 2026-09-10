import { IsBoolean } from 'class-validator';

export class SetDialectAsrGateBypassDto {
  @IsBoolean()
  bypassed!: boolean;
}

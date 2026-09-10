import { IsBoolean } from 'class-validator';

export class SetAsrGateBypassDto {
  @IsBoolean()
  bypassed!: boolean;
}

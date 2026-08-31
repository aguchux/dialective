import { IsEnum } from 'class-validator';
import { StreamDeckVisibility } from '@dialectiva/db';

export class SetDeckVisibilityDto {
  @IsEnum(StreamDeckVisibility)
  visibility!: StreamDeckVisibility;
}

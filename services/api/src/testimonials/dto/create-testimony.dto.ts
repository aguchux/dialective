import { Type } from 'class-transformer';
import { IsIn, IsInt, IsPositive, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateTestimonyDto {
  @IsIn(['VIDEO', 'TEXT'])
  kind!: 'VIDEO' | 'TEXT';

  // Server-side re-validates the actual length against
  // PlatformSettings.testimonyMaxTextLength (admin-configurable, so the
  // hard @MaxLength here is just a generous outer ceiling against abuse,
  // not the real limit).
  @ValidateIf((dto: CreateTestimonyDto) => dto.kind === 'TEXT')
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ValidateIf((dto: CreateTestimonyDto) => dto.kind === 'VIDEO')
  @IsString()
  bucket?: string;

  @ValidateIf((dto: CreateTestimonyDto) => dto.kind === 'VIDEO')
  @IsString()
  videoKey?: string;

  @ValidateIf((dto: CreateTestimonyDto) => dto.kind === 'VIDEO')
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  durationMs?: number;
}

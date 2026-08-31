import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFaqDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(240)
  question!: string;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  answer!: string;

  /** Set when this FAQ is being created from an AI-conversation user message, so the source message can be marked converted and protected from double-conversion. */
  @IsOptional()
  @IsUUID()
  sourceMessageId?: string;
}

import { IsString, MinLength } from 'class-validator';

export class CloneFromStreamDeckDto {
  @IsString()
  @MinLength(1)
  streamDeckId!: string;

  @IsString()
  @MinLength(1)
  targetOwnerUserId!: string;
}

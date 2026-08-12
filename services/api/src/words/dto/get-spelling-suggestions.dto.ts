import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GetSpellingSuggestionsDto {
  @IsUUID()
  wordId!: string;

  @IsString()
  dialectTag!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  query?: string;
}

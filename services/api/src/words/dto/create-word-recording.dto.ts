import { IsNotEmpty, IsString } from 'class-validator';

export class CreateWordRecordingDto {
  @IsString()
  @IsNotEmpty()
  wordId!: string;

  @IsString()
  @IsNotEmpty()
  dialectTag!: string;

  @IsString()
  @IsNotEmpty()
  translationText!: string;

  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  audioKey!: string;
}

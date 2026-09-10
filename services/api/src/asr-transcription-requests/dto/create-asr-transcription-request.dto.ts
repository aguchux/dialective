import { IsString } from 'class-validator';

export class CreateAsrTranscriptionRequestDto {
  @IsString()
  dialectTag!: string;
}

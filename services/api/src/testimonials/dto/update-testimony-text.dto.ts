import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTestimonyTextDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}

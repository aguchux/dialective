import { IsString, MaxLength } from 'class-validator';

export class CreateCommunityTagDto {
  @IsString()
  @MaxLength(40)
  name!: string;
}

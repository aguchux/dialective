import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderCommunitySpacesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds!: string[];
}

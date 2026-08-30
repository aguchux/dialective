import { IsBoolean } from 'class-validator';

export class UpdateTestimonyVisibilityDto {
  @IsBoolean()
  visible!: boolean;
}

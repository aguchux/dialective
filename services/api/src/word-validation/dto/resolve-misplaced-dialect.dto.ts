import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class ResolveMisplacedDialectDto {
  @IsIn(['DELETE', 'REASSIGN'])
  action!: 'DELETE' | 'REASSIGN';

  @ValidateIf((dto: ResolveMisplacedDialectDto) => dto.action === 'REASSIGN')
  @IsString()
  @IsNotEmpty()
  dialectTag?: string;

  @IsOptional()
  @IsString()
  dialectVariantId?: string;
}

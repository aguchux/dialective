import { ArrayMinSize, ArrayMaxSize, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class BulkResolveWithdrawalsDto {
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  ids!: string[];

  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  adminNote?: string;
}

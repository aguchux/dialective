import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListReferralInvitationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Bounded because listReferralInvitations fetches take = page * pageSize
  // rows from two tables per request (see wallet.controller.ts) -- without
  // a cap, an arbitrarily large page number turns into an arbitrarily large
  // Prisma `take`.
  @Max(10_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 5;
}

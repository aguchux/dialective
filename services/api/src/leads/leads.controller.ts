import { Body, Controller, DefaultValuePipe, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDataAccessLeadDto } from './dto/create-data-access-lead.dto';
import { UpdateDataAccessLeadContactDto } from './dto/update-data-access-lead-contact.dto';

/**
 * Interest capture for the "Subscribe to voice data" landing-page CTA --
 * enterprises/researchers wanting to license the collected voice/dialect
 * dataset. No self-serve subscription or payment flow yet; this stores the
 * lead in Postgres for manual follow-up from the admin dashboard. Public, no auth
 * -- submitted before any account exists.
 */
@Controller('leads')
export class LeadsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('data-access')
  @HttpCode(HttpStatus.CREATED)
  async createDataAccessLead(@Body() dto: CreateDataAccessLeadDto) {
    const lead = await this.prisma.dataAccessLead.create({
      data: {
        name: dto.name,
        email: dto.email,
        organization: dto.organization,
        website: dto.website,
        countriesInterested: dto.countriesInterested,
      },
    });

    return { id: lead.id, status: 'received' };
  }

  @Get('admin/data-access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listDataAccessLeads(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.dataAccessLead.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
        include: {
          contactedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.dataAccessLead.count(),
    ]);

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  }

  @Patch('admin/data-access/:id/contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateDataAccessLeadContact(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDataAccessLeadContactDto,
  ) {
    const lead = await this.prisma.dataAccessLead.update({
      where: { id },
      data: {
        contactedAt: dto.contacted ? new Date() : null,
        contactNote: dto.note?.trim() || null,
        contactedByUserId: dto.contacted ? req.user.sub : null,
      },
      include: {
        contactedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return lead;
  }
}

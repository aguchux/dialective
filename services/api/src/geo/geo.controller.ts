import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CreateDialectDto } from './dto/create-dialect.dto';
import { UpdateDialectDto } from './dto/update-dialect.dto';

const PRISMA_UNIQUE_VIOLATION = 'P2002';
const PRISMA_FK_RESTRICT = 'P2003';
const PRISMA_NOT_FOUND = 'P2025';

/**
 * Read-only country/dialect list backing onboarding (country + default
 * dialect selection) and, potentially, the anonymous word-library/
 * pipeline-test dialect pickers. No auth -- needed before a session exists.
 * Admin CRUD below is separate: guarded, and this is the only place
 * countries/dialects are ever written outside the seed script.
 */
@Controller('geo')
export class GeoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('countries')
  getCountries() {
    return this.prisma.country.findMany({
      select: { id: true, code: true, name: true, _count: { select: { dialects: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get('stats')
  async getStats() {
    const [countryCount, dialectCount] = await Promise.all([
      this.prisma.country.count(),
      this.prisma.dialect.count(),
    ]);
    return { countryCount, dialectCount };
  }

  @Get('countries/:id/dialects')
  async getDialects(@Param('id') id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) {
      throw new NotFoundException('Country not found');
    }
    return this.prisma.dialect.findMany({
      where: { countryId: id },
      select: { id: true, tag: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // --- Admin: countries -------------------------------------------------

  @Get('admin/countries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listCountriesForAdmin() {
    return this.prisma.country.findMany({
      include: { _count: { select: { dialects: true, users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('admin/countries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createCountry(@Body() dto: CreateCountryDto) {
    try {
      return await this.prisma.country.create({
        data: { code: dto.code.toUpperCase(), name: dto.name },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A country with this code already exists');
    }
  }

  @Patch('admin/countries/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateCountry(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    try {
      return await this.prisma.country.update({
        where: { id },
        data: { code: dto.code ? dto.code.toUpperCase() : undefined, name: dto.name },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A country with this code already exists', 'Country not found');
    }
  }

  @Delete('admin/countries/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteCountry(@Param('id') id: string) {
    try {
      await this.prisma.country.delete({ where: { id } });
      return { id, deleted: true };
    } catch (err) {
      throw mapPrismaError(err, undefined, 'Country not found', 'Country still has dialects or users assigned to it');
    }
  }

  // --- Admin: dialects ----------------------------------------------------

  @Get('admin/dialects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listDialectsForAdmin() {
    return this.prisma.dialect.findMany({
      include: { country: { select: { id: true, name: true, code: true } }, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('admin/dialects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createDialect(@Body() dto: CreateDialectDto) {
    const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
    if (!country) {
      throw new UnprocessableEntityException('countryId does not match an existing country');
    }
    try {
      return await this.prisma.dialect.create({
        data: { tag: dto.tag, name: dto.name, countryId: dto.countryId },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A dialect with this tag already exists');
    }
  }

  @Patch('admin/dialects/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateDialect(@Param('id') id: string, @Body() dto: UpdateDialectDto) {
    if (dto.countryId) {
      const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
      if (!country) {
        throw new UnprocessableEntityException('countryId does not match an existing country');
      }
    }
    try {
      return await this.prisma.dialect.update({
        where: { id },
        data: { tag: dto.tag, name: dto.name, countryId: dto.countryId },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A dialect with this tag already exists', 'Dialect not found');
    }
  }

  @Delete('admin/dialects/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteDialect(@Param('id') id: string) {
    try {
      await this.prisma.dialect.delete({ where: { id } });
      return { id, deleted: true };
    } catch (err) {
      throw mapPrismaError(err, undefined, 'Dialect not found', 'Dialect still has users assigned to it');
    }
  }
}

function mapPrismaError(
  err: unknown,
  uniqueMessage?: string,
  notFoundMessage?: string,
  restrictMessage?: string,
): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === PRISMA_UNIQUE_VIOLATION && uniqueMessage) {
      return new ConflictException(uniqueMessage);
    }
    if (err.code === PRISMA_NOT_FOUND && notFoundMessage) {
      return new NotFoundException(notFoundMessage);
    }
    if (err.code === PRISMA_FK_RESTRICT && restrictMessage) {
      return new UnprocessableEntityException(restrictMessage);
    }
  }
  return err as Error;
}

import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only country/dialect list backing onboarding (country + default
 * dialect selection) and, potentially, the anonymous word-library/
 * pipeline-test dialect pickers. No auth -- needed before a session exists.
 */
@Controller('geo')
export class GeoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('countries')
  getCountries() {
    return this.prisma.country.findMany({
      select: { id: true, code: true, name: true },
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
}

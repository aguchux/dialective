import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { Prisma, Role, SubscriptionPoolStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { LlmNormalizerService } from '../llm/llm-normalizer.service';
import { parseProviderOrder } from '../llm/llm-provider.interface';
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
 * onboarding dialect pickers. No auth -- needed before a session exists.
 * Admin CRUD below is separate: guarded, and this is the only place
 * countries/dialects are ever written outside the seed script.
 */
@Controller('geo')
export class GeoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly llm: LlmNormalizerService,
  ) {}

  @Get('countries')
  getCountries() {
    return this.prisma.country.findMany({
      select: { id: true, code: true, name: true, currencyCode: true, _count: { select: { dialects: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Public landing-page metrics. poolVolumeUsd/totalPayoutUsd mirror the
   * same aggregate reads as PoolsController.summary (admin-only, in tokens)
   * -- here converted to USD and rounded to whole dollars, since this is a
   * public marketing figure, not an operational admin balance.
   */
  @Get('stats')
  async getStats() {
    const [countryCount, dialectCount, activeAgg, settledSubmissionAgg, settledWordAgg, rate] = await Promise.all([
      this.prisma.country.count(),
      this.prisma.dialect.count(),
      this.prisma.subscriptionPool.aggregate({
        where: { status: SubscriptionPoolStatus.ACTIVE },
        _sum: { usdAmount: true },
      }),
      this.prisma.submission.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.prisma.wordRecording.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.platformSettings.getTokenUsdRate(),
    ]);

    const poolVolumeUsd = Number(activeAgg._sum.usdAmount ?? 0);
    const totalSettledTokens =
      Number(settledSubmissionAgg._sum.payoutTokenAmount ?? 0) + Number(settledWordAgg._sum.payoutTokenAmount ?? 0);
    const totalPayoutUsd = totalSettledTokens * rate;

    return { countryCount, dialectCount, poolVolumeUsd, totalPayoutUsd };
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
        data: {
          code: dto.code.toUpperCase(),
          name: dto.name,
          currencyCode: dto.currencyCode ? dto.currencyCode.toUpperCase() : undefined,
        },
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
        data: {
          code: dto.code ? dto.code.toUpperCase() : undefined,
          name: dto.name,
          llmGenerationEnabled: dto.llmGenerationEnabled,
          currencyCode: dto.currencyCode ? dto.currencyCode.toUpperCase() : undefined,
          usdExchangeRate: dto.usdExchangeRate,
          exchangeRateSource: dto.usdExchangeRate !== undefined ? 'MANUAL' : undefined,
          exchangeRateUpdatedAt: dto.usdExchangeRate !== undefined ? new Date() : undefined,
        },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A country with this code already exists', 'Country not found');
    }
  }

  /** Flips a MANUAL-override country back to LIVE -- fx-rate-job resumes overwriting its rate on the next run. */
  @Post('admin/countries/:id/reset-exchange-rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resetExchangeRateToLive(@Param('id') id: string) {
    try {
      return await this.prisma.country.update({
        where: { id },
        data: { exchangeRateSource: 'LIVE' },
      });
    } catch (err) {
      throw mapPrismaError(err, undefined, 'Country not found');
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
        data: { tag: dto.tag, name: dto.name, countryId: dto.countryId, keyboardLayout: dto.keyboardLayout },
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
        data: {
          tag: dto.tag,
          name: dto.name,
          countryId: dto.countryId,
          llmGenerationEnabled: dto.llmGenerationEnabled,
          keyboardLayout: dto.keyboardLayout,
        },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A dialect with this tag already exists', 'Dialect not found');
    }
  }

  /**
   * Drafts a starter keyboard-layout character set for the admin to review
   * and edit before saving via the normal PATCH above -- deliberately a
   * separate step, does not write to the DB itself.
   */
  @Post('admin/dialects/:id/generate-keyboard-layout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async generateKeyboardLayout(@Param('id') id: string) {
    const dialect = await this.prisma.dialect.findUnique({ where: { id }, include: { country: true } });
    if (!dialect) throw new NotFoundException('Dialect not found');

    const prompt = [
      `List the characters, diacritics, and special letters unique to written ${dialect.name}`,
      `(spoken in ${dialect.country.name}) that are not on a standard QWERTY keyboard.`,
      'Respond with ONLY a space-separated list of characters, no explanation, no numbering.',
    ].join(' ');

    const order = parseProviderOrder((await this.platformSettings.getForAdmin()).spellingNormalizationProviderOrder);
    const keyboardLayout = await this.llm.normalize(prompt, order);
    return { keyboardLayout: keyboardLayout.trim() };
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

import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Role } from '@dialectiva/db';
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
import { CreateDialectVariantDto } from './dto/create-dialect-variant.dto';
import { UpdateDialectVariantDto } from './dto/update-dialect-variant.dto';
import { fetchAllFxRatesOrNull, fetchLiveRateOrNull } from './exchange-rate-fetch.util';

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
  private readonly logger = new Logger(GeoController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly llm: LlmNormalizerService,
  ) {}

  private async validateKeyboardLayout(keyboardLayout: string | undefined) {
    if (keyboardLayout === undefined) return;

    const { keyboardLayoutMaxLength } = await this.platformSettings.getForAdmin();
    if (keyboardLayout.length > keyboardLayoutMaxLength) {
      throw new UnprocessableEntityException(
        `keyboardLayout must not exceed ${keyboardLayoutMaxLength} characters`,
      );
    }
  }

  @Get('countries')
  getCountries() {
    return this.prisma.country.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        currencyCode: true,
        _count: { select: { dialects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Public landing-page metrics. totalRecordings/totalPayoutUsd mirror the
   * same aggregate reads as PoolsController.summary (admin-only, in tokens)
   * for the payout figure -- here converted to USD and rounded to whole
   * dollars, since this is a public marketing figure, not an operational
   * admin balance. totalRecordings replaced the old "Pool Volume" card: the
   * subscription-pool concept has been retired now that the platform runs
   * on Tokenomics minting/reserve automation instead (see
   * services/api/src/tokenomics), so a fixed-pool USD balance is no longer
   * a meaningful figure to show trainers -- a running count of submitted
   * recordings is.
   */
  @Get('stats')
  async getStats() {
    const [
      countryCount,
      dialectCount,
      totalTrainers,
      wordRecordingCount,
      settledWordAgg,
      rate,
      visibility,
    ] = await Promise.all([
      this.prisma.country.count(),
      this.prisma.dialect.count(),
      this.prisma.user.count({ where: { role: Role.TRAINER } }),
      this.prisma.wordRecording.count(),
      this.prisma.wordRecording.aggregate({
        where: { settledAt: { not: null } },
        _sum: { payoutTokenAmount: true },
      }),
      this.platformSettings.getTokenUsdRate(),
      this.platformSettings.getLandingVisibility(),
    ]);

    const totalRecordings = wordRecordingCount;
    const totalSettledTokens = Number(settledWordAgg._sum.payoutTokenAmount ?? 0);
    const totalPayoutUsd = totalSettledTokens * rate;

    // Every figure is still computed regardless of visibility -- these flags
    // only tell the landing page which cards to render, they're not a
    // shortcut to skip the underlying aggregate reads.
    return { countryCount, dialectCount, totalTrainers, totalRecordings, totalPayoutUsd, visibility };
  }

  /**
   * Flat tag -> full-name lookup for every dialect, regardless of country --
   * backs the frontend's shared dialect-name display helper so trainer-facing
   * UI can show "Igbo" instead of the raw "ig" tag without needing a
   * country-scoped fetch first. No auth, same reasoning as the rest of this
   * controller: needed before a session exists, and carries no sensitive data.
   */
  @Get('dialects')
  getAllDialects() {
    return this.prisma.dialect.findMany({
      where: { active: true },
      select: { tag: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('countries/:id/dialects')
  async getDialects(@Param('id') id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) {
      throw new NotFoundException('Country not found');
    }
    return this.prisma.dialect.findMany({
      where: { countryId: id, active: true },
      select: { id: true, tag: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Feeds onboarding's optional "specific variety" dropdown -- only shown
   * when a dialect actually has variants configured (see updateProfile's
   * dialectVariantId validation, which re-checks this same relationship
   * server-side rather than trusting the client).
   */
  @Get('dialects/:id/variants')
  async getDialectVariants(@Param('id') id: string) {
    const dialect = await this.prisma.dialect.findUnique({ where: { id } });
    if (!dialect || !dialect.active) {
      throw new NotFoundException('Dialect not found');
    }
    return this.prisma.dialectVariant.findMany({
      where: { dialectId: id, active: true },
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

  /**
   * Flips a MANUAL-override country back to LIVE and immediately fetches its
   * current rate, rather than leaving the stale MANUAL-era rate in place
   * until fx-rate-job's next scheduled run (up to 24h later).
   */
  @Post('admin/countries/:id/reset-exchange-rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resetExchangeRateToLive(@Param('id') id: string) {
    try {
      const country = await this.prisma.country.findUniqueOrThrow({
        where: { id },
        select: { currencyCode: true },
      });
      const liveRate = await fetchLiveRateOrNull(country.currencyCode, this.logger);
      return await this.prisma.country.update({
        where: { id },
        data: {
          exchangeRateSource: 'LIVE',
          ...(liveRate !== null && { usdExchangeRate: liveRate, exchangeRateUpdatedAt: new Date() }),
        },
      });
    } catch (err) {
      throw mapPrismaError(err, undefined, 'Country not found');
    }
  }

  /** On-demand equivalent of fx-rate-job's daily run, triggerable from the admin UI instead of waiting for the next cron run. */
  @Post('admin/countries/refresh-exchange-rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async refreshExchangeRatesNow() {
    const countries = await this.prisma.country.findMany({
      where: { exchangeRateSource: 'LIVE' },
      select: { id: true, currencyCode: true },
    });
    const rates = await fetchAllFxRatesOrNull(this.logger);
    if (!rates) {
      throw new UnprocessableEntityException('Live FX rate provider is unavailable right now');
    }

    const now = new Date();
    let updated = 0;
    let skipped = 0;
    for (const country of countries) {
      const rate = country.currencyCode === 'USD' ? 1 : rates[country.currencyCode];
      if (rate === undefined) {
        skipped += 1;
        continue;
      }
      await this.prisma.country.update({
        where: { id: country.id },
        data: { usdExchangeRate: rate, exchangeRateUpdatedAt: now },
      });
      updated += 1;
    }
    return { updated, skipped, total: countries.length };
  }

  @Delete('admin/countries/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteCountry(@Param('id') id: string) {
    try {
      await this.prisma.country.delete({ where: { id } });
      return { id, deleted: true };
    } catch (err) {
      throw mapPrismaError(
        err,
        undefined,
        'Country not found',
        'Country still has dialects or users assigned to it',
      );
    }
  }

  // --- Admin: dialects ----------------------------------------------------

  @Get('admin/dialects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listDialectsForAdmin() {
    return this.prisma.dialect.findMany({
      include: {
        country: { select: { id: true, name: true, code: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post('admin/dialects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createDialect(@Body() dto: CreateDialectDto) {
    await this.validateKeyboardLayout(dto.keyboardLayout);
    const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
    if (!country) {
      throw new UnprocessableEntityException('countryId does not match an existing country');
    }
    try {
      return await this.prisma.dialect.create({
        data: {
          tag: dto.tag,
          name: dto.name,
          countryId: dto.countryId,
          keyboardLayout: dto.keyboardLayout,
        },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A dialect with this tag already exists');
    }
  }

  @Patch('admin/dialects/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateDialect(@Param('id') id: string, @Body() dto: UpdateDialectDto) {
    await this.validateKeyboardLayout(dto.keyboardLayout);
    if (dto.countryId) {
      const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
      if (!country) {
        throw new UnprocessableEntityException('countryId does not match an existing country');
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const dialect = await tx.dialect.update({
          where: { id },
          data: {
            tag: dto.tag,
            name: dto.name,
            countryId: dto.countryId,
            active: dto.active,
            tasksPaused: dto.tasksPaused,
            llmGenerationEnabled: dto.llmGenerationEnabled,
            keyboardLayout: dto.keyboardLayout,
          },
        });
        if (dto.active === false) {
          await this.resetTrainerDialectAssignments(tx, { dialectId: id });
        }
        return dialect;
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
    const dialect = await this.prisma.dialect.findUnique({
      where: { id },
      include: { country: true },
    });
    if (!dialect) throw new NotFoundException('Dialect not found');

    const prompt = [
      `List the characters, diacritics, and special letters unique to written ${dialect.name}`,
      `(spoken in ${dialect.country.name}) that are not on a standard QWERTY keyboard.`,
      'Respond with ONLY a space-separated list of characters, no explanation, no numbering.',
    ].join(' ');

    const order = parseProviderOrder(
      (await this.platformSettings.getForAdmin()).spellingNormalizationProviderOrder,
    );
    const keyboardLayout = await this.llm.normalize(prompt, order);
    return { keyboardLayout: keyboardLayout.trim() };
  }

  @Delete('admin/dialects/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteDialect(@Param('id') id: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.resetTrainerDialectAssignments(tx, { dialectId: id });
        await tx.dialect.delete({ where: { id } });
      });
      return { id, deleted: true };
    } catch (err) {
      throw mapPrismaError(
        err,
        undefined,
        'Dialect not found',
        'Dialect still has users assigned to it',
      );
    }
  }

  // --- Admin: dialect variants ---------------------------------------------

  /**
   * Every sub-dialect across every dialect/country in one flat, searchable
   * list -- lets an admin locate a specific sub-dialect (e.g. "Izzi") to
   * pause its tasks directly, without first knowing which parent dialect
   * it lives under. Complements listDialectVariantsForAdmin (scoped to one
   * dialect), which stays in place for the existing drill-down "Variants"
   * dialog.
   */
  @Get('admin/dialect-variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listAllDialectVariantsForAdmin() {
    return this.prisma.dialectVariant.findMany({
      include: {
        dialect: {
          select: { id: true, name: true, tag: true, country: { select: { name: true } } },
        },
        _count: { select: { users: true, wordRecordings: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Variant list with basic usage counts (users, recordings tagged with
   * each variant) for the admin Coverage table's expandable dialect row --
   * see the dialect-variants plan's "Reporting" phase.
   */
  @Get('admin/dialects/:id/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listDialectVariantsForAdmin(@Param('id') id: string) {
    const dialect = await this.prisma.dialect.findUnique({ where: { id } });
    if (!dialect) {
      throw new NotFoundException('Dialect not found');
    }
    return this.prisma.dialectVariant.findMany({
      where: { dialectId: id },
      include: { _count: { select: { users: true, wordRecordings: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('admin/dialects/:id/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async createDialectVariant(@Param('id') id: string, @Body() dto: CreateDialectVariantDto) {
    const dialect = await this.prisma.dialect.findUnique({ where: { id } });
    if (!dialect || !dialect.active) {
      throw new NotFoundException('Dialect not found');
    }
    try {
      return await this.prisma.dialectVariant.create({
        data: { dialectId: id, tag: dto.tag, name: dto.name },
      });
    } catch (err) {
      throw mapPrismaError(err, 'A variant with this tag already exists under this dialect');
    }
  }

  @Patch('admin/dialect-variants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateDialectVariant(@Param('id') id: string, @Body() dto: UpdateDialectVariantDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const variant = await tx.dialectVariant.update({
          where: { id },
          data: { tag: dto.tag, name: dto.name, active: dto.active, tasksPaused: dto.tasksPaused },
        });
        if (dto.active === false) {
          await this.resetTrainerDialectAssignments(tx, { dialectVariantId: id });
        }
        return variant;
      });
    } catch (err) {
      throw mapPrismaError(
        err,
        'A variant with this tag already exists under this dialect',
        'Variant not found',
      );
    }
  }

  @Delete('admin/dialect-variants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteDialectVariant(@Param('id') id: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.resetTrainerDialectAssignments(tx, { dialectVariantId: id });
        await tx.dialectVariant.delete({ where: { id } });
      });
      return { id, deleted: true };
    } catch (err) {
      throw mapPrismaError(
        err,
        undefined,
        'Variant not found',
        'Variant still has users or recordings assigned to it',
      );
    }
  }

  private async resetTrainerDialectAssignments(
    tx: Prisma.TransactionClient,
    where: Prisma.UserWhereInput,
  ): Promise<void> {
    const affected = await tx.user.findMany({
      where: { role: Role.TRAINER, ...where },
      select: { id: true },
    });
    if (affected.length === 0) return;

    const userIds = affected.map((user) => user.id);
    await Promise.all([
      tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { countryId: null, dialectId: null, dialectVariantId: null },
      }),
      tx.refreshToken.updateMany({
        where: { userId: { in: userIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
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

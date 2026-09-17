import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreatePaymentMethodCatalogDto,
  CreatePaymentMethodLogoUploadUrlDto,
  ListPaymentMethodsDto,
  UpdatePaymentMethodCatalogDto,
} from './dto/payment-methods.dto';

const PAYMENT_METHOD_LOGO_BUCKET =
  process.env.SPACES_PAYMENT_METHOD_LOGO_BUCKET ?? 'dialectiva-payment-method-logos';
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * Admin-curated per-country payment method catalog (see
 * PaymentMethodCatalog's schema doc). Reference/display data only -- when a
 * user picks "GTBank" from this list while adding a free-entry BANK
 * account, the catalog row's bankCode/name is copied onto the new
 * PayoutAccount, but no provider call happens (see the "free-entry" account
 * creation path this unblocks in PayoutAccountsController).
 */
@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Public, enabled-only, scoped to one country -- what a user sees while adding an account. */
  async list(query: ListPaymentMethodsDto) {
    const rows = await this.prisma.paymentMethodCatalog.findMany({
      where: {
        countryCode: query.countryCode.toUpperCase(),
        enabled: true,
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => serialize(row, this.storage));
  }

  async listAllForAdmin() {
    const rows = await this.prisma.paymentMethodCatalog.findMany({
      orderBy: [{ countryCode: 'asc' }, { type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => serialize(row, this.storage));
  }

  async create(dto: CreatePaymentMethodCatalogDto) {
    const row = await this.prisma.paymentMethodCatalog.create({
      data: {
        countryCode: dto.countryCode.toUpperCase(),
        type: dto.type,
        name: dto.name,
        description: dto.description,
        bankCode: dto.bankCode,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return serialize(row, this.storage);
  }

  async update(id: string, dto: UpdatePaymentMethodCatalogDto) {
    await this.requireRow(id);
    const row = await this.prisma.paymentMethodCatalog.update({ where: { id }, data: dto });
    return serialize(row, this.storage);
  }

  async delete(id: string) {
    await this.requireRow(id);
    await this.prisma.paymentMethodCatalog.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** publicRead=true -- a payment method's logo is shown to any signed-in user browsing the catalog while adding an account, same posture as CommunityAttachmentsService's approved-content assets. */
  async createLogoUploadUrl(id: string, dto: CreatePaymentMethodLogoUploadUrlDto) {
    await this.requireRow(id);
    const extension = EXTENSION_BY_CONTENT_TYPE[dto.contentType];
    const key = `${id}/${randomUUID()}.${extension}`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      PAYMENT_METHOD_LOGO_BUCKET,
      key,
      dto.contentType,
      true,
    );
    return { uploadUrl: url, key, bucket: PAYMENT_METHOD_LOGO_BUCKET, expiresInSeconds };
  }

  async confirmLogoUpload(id: string, key: string) {
    await this.requireRow(id);
    const row = await this.prisma.paymentMethodCatalog.update({
      where: { id },
      data: { logoKey: key },
    });
    return serialize(row, this.storage);
  }

  private async requireRow(id: string) {
    const row = await this.prisma.paymentMethodCatalog.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Payment method not found');
    return row;
  }
}

function serialize(
  row: {
    id: string;
    countryCode: string;
    type: string;
    name: string;
    description: string | null;
    logoKey: string | null;
    bankCode: string | null;
    enabled: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  storage: StorageService,
) {
  return {
    id: row.id,
    countryCode: row.countryCode,
    type: row.type,
    name: row.name,
    description: row.description,
    logoUrl: row.logoKey
      ? storage.getPublicObjectUrl(PAYMENT_METHOD_LOGO_BUCKET, row.logoKey)
      : null,
    bankCode: row.bankCode,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

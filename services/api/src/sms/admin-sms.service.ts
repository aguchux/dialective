import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminSmsDto } from './dto/create-admin-sms.dto';
import { ListAdminSmsContactsDto } from './dto/list-admin-sms-contacts.dto';
import { SmsService } from './sms.service';

@Injectable()
export class AdminSmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async listContacts(query: ListAdminSmsContactsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const search = query.search?.trim();
    const where = {
      phoneNumber: { not: null },
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phoneNumber: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          phoneVerifiedAt: true,
          smsNotificationsEnabled: true,
          status: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        phoneVerified: item.phoneVerifiedAt !== null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async send(adminId: string, dto: CreateAdminSmsDto) {
    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId },
      select: { id: true, phoneNumber: true },
    });
    if (!recipient?.phoneNumber) throw new NotFoundException('Recipient phone number was not found');

    try {
      const result = await this.sms.sendTransactional(recipient.phoneNumber, dto.message);
      const record = await this.prisma.adminSmsMessage.create({
        data: {
          senderId: adminId,
          recipientId: recipient.id,
          phoneNumber: recipient.phoneNumber,
          body: dto.message,
          provider: result.provider,
          status: 'SENT',
        },
      });
      return { id: record.id, status: record.status, provider: result.provider, createdAt: record.createdAt };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message.slice(0, 500) : 'SMS delivery failed';
      await this.prisma.adminSmsMessage.create({
        data: {
          senderId: adminId,
          recipientId: recipient.id,
          phoneNumber: recipient.phoneNumber,
          body: dto.message,
          status: 'FAILED',
          failureReason,
        },
      });
      throw error;
    }
  }
}

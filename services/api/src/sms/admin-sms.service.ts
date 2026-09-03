import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminSmsDto } from './dto/create-admin-sms.dto';
import { ListAdminSmsContactsDto } from './dto/list-admin-sms-contacts.dto';
import { ListAdminSmsMessagesDto } from './dto/list-admin-sms-messages.dto';
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

  /**
   * A contact's full send history (both directions of authorship -- any
   * admin's messages to this recipient), oldest-first for a natural
   * top-to-bottom chat read order. Shared/operational, not scoped to the
   * requesting admin: every admin sees the same thread with a contact, same
   * posture as admin-recordings' audit trail.
   */
  async listMessages(contactId: string, query: ListAdminSmsMessagesDto) {
    const contact = await this.prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contact was not found');

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = { recipientId: contactId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminSmsMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          body: true,
          status: true,
          failureReason: true,
          provider: true,
          createdAt: true,
          sender: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.adminSmsMessage.count({ where }),
    ]);

    return {
      // Reversed to oldest-first for the thread view -- the DB query stays
      // newest-first (skip/take) so page 1 is always the most recent
      // messages, matching how the compose UI's "most recent" pagination
      // should behave as history grows.
      items: items.reverse(),
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
      const result = await this.sms.sendTransactional(recipient.phoneNumber, dto.message, dto.provider);
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
          // dto.provider is the forced provider that was actually attempted
          // (see SmsService.sendTransactional); undefined when no override
          // was given, since then the whole fallback chain was tried and no
          // single provider name applies.
          provider: dto.provider,
          status: 'FAILED',
          failureReason,
        },
      });
      throw error;
    }
  }
}

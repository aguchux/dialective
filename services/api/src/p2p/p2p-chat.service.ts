import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, Role } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { CreateP2PChatUploadUrlDto, SendP2PTradeMessageDto } from './dto/p2p-chat.dto';

const P2P_CHAT_BUCKET = process.env.SPACES_P2P_CHAT_BUCKET ?? 'dialectiva-p2p-chat';
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const messageSenderSelect = {
  select: { id: true, firstName: true, lastName: true, email: true, role: true },
} satisfies { select: Prisma.UserSelect };
type MessageWithSender = Prisma.P2PTradeMessageGetPayload<{
  include: { sender: typeof messageSenderSelect };
}>;

/**
 * One shared chat thread per trade: buyer and seller talk here from the
 * moment a trade is created (payment coordination, proof-of-payment
 * screenshots), and once a dispute is raised, admins can read and post in
 * the SAME thread rather than a separate one -- so a reviewing admin sees
 * everything the two parties already said to each other, not a blank slate.
 * Access is gated per-call, not by a stored participant list: trade
 * participants always, any Role.ADMIN only once trade.status is DISPUTED
 * (or the dispute has since been resolved -- an admin who was already
 * involved shouldn't lose read access once it's closed out).
 */
@Injectable()
export class P2PChatService {
  private readonly logger = new Logger(P2PChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async listMessages(userId: string, userRole: Role, tradeId: string) {
    const trade = await this.requireAccess(userId, userRole, tradeId);
    const messages = await this.prisma.p2PTradeMessage.findMany({
      where: { tradeId: trade.id },
      include: { sender: messageSenderSelect },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return messages.map(serializeMessage);
  }

  async sendMessage(userId: string, userRole: Role, tradeId: string, dto: SendP2PTradeMessageDto) {
    const trade = await this.requireAccess(userId, userRole, tradeId);
    const body = dto.body?.trim() || undefined;
    if (!body && !dto.attachmentKey) {
      throw new BadRequestException('Message must include text or an attachment');
    }
    const isFromAdmin =
      userRole === Role.ADMIN && trade.buyerId !== userId && trade.sellerId !== userId;
    // Checked BEFORE the insert, not after -- "is this the first admin
    // message" must reflect the state the sender actually walked into, not
    // a state that already includes the message being created right now.
    const isAdminsFirstMessageInThisThread =
      isFromAdmin &&
      (await this.prisma.p2PTradeMessage.count({ where: { tradeId: trade.id, isFromAdmin: true } })) ===
        0;
    const message = await this.prisma.p2PTradeMessage.create({
      data: {
        tradeId: trade.id,
        senderId: userId,
        isFromAdmin,
        body,
        attachmentKey: dto.attachmentKey,
        attachmentContentType: dto.attachmentKey ? dto.attachmentContentType : undefined,
      },
      include: { sender: messageSenderSelect },
    });
    if (isAdminsFirstMessageInThisThread) {
      void this.notifyPartiesAdminJoined(trade.id, trade.buyerId, trade.sellerId);
    }
    return serializeMessage(message);
  }

  /**
   * Best-effort, fire-and-forget -- an email delivery failure must never
   * fail the admin's message send itself. Notifies BOTH parties, not just
   * whoever raised the dispute, since either side may need to respond once
   * an admin is reviewing.
   */
  private async notifyPartiesAdminJoined(
    tradeId: string,
    buyerId: string,
    sellerId: string,
  ): Promise<void> {
    try {
      const [buyer, seller] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: buyerId }, select: { email: true } }),
        this.prisma.user.findUnique({ where: { id: sellerId }, select: { email: true } }),
      ]);
      await Promise.all([
        buyer ? this.mail.sendP2PAdminJoinedDisputeEmail(buyer.email, tradeId) : Promise.resolve(),
        seller ? this.mail.sendP2PAdminJoinedDisputeEmail(seller.email, tradeId) : Promise.resolve(),
      ]);
    } catch (err) {
      this.logger.warn(
        `Failed to notify trade=${tradeId} parties that an admin joined the dispute: ${String(err)}`,
      );
    }
  }

  /**
   * publicRead=false, unlike CommunityAttachmentsService -- a payment proof
   * screenshot can show an account number/name, so it's only ever handed
   * out via a short-lived presigned GET to a verified trade participant or
   * admin (see attachmentDownloadUrl), never a stable public URL.
   */
  async createUploadUrl(userId: string, userRole: Role, tradeId: string, dto: CreateP2PChatUploadUrlDto) {
    await this.requireAccess(userId, userRole, tradeId);
    const extension = EXTENSION_BY_CONTENT_TYPE[dto.contentType];
    const key = `${tradeId}/${randomUUID()}.${extension}`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      P2P_CHAT_BUCKET,
      key,
      dto.contentType,
      false,
    );
    return { uploadUrl: url, key, bucket: P2P_CHAT_BUCKET, expiresInSeconds };
  }

  async attachmentDownloadUrl(userId: string, userRole: Role, tradeId: string, messageId: string) {
    await this.requireAccess(userId, userRole, tradeId);
    const message = await this.prisma.p2PTradeMessage.findFirst({
      where: { id: messageId, tradeId },
    });
    if (!message || !message.attachmentKey) throw new NotFoundException('Attachment not found');
    const { url, expiresInSeconds } = await this.storage.createPresignedDownloadUrl(
      P2P_CHAT_BUCKET,
      message.attachmentKey,
    );
    return { url, expiresInSeconds };
  }

  private async requireAccess(userId: string, userRole: Role, tradeId: string) {
    const trade = await this.prisma.p2PTokenTrade.findUnique({
      where: { id: tradeId },
      select: { id: true, buyerId: true, sellerId: true, status: true, disputedAt: true },
    });
    if (!trade) throw new NotFoundException('Trade not found');
    const isParticipant = trade.buyerId === userId || trade.sellerId === userId;
    const isAdminOnDisputedTrade = userRole === Role.ADMIN && !!trade.disputedAt;
    if (!isParticipant && !isAdminOnDisputedTrade) {
      throw new ForbiddenException('You do not have access to this trade');
    }
    return trade;
  }
}

function serializeMessage(message: MessageWithSender) {
  return {
    id: message.id,
    tradeId: message.tradeId,
    senderId: message.senderId,
    isFromAdmin: message.isFromAdmin,
    body: message.body,
    hasAttachment: !!message.attachmentKey,
    attachmentContentType: message.attachmentContentType,
    createdAt: message.createdAt,
    sender: {
      id: message.sender.id,
      firstName: message.sender.firstName,
      lastName: message.sender.lastName,
      email: message.sender.email,
    },
  };
}

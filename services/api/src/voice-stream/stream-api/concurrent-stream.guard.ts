import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

/**
 * Per-Stream-Key concurrent-stream cap (doc section 26/36), sourced from
 * SubscriptionPlan.maxConcurrentStreams (null = unlimited). In-memory,
 * per-pod counter -- correct enough for this phase's single-`api`-pod-set
 * scale; a Redis-backed counter would be needed to enforce a hard cross-pod
 * cap, noted here as a future-hardening step rather than built now.
 * StreamAudioController is responsible for calling release() in a finally
 * block so a client disconnect or error never leaks a permanently-held slot.
 */
@Injectable()
export class ConcurrentStreamGuard implements CanActivate {
  private readonly activeByKeyId = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.streamKey.organizationId },
      include: { plan: true },
    });
    const limit = subscription?.plan.maxConcurrentStreams;
    if (limit == null) {
      this.acquire(request.streamKey.id);
      return true;
    }

    const current = this.activeByKeyId.get(request.streamKey.id) ?? 0;
    if (current >= limit) {
      throw new HttpException(
        `This Stream Key has reached its concurrent-stream limit of ${limit}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.acquire(request.streamKey.id);
    return true;
  }

  private acquire(keyId: string): void {
    this.activeByKeyId.set(keyId, (this.activeByKeyId.get(keyId) ?? 0) + 1);
  }

  release(keyId: string): void {
    const current = this.activeByKeyId.get(keyId) ?? 0;
    if (current <= 1) {
      this.activeByKeyId.delete(keyId);
    } else {
      this.activeByKeyId.set(keyId, current - 1);
    }
  }
}

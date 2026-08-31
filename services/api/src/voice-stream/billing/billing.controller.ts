import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { UsageCounterService } from '../stream-api/usage-counter.service';

@Controller('voice-stream/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly usageCounter: UsageCounterService,
  ) {}

  @Post('checkout-session')
  @UseGuards(SubscriberAuthGuard, SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.BILLING_MANAGER)
  createCheckoutSession(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billing.createCheckoutSession(
      subscriber.organizationId,
      subscriber.email,
      dto.planKey,
    );
  }

  @Get('subscription')
  @UseGuards(SubscriberAuthGuard)
  getSubscription(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.billing.getSubscriptionStatus(subscriber.organizationId);
  }

  @Get('usage')
  @UseGuards(SubscriberAuthGuard)
  async getUsage(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    const usage = await this.usageCounter.getCurrentUsage(subscriber.organizationId);
    return {
      periodStart: usage.periodStart,
      bytesUsed: usage.bytesUsed.toString(),
      requestsUsed: usage.requestsUsed,
    };
  }

  /**
   * No auth guard -- Stripe can't send a JWT, trust comes from
   * BillingService.handleWebhook's signature verification instead. Needs
   * the raw request body (main.ts's `rawBody: true`, already enabled for
   * the Flutterwave webhook), since stripe.webhooks.constructEvent verifies
   * the signature over raw bytes.
   */
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    await this.billing.handleWebhook(rawBody, signature);
    return { received: true };
  }
}

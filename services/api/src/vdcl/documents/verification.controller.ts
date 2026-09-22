import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VdclVerificationService } from './verification.service';

/**
 * Public QR verification.
 *
 * The ONLY unauthenticated route in the VDCL module. A certificate is
 * printed and photographed, so whoever scans it has no account -- requiring
 * one would make verification useless to exactly the people it exists for.
 *
 * Two things follow from that:
 *
 * - It is rate-limited harder than the app-wide 60/min backstop, per the
 *   plan's "rate-limited and privacy-minimised" requirement. An open
 *   endpoint keyed by an opaque token is an enumeration target, and a
 *   genuine scanner checks one certificate, not thirty.
 *
 * - It discloses only what a stranger needs to judge whether the document
 *   is real: status, dataset metrics, and a privacy-safe label. Never the
 *   contributor's identity. Anything returned here should be assumed
 *   permanently public.
 */
@Controller('verify')
export class VdclVerificationController {
  constructor(private readonly verification: VdclVerificationService) {}

  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @Get(':token')
  verify(@Param('token') token: string) {
    return this.verification.verify(token);
  }
}

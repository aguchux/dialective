import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// ThrottlerLimitDetail isn't re-exported from the package root, so take it
// from the base method's own signature rather than deep-importing
// @nestjs/throttler/dist/* -- that path is internal and free to move
// between releases.
type ThrottlerLimitDetail = Parameters<ThrottlerGuard['throwThrottlingException']>[1];

/** "1 minute" / "45 minutes" / "2 hours" -- whichever unit reads most naturally. */
function formatRetryWindow(seconds: number): string {
  if (seconds <= 60) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}

/**
 * Base for every throttler guard in the app, so a rate-limited request
 * explains itself instead of leaking a class name.
 *
 * @nestjs/throttler's default response body is the literal string
 * "ThrottlerException: Too Many Requests". The frontend surfaces
 * `data.message` verbatim (normalizeErrorMessage in store/api.ts), which is
 * right for every deliberately-worded 4xx the API returns -- so this one
 * reached users as raw stack-speak on the payout-wallet screen, next to a
 * "Send confirmation code" button, with no hint of what went wrong or when
 * to try again.
 *
 * The message names the real cause (too many attempts, not an error with
 * their wallet) and, using timeToExpire from the throttler's own record,
 * says when the limit clears. That matters here specifically: these limits
 * are hourly (5-20/hour on wallet and OTP routes), so "try again later"
 * would leave someone retrying blindly against a window that hasn't moved.
 */
export abstract class FriendlyThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryIn = formatRetryWindow(detail.timeToExpire);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Too many attempts. For your security this is limited -- please try again in ${retryIn}.`,
        retryAfterSeconds: detail.timeToExpire,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

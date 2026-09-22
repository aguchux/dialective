import { P2PTrade } from '@/store/api';

/**
 * Trade status presentation, shared by the My-trades table, the trade
 * detail page, and anything else that shows a status badge -- kept in one
 * module so a status can never read one way in the list and another way on
 * the page it links to.
 */

export const STATUS_LABELS: Record<P2PTrade['status'], string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID_MARKED: 'Marked as paid',
  RELEASED: 'Released',
  CANCEL_PENDING: 'Cancel pending',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
  EXPIRED: 'Expired',
  // Escrow is mid-transfer. Normally too brief for a user to ever see; if it
  // persists, a release or refund crashed partway and needs admin attention.
  SETTLING: 'Completing',
};

/**
 * The status label, written from the viewer's point of view.
 *
 * "Released" alone does not say where the tokens went, which is the one
 * thing a party to the trade actually wants to know. A release always
 * credits the BUYER -- the seller's tokens were debited when the escrow
 * locked -- so the label resolves to "Released to you" for the buyer and
 * "Released to buyer" for the seller.
 *
 * Every other status reads the same for both sides, so they fall through
 * to the shared map.
 *
 * `viewerId` may be undefined while the session is still loading; the
 * neutral "Released to buyer" is correct for anyone who is not the buyer,
 * including an admin or an unresolved viewer, so there is no misleading
 * intermediate state.
 */
export function statusLabelForViewer(
  trade: Pick<P2PTrade, 'status' | 'buyerId' | 'sellerId'>,
  viewerId: string | undefined,
): string {
  if (trade.status !== 'RELEASED') return STATUS_LABELS[trade.status];
  if (viewerId && viewerId === trade.buyerId) return 'Released to you';
  if (viewerId && viewerId === trade.sellerId) return 'Released to buyer';
  return 'Released to buyer';
}

export function statusBadgeClass(status: P2PTrade['status']): string {
  switch (status) {
    case 'RELEASED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'bg-bg text-muted';
    case 'DISPUTED':
      return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200';
    case 'PAID_MARKED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    default:
      return 'bg-accent-soft text-accent';
  }
}

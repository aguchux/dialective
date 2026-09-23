/**
 * The one way a licensed dataset's audio duration is written.
 *
 * This existed in four copies with three different behaviours, and they
 * disagreed about the same dataset: the maker screen truncated with
 * Math.floor, the PDF and certificate rounded with Math.round and had no
 * seconds branch at all. 92 seconds of audio therefore read as "1m" on the
 * screen a contributor signs from and "2 minutes" on the licence that
 * signature produced.
 *
 * Both were wrong in a way that matters, because this figure is the stated
 * size of the dataset being licensed:
 *
 * - Truncating discarded up to 59 seconds. Typical recordings here are
 *   single words averaging ~2s, so a whole contributor's dataset is often
 *   90-180 seconds -- losing a minute off that is losing a third of it.
 * - Rounding to whole minutes with no seconds branch printed "0 minutes"
 *   for any dataset under 30 seconds. A signed licence asserting it covers
 *   zero minutes of audio is worse than unhelpful; it is wrong on its face.
 *
 * So minutes and seconds are both shown below an hour. Nothing is rounded
 * away that a reader could otherwise check against the recording count.
 */

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function parts(ms: string | number | null | undefined) {
  const value = Number(ms ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Round to the nearest second FIRST, so 59.6s reads as "1m 0s" rather
  // than "59s" -- the components must agree with each other, not each be
  // derived independently from the raw millisecond value.
  const totalSeconds = Math.round(value / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** Compact form for dashboard metric cards and the PNG certificate: "1h 4m", "1m 32s", "8s". */
export function formatDurationShort(ms: string | number | null | undefined): string {
  const p = parts(ms);
  if (!p) return '0s';
  if (p.hours > 0) return `${p.hours}h ${p.minutes}m`;
  if (p.minutes > 0) return `${p.minutes}m ${p.seconds}s`;
  return `${p.seconds}s`;
}

/** Long form for the PDF's prose body: "1 hour 4 minutes", "1 minute 32 seconds", "8 seconds". */
export function formatDurationLong(ms: string | number | null | undefined): string {
  const p = parts(ms);
  if (!p) return '0 seconds';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (p.hours > 0) return `${unit(p.hours, 'hour')} ${unit(p.minutes, 'minute')}`;
  if (p.minutes > 0) return `${unit(p.minutes, 'minute')} ${unit(p.seconds, 'second')}`;
  return unit(p.seconds, 'second');
}

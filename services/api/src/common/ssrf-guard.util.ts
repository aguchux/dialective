import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Resolves `hostname` and rejects if ANY resolved address is private,
 * loopback, link-local, or otherwise non-public -- called immediately before
 * an outbound request to a user-supplied URL (e.g. webhook delivery), not
 * only at registration time, so a rebound DNS answer (a hostname that
 * resolved to a public IP when the webhook was registered, then to
 * 169.254.169.254 or 10.0.0.0/8 at delivery time) is still caught. This is a
 * mitigation, not a hard guarantee -- Node's fetch does not expose a way to
 * pin the connection to the exact IP this function validated, so a
 * sufficiently fast TOCTOU race between this check and the fetch call below
 * it is still theoretically possible. Combined with the short delivery
 * timeout and outbound network policy, this closes the practical risk.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Refusing to contact non-public address: ${hostname}`);
    }
    return;
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error(`Refusing to contact non-public address: ${hostname} -> ${record.address}`);
    }
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateOrReservedIpv4(address);
  if (family === 6) return isPrivateOrReservedIpv6(address);
  return true; // not a parseable IP at all -- treat as unsafe
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;
  const [a, b] = octets;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments / benchmarking (192.0.0.0/24, 192.0.2.0/24 overlap handled by /24 catch below)
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast (224-239) + reserved/broadcast (240-255)
  return false;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true; // unspecified
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 -- validate the embedded IPv4 address, since this is
    // a documented way to smuggle a private IPv4 target past an IPv6-only check.
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) === 4 ? isPrivateOrReservedIpv4(mapped) : true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true; // link-local (fe80::/10)
  }
  return false;
}

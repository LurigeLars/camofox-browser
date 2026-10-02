import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const BLOCKED = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) BLOCKED.addSubnet(network, prefix, 'ipv4');

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) BLOCKED.addSubnet(network, prefix, 'ipv6');

function normalizedHost(value) {
  const host = String(value ?? '').trim().toLowerCase();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function mappedIpv4(address) {
  const value = normalizedHost(address);
  const dotted = value.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted && isIP(dotted[1]) === 4) return dotted[1];

  const hex = value.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

function blockedAddress(address) {
  const value = normalizedHost(address);
  const mapped = mappedIpv4(value);
  if (mapped) return BLOCKED.check(mapped, 'ipv4');

  const family = isIP(value);
  if (family === 4) return BLOCKED.check(value, 'ipv4');
  if (family === 6) return BLOCKED.check(value, 'ipv6');
  return true;
}

export async function publicTargetReason(raw, { lookupFn = lookup, retryDelayMs = 50 } = {}) {
  let url;
  try { url = new URL(String(raw)); } catch { return 'invalid URL'; }
  if (!['http:', 'https:'].includes(url.protocol)) return 'unsupported protocol';
  if (url.username || url.password) return 'URL credentials are not allowed';

  const host = normalizedHost(url.hostname);
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return 'private or local destination';

  const family = isIP(host);
  if (family) return blockedAddress(host) ? 'private or local destination' : null;

  let addresses;
  const delay = Math.max(0, Math.min(250, Number(retryDelayMs) || 0));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      addresses = await lookupFn(host, { all: true, verbatim: true });
      break;
    } catch (error) {
      if (String(error?.code || '') !== 'EAI_AGAIN' || attempt === 1) return 'destination could not be safely resolved';
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  if (!Array.isArray(addresses) || !addresses.length || addresses.some(item => blockedAddress(item.address))) {
    return 'private or local destination';
  }
  return null;
}

export async function installPublicNetworkGuard(context, options = {}) {
  await context.route('**/*', async route => {
    const request = route.request();
    const raw = request.url();

    let protocol;
    try { protocol = new URL(raw).protocol; } catch {
      return route.abort('blockedbyclient').catch(() => {});
    }

    if (protocol === 'data:' || protocol === 'blob:') return route.continue().catch(() => {});
    if (protocol !== 'http:' && protocol !== 'https:') return route.abort('blockedbyclient').catch(() => {});

    const reason = await publicTargetReason(raw, options);
    if (reason) return route.abort('blockedbyclient').catch(() => {});
    return route.continue().catch(() => {});
  });
}

import { jest, describe, expect, test } from '@jest/globals';
import { installPublicNetworkGuard, publicTargetReason } from '../../lib/network-safety.js';

const publicLookup = async () => [
  { address: '93.184.216.34', family: 4 },
  { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
];

describe('network safety', () => {
  test('allows public IPv4 and IPv6 targets', async () => {
    expect(await publicTargetReason('https://example.com/', { lookupFn: publicLookup, retryDelayMs: 0 })).toBeNull();
    expect(await publicTargetReason('https://[2606:4700::6812:1092]/')).toBeNull();
  });

  test('blocks local, private, link-local, ULA, mapped IPv4, and NAT64 ranges', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://192.168.1.1/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[fd00::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[64:ff9b::7f00:1]/',
    ]) {
      expect(await publicTargetReason(url)).toMatch(/private or local/);
    }
  });

  test('fails closed when any DNS answer is private', async () => {
    const mixedLookup = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00::1', family: 6 },
    ];
    expect(await publicTargetReason('https://example.com/', { lookupFn: mixedLookup, retryDelayMs: 0 }))
      .toMatch(/private or local/);
  });

  test('retries only one transient resolver failure', async () => {
    let calls = 0;
    const lookupFn = async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary');
        error.code = 'EAI_AGAIN';
        throw error;
      }
      return [{ address: '2606:4700::6812:1092', family: 6 }];
    };
    expect(await publicTargetReason('https://example.com/', { lookupFn, retryDelayMs: 0 })).toBeNull();
    expect(calls).toBe(2);
  });

  test('browser context guard aborts a private subrequest', async () => {
    let handler;
    const context = { route: jest.fn(async (_pattern, fn) => { handler = fn; }) };
    await installPublicNetworkGuard(context, { lookupFn: publicLookup, retryDelayMs: 0 });

    const route = {
      request: () => ({ url: () => 'http://[::1]/secret' }),
      abort: jest.fn(async () => {}),
      continue: jest.fn(async () => {}),
    };
    await handler(route);

    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(route.continue).not.toHaveBeenCalled();
  });

  test('browser context guard permits a public IPv6 subrequest', async () => {
    let handler;
    const context = { route: jest.fn(async (_pattern, fn) => { handler = fn; }) };
    await installPublicNetworkGuard(context, { lookupFn: publicLookup, retryDelayMs: 0 });

    const route = {
      request: () => ({ url: () => 'https://example.com/data.json' }),
      abort: jest.fn(async () => {}),
      continue: jest.fn(async () => {}),
    };
    await handler(route);

    expect(route.continue).toHaveBeenCalledTimes(1);
    expect(route.abort).not.toHaveBeenCalled();
  });
});

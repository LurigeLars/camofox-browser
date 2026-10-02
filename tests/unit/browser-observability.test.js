import { EventEmitter } from 'node:events';
import {
  attachTabObservability,
  readNetworkEvents,
  readConsoleEvents,
  sanitizeObservedText,
  sanitizeObservedUrl,
  OBSERVABILITY_LIMITS,
} from '../../lib/browser-observability.js';

class FakePage extends EventEmitter {}

function request(overrides = {}) {
  return {
    method: () => 'POST',
    resourceType: () => 'xhr',
    url: () => 'https://example.com/api?q=books&token=supersecret',
    failure: () => ({ errorText: 'Bearer abcdefghijklmnopqrstuvwxyz' }),
    ...overrides,
  };
}

describe('browser observability', () => {
  test('sanitizes sensitive URL query values while preserving useful routing data', () => {
    const value = sanitizeObservedUrl('https://user:pass@example.com/a?q=books&token=clear#frag');
    expect(value).toContain('https://example.com/a?');
    expect(value).toContain('q=books');
    expect(value).not.toContain('clear');
    expect(value).not.toContain('user:pass');
    expect(value).not.toContain('#frag');
    expect(value).toContain('[REDACTED]');
  });

  test('sanitizes bearer and JWT-shaped console text', () => {
    const value = sanitizeObservedText('Bearer abcdefghijklmnopqrstuvwxyz eyJabcdefghij.abcdefghij.abcdefghij');
    expect(value).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(value).not.toContain('eyJabcdefghij.abcdefghij.abcdefghij');
    expect(value).toContain('REDACTED');
  });

  test('captures metadata only for network events and bounded console text', () => {
    const page = new FakePage();
    const tabState = { page };
    attachTabObservability(tabState);

    const req = request();
    page.emit('request', req);
    page.emit('response', {
      request: () => req,
      status: () => 204,
      url: () => req.url(),
    });
    page.emit('requestfailed', req);
    page.emit('websocket', { url: () => 'wss://example.com/socket?session=secret' });
    page.emit('console', { type: () => 'log', text: () => 'Bearer abcdefghijklmnopqrstuvwxyz' });
    page.emit('pageerror', new Error('token=secret'));

    const network = readNetworkEvents(tabState, 200);
    expect(network).toHaveLength(4);
    expect(network[0]).toMatchObject({ phase: 'request', method: 'POST', resourceType: 'xhr' });
    expect(network[1]).toMatchObject({ phase: 'response', status: 204 });
    expect(JSON.stringify(network)).not.toContain('supersecret');
    expect(JSON.stringify(network)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(network)).not.toMatch(/headers|cookies|postData|body/i);

    const consoleEvents = readConsoleEvents(tabState, 200);
    expect(consoleEvents).toHaveLength(2);
    expect(JSON.stringify(consoleEvents)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(consoleEvents)).not.toContain('token=secret');
  });

  test('ring buffers and reads remain bounded', () => {
    const page = new FakePage();
    const tabState = { page };
    attachTabObservability(tabState);
    for (let i = 0; i < OBSERVABILITY_LIMITS.maxEvents + 20; i += 1) {
      page.emit('request', request({ url: () => `https://example.com/${i}` }));
    }
    expect(tabState.networkEvents).toHaveLength(OBSERVABILITY_LIMITS.maxEvents);
    expect(readNetworkEvents(tabState, 999)).toHaveLength(OBSERVABILITY_LIMITS.maxLimit);
    expect(readNetworkEvents(tabState, 2)).toHaveLength(2);
  });

  test('attaching twice does not duplicate listeners', () => {
    const page = new FakePage();
    const tabState = { page };
    attachTabObservability(tabState);
    attachTabObservability(tabState);
    page.emit('request', request());
    expect(tabState.networkEvents).toHaveLength(1);
  });
});

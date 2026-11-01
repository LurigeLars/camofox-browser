// Integration regression for reproducibly patched Camoufox beta.41 and Playwright 1.64.1.
// No external network requests; all navigation and route fulfilment are local.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { firefox } from 'playwright-core';

const exe = process.env.CAMOUFOX_EXECUTABLE;
assert.ok(exe, 'CAMOUFOX_EXECUTABLE must point to the verified test binary');
assert.equal((await import('playwright-core/package.json', {with: {type: 'json'}})).default.version, '1.64.1');

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/source') {
    res.end('<!doctype html><html><body><a id="blankLink" href="/target" target="_blank">Open</a></body></html>');
  } else if (req.url === '/target') {
    res.end('<!doctype html><html><body><h1>Target</h1></body></html>');
  } else {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await firefox.launch({executablePath: exe, headless: true});
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url + '/source');

  // Playwright 1.64 sends bypassServiceWorker on route creation.
  await page.route('**/probe', route => route.fulfill({status: 200, body: 'intercepted'}));
  const text = await page.evaluate(async () => (await fetch('/probe')).text());
  assert.equal(text, 'intercepted', 'Network route interception did not work');
  const storage = await context.storageState();
  assert.ok(Array.isArray(storage.cookies) && Array.isArray(storage.origins),
    'Playwright storage state did not complete');

  // Firefox 158 anti-detection parity: synthetic clicks are not trusted activation.
  const before = context.pages().length;
  await page.evaluate(() => document.querySelector('#blankLink').click());
  await page.waitForTimeout(350);
  assert.equal(context.pages().length, before, 'synthetic click unexpectedly bypassed popup blocker');
  const popupPromise = page.waitForEvent('popup', {timeout: 10000});
  await page.locator('#blankLink').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.ok(popup.url().endsWith('/target'), 'real Playwright click did not open target tab');
  console.log('PASS: Playwright 1.64.1 route + storageState + Firefox 158 popup parity');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

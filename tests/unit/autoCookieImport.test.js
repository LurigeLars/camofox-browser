import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { importBootstrapCookies, readCookieFile } from '../../lib/cookies.js';

describe('importBootstrapCookies', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-bootstrap-cookies-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns zero without calling addCookies when cookies.txt is missing', async () => {
    const context = { addCookies: jest.fn() };
    const logger = { warn: jest.fn() };

    const result = await importBootstrapCookies({ cookiesDir: tmpDir, context, logger });

    expect(result.imported).toBe(0);
    expect(result.source).toBe(null);
    expect(context.addCookies).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('imports all cookies from the default cookies.txt file', async () => {
    const cookieText = [
      '# Netscape HTTP Cookie File',
      '.example.com\tTRUE\t/\tTRUE\t1700000000\tlogged_in\tyes',
      'app.example.org\tFALSE\t/\tTRUE\t1700000000\t__cflb\tabc123',
    ].join('\n');
    await fs.writeFile(path.join(tmpDir, 'cookies.txt'), cookieText);

    const context = { addCookies: jest.fn(async () => {}) };

    const result = await importBootstrapCookies({ cookiesDir: tmpDir, context, logger: { warn: jest.fn() } });

    expect(result.imported).toBe(2);
    expect(result.source.endsWith(path.join(tmpDir, 'cookies.txt'))).toBe(true);
    expect(context.addCookies).toHaveBeenCalledTimes(1);
    expect(context.addCookies.mock.calls[0][0]).toEqual([
      expect.objectContaining({ domain: '.example.com', name: 'logged_in', value: 'yes' }),
      expect.objectContaining({ domain: 'app.example.org', name: '__cflb', value: 'abc123' }),
    ]);
  });

  test('logs and returns zero when addCookies throws', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'cookies.txt'),
      '.example.com\tTRUE\t/\tTRUE\t1700000000\tlogged_in\tyes\n'
    );

    const context = { addCookies: jest.fn(async () => { throw new Error('boom'); }) };
    const logger = { warn: jest.fn() };

    const result = await importBootstrapCookies({ cookiesDir: tmpDir, context, logger });

    expect(result.imported).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  test('reads a nested cookie file and an in-directory symlink', async () => {
    const nestedDir = path.join(tmpDir, 'nested');
    await fs.mkdir(nestedDir);
    await fs.writeFile(
      path.join(nestedDir, 'cookies.txt'),
      '.example.com\tTRUE\t/\tTRUE\t1700000000\tlogged_in\tyes\n'
    );
    await fs.symlink(path.join(nestedDir, 'cookies.txt'), path.join(tmpDir, 'cookies-link.txt'));

    await expect(readCookieFile({ cookiesDir: tmpDir, cookiesPath: 'nested/cookies.txt' }))
      .resolves.toEqual([expect.objectContaining({ name: 'logged_in', value: 'yes' })]);
    await expect(readCookieFile({ cookiesDir: tmpDir, cookiesPath: 'cookies-link.txt' }))
      .resolves.toEqual([expect.objectContaining({ name: 'logged_in', value: 'yes' })]);
  });

  test('enforces maxBytes on the same opened cookie file', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'cookies.txt'),
      '.example.com\tTRUE\t/\tTRUE\t1700000000\tlogged_in\tyes\n'
    );

    await expect(readCookieFile({
      cookiesDir: tmpDir,
      cookiesPath: 'cookies.txt',
      maxBytes: 8,
    })).rejects.toThrow('Cookie file too large');
  });

  test('rejects traversal, absolute paths, and symlinks that resolve outside the cookie directory', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-outside-cookies-'));
    const outsideFile = path.join(outsideDir, 'cookies.txt');
    await fs.writeFile(
      outsideFile,
      '.example.com\tTRUE\t/\tTRUE\t1700000000\toutside\tsecret\n'
    );
    await fs.symlink(outsideFile, path.join(tmpDir, 'escape.txt'));

    try {
      await expect(readCookieFile({ cookiesDir: tmpDir, cookiesPath: '../cookies.txt' }))
        .rejects.toThrow('relative path within the cookies directory');
      await expect(readCookieFile({ cookiesDir: tmpDir, cookiesPath: outsideFile }))
        .rejects.toThrow('relative path within the cookies directory');
      await expect(readCookieFile({ cookiesDir: tmpDir, cookiesPath: 'escape.txt' }))
        .rejects.toThrow('resolves outside the cookies directory');
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, jest, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { hasGoogleOrganicResults } from '../../lib/google-serp.js';

describe('Google snapshot escaping', () => {
  test('escapes backslashes before quotes in quoted snapshot fields', () => {
    const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
    expect(serverSource).toContain("function escapeSnapshotText(value)");
    expect(serverSource).toContain(".split('\\\\').join('\\\\\\\\')");
    expect(serverSource).toContain(String.raw`.split('"').join('\\"')`);
    expect(serverSource).toContain("escapeSnapshotText(document.title)");
    expect(serverSource).toContain("escapeSnapshotText(title)");
    expect(serverSource).toContain("escapeSnapshotText(text)");
  });
});

describe('hasGoogleOrganicResults', () => {
  test('returns immediately when an organic card is present', async () => {
    const page = {
      isClosed: jest.fn(() => false),
      evaluate: jest.fn().mockResolvedValue(true),
      waitForFunction: jest.fn(),
    };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(true);
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });

  test('waits for cards before classifying a Google shell as empty', async () => {
    const page = {
      isClosed: jest.fn(() => false),
      evaluate: jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false),
      waitForFunction: jest.fn().mockRejectedValue(new Error('timeout')),
    };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(false);
    expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });

  test('accepts organic cards that render during the wait', async () => {
    const page = {
      isClosed: jest.fn(() => false),
      evaluate: jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
    };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(true);
  });

  test('returns false for a closed page', async () => {
    const page = { isClosed: jest.fn(() => true) };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(false);
  });
});

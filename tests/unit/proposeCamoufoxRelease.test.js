import { describe, expect, test } from '@jest/globals';
import { prepareRelease } from '../../scripts/propose-camoufox-browser-release.mjs';

const a = 'a'.repeat(64);
const b = 'b'.repeat(64);
const c = 'c'.repeat(64);
const d = 'd'.repeat(64);
const old = {
  docker: [
    'ARG CAMOUFOX_VERSION=152.0.4',
    'ARG CAMOUFOX_RELEASE=beta.30',
    `ARG CAMOUFOX_SHA256_AMD64=${a}`,
    `ARG CAMOUFOX_SHA256_ARM64=${b}`,
  ].join('\n'),
  downloader: "export const BUNDLED_CAMOUFOX_RELEASE = '152.0.4-beta.30';",
  test: [
    "expect(dockerfile).toContain('ARG CAMOUFOX_VERSION=152.0.4');",
    "expect(dockerfile).toContain('ARG CAMOUFOX_RELEASE=beta.30');",
    `expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_AMD64=${a}');`,
    `expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_ARM64=${b}');`,
  ].join('\n'),
};

describe('Camoufox browser release candidate preparation', () => {
  const next = { version: '158.0.1', release: 'beta.41', amd64: c, arm64: d };

  test('changes both exact SHA pins and matching tests, never a floating release', () => {
    const value = prepareRelease(next, old);
    expect(value.next).toBe('158.0.1-beta.41');
    expect(value.docker).toContain(`ARG CAMOUFOX_SHA256_AMD64=${c}`);
    expect(value.docker).toContain(`ARG CAMOUFOX_SHA256_ARM64=${d}`);
    expect(value.test).toContain(`ARG CAMOUFOX_SHA256_AMD64=${c}`);
    expect(value.downloader).toContain("BUNDLED_CAMOUFOX_RELEASE = '158.0.1-beta.41'");
    expect(prepareRelease({ ...next, version: '152.0.4', release: 'beta.30' }, old)).toBeNull();
  });

  test('fails closed on a missing digest or mismatched reviewed downloader', () => {
    expect(() => prepareRelease({ ...next, amd64: 'oops' }, old)).toThrow(/Invalid amd64/);
    expect(() => prepareRelease(next, { ...old, downloader: "export const BUNDLED_CAMOUFOX_RELEASE = 'master';" })).toThrow(/differs/);
  });

  test('fails closed on unrecognized or duplicated reviewed pin formats', () => {
    expect(() => prepareRelease(next, { ...old, docker: old.docker.replace('beta.30', 'latest') })).toThrow(/not found/);
    expect(() => prepareRelease(next, { ...old, docker: old.docker + '\nARG CAMOUFOX_VERSION=152.0.4' })).toThrow(/expected one/);
  });
});

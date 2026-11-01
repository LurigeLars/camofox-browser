import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

describe('Docker Camoufox release pin', () => {
  test('uses the reviewed compatible beta.30 assets with per-architecture digests', () => {
    expect(dockerfile).toContain('ARG CAMOUFOX_VERSION=152.0.4');
    expect(dockerfile).toContain('ARG CAMOUFOX_RELEASE=beta.30');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_AMD64=5720d45b894ce1770543de024c6f10d514b38be560fa2dc3226b3d8586caf672');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_ARM64=60447260af8bebdb0ec3f2aa72f687b879e5598367303de2e3fdbc7a5be8c124');
    expect(dockerfile).toContain('sha256sum -c -');
  });
});

describe('Playwright protocol compatibility', () => {
  test('retains compatible Playwright 1.62.1 instead of resolving 1.64+', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    expect(manifest.dependencies['camoufox-js']).toBe('0.11.5');
    expect(manifest.dependencies['playwright-core']).toBe('1.62.1');
    expect(lock.packages[''].dependencies['playwright-core']).toBe('1.62.1');
    expect(lock.packages['node_modules/playwright-core'].version).toBe('1.62.1');
  });
});

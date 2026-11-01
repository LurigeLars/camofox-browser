import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

describe('Docker Camoufox release pin', () => {
  test('uses verified candidate beta.41 assets with per-architecture digests', () => {
    expect(dockerfile).toContain('ARG CAMOUFOX_VERSION=158.0.1');
    expect(dockerfile).toContain('ARG CAMOUFOX_RELEASE=beta.41');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_AMD64=3f2eb1d0451fa58e45e43e55f5e6181565069791ae60c0574f0ceb1f01341c33');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_ARM64=60e25f6eb95e13d9ec655bc02913d51057e669cb31542e6ace9d2190ab5380af');
    expect(dockerfile).toContain('sha256sum -c -');
    const dockerfileCi = readFileSync(path.join(root, 'Dockerfile.ci'), 'utf8');
    for (const field of ['CAMOUFOX_VERSION', 'CAMOUFOX_RELEASE', 'CAMOUFOX_SHA256_AMD64', 'CAMOUFOX_SHA256_ARM64']) {
      expect(dockerfileCi).toContain(dockerfile.match(new RegExp(`ARG ${field}=[^\\n]+`))[0]);
    }
    expect(dockerfileCi).toContain('sha256sum -c -');
  });
});

describe('Playwright protocol compatibility', () => {
  test('verifies tested Playwright 1.63.0 below unsupported 1.64+', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    expect(manifest.dependencies['camoufox-js']).toBe('0.11.5');
    expect(manifest.dependencies['playwright-core']).toBe('1.63.0');
    expect(lock.packages[''].dependencies['playwright-core']).toBe('1.63.0');
    expect(lock.packages['node_modules/playwright-core'].version).toBe('1.63.0');
  });
});

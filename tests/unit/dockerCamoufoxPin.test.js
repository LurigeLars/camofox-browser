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
    for (const file of [dockerfile, dockerfileCi]) {
      expect(file).toContain('CAMOUFOX_PATCHED_OMNI_SHA256_AMD64=2bad253389292f3009f669401eb8bc3abd615fb7c4e7d9619865f6c75b5c50fa');
      expect(file).toContain('CAMOUFOX_PATCHED_OMNI_SHA256_ARM64=5c41978fcb9b568195017f94036fc18ccc4c205c87d42b3b026ea845ed6f9836');
      expect(file).toContain('patch_juggler_976.py');
      expect(file).toContain('--expect-sha256');
    }
  });
});

describe('Playwright protocol compatibility', () => {
  test('verifies exact Playwright 1.64.1 with checked Juggler build', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    expect(manifest.dependencies['camoufox-js']).toBe('0.11.5');
    expect(manifest.dependencies['playwright-core']).toBe('1.64.1');
    expect(lock.packages[''].dependencies['playwright-core']).toBe('1.64.1');
    expect(lock.packages['node_modules/playwright-core'].version).toBe('1.64.1');
  });
});

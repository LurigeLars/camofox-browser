import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

describe('Docker Camoufox release pin', () => {
  test('uses verified candidate beta.41 assets with per-architecture digests', () => {
    expect(dockerfile).toContain('ARG CAMOUFOX_VERSION=159.0');
    expect(dockerfile).toContain('ARG CAMOUFOX_RELEASE=beta.43');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_AMD64=9315ff337b730b697a17298b37575945036a2607b888759e900bc31f7f910cb2');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_ARM64=4b57cba5ae88388c2440200daf2257be240cf1eac2c2b3adff1e2ecda1900c16');
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

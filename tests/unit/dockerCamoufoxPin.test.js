import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

describe('Docker Camoufox release pin', () => {
  test('uses exact candidate beta.41 assets with per-architecture digests', () => {
    expect(dockerfile).toContain('ARG CAMOUFOX_VERSION=158.0.1');
    expect(dockerfile).toContain('ARG CAMOUFOX_RELEASE=beta.41');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_AMD64=3f2eb1d0451fa58e45e43e55f5e6181565069791ae60c0574f0ceb1f01341c33');
    expect(dockerfile).toContain('ARG CAMOUFOX_SHA256_ARM64=60e25f6eb95e13d9ec655bc02913d51057e669cb31542e6ace9d2190ab5380af');
    expect(dockerfile).toContain('sha256sum -c -');
  });
});

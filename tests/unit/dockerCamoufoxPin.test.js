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

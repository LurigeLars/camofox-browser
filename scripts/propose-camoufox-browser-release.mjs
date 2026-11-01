#!/usr/bin/env node
// Produce a candidate diff ONLY. Never merge, install browser binaries or deploy.
import { readFileSync, writeFileSync } from 'node:fs';

function replaceExactlyOnce(source, needle, replacement, file) {
  const occurrences = source.split(needle).length - 1;
  if (occurrences !== 1) throw new Error(`${file}: expected one reviewed pin, found ${occurrences}`);
  return source.replace(needle, replacement);
}

export function prepareRelease({ version, release, amd64, arm64 }, files) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Invalid upstream browser version');
  if (!/^beta\.\d+$/.test(release)) throw new Error('Invalid upstream browser release');
  for (const [arch, digest] of Object.entries({ amd64, arm64 })) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid ${arch} upstream asset SHA256`);
  }
  const oldVersion = files.docker.match(/^ARG CAMOUFOX_VERSION=([\d.]+)$/m)?.[1];
  const oldRelease = files.docker.match(/^ARG CAMOUFOX_RELEASE=(beta\.\d+)$/m)?.[1];
  const oldAmd64 = files.docker.match(/^ARG CAMOUFOX_SHA256_AMD64=([a-f0-9]{64})$/m)?.[1];
  const oldArm64 = files.docker.match(/^ARG CAMOUFOX_SHA256_ARM64=([a-f0-9]{64})$/m)?.[1];
  if (![oldVersion, oldRelease, oldAmd64, oldArm64].every(Boolean)) {
    throw new Error('Existing reviewed browser digest lines not found');
  }
  const oldCombined = `${oldVersion}-${oldRelease}`;
  const newCombined = `${version}-${release}`;
  if (newCombined === oldCombined) return null;
  if (!files.downloader.includes(`BUNDLED_CAMOUFOX_RELEASE = '${oldCombined}'`)) {
    throw new Error('Downloader release differs from reviewed Docker pin');
  }
  let docker = files.docker;
  let test = files.test;
  for (const [key, oldValue, newValue] of [
    ['CAMOUFOX_VERSION', oldVersion, version],
    ['CAMOUFOX_RELEASE', oldRelease, release],
    ['CAMOUFOX_SHA256_AMD64', oldAmd64, amd64],
    ['CAMOUFOX_SHA256_ARM64', oldArm64, arm64],
  ]) {
    docker = replaceExactlyOnce(docker, `ARG ${key}=${oldValue}`, `ARG ${key}=${newValue}`, 'Dockerfile');
    test = replaceExactlyOnce(test, `ARG ${key}=${oldValue}`, `ARG ${key}=${newValue}`, 'dockerCamoufoxPin.test.js');
  }
  const downloader = replaceExactlyOnce(
    files.downloader,
    `BUNDLED_CAMOUFOX_RELEASE = '${oldCombined}'`,
    `BUNDLED_CAMOUFOX_RELEASE = '${newCombined}'`,
    'camoufox-download.js',
  );
  return { docker, downloader, test, previous: oldCombined, next: newCombined };
}

function main() {
  const [version, release, amd64, arm64] = process.argv.slice(2);
  if (![version, release, amd64, arm64].every(Boolean)) {
    throw new Error('Usage: propose-camoufox-browser-release.mjs <version> <release> <amd64-sha256> <arm64-sha256>');
  }
  const paths = {
    docker: 'Dockerfile',
    downloader: 'lib/camoufox-download.js',
    test: 'tests/unit/dockerCamoufoxPin.test.js',
  };
  const inputs = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, readFileSync(file, 'utf8')]));
  const proposal = prepareRelease({ version, release, amd64, arm64 }, inputs);
  if (proposal === null) {
    console.log('Current reviewed browser release matches upstream candidate');
    return;
  }
  for (const [key, file] of Object.entries(paths)) writeFileSync(file, proposal[key]);
  console.log(`Prepared reviewed SHA256 browser release ${proposal.previous} -> ${proposal.next}`);
}

if (process.argv[1]?.endsWith('propose-camoufox-browser-release.mjs')) main();

import { DefaultAddons, maybeDownloadAddons } from 'camoufox-js/dist/addons.js';
import { ALLOW_GEOIP, downloadMMDB } from 'camoufox-js/dist/locale.js';
import { CamoufoxFetcher } from 'camoufox-js/dist/pkgman.js';
import { pathToFileURL } from 'node:url';

// Tested modern browser candidate. Its restored Firefox popup blocker intentionally
// blocks scripted target=_blank clicks; the normal Playwright click opens tabs.
// Keep camoufox-js@0.11.5 until the newer wrapper supports beta.41.
export const BUNDLED_CAMOUFOX_RELEASE = '158.0.1-beta.41';

export class CompatibleCamoufoxFetcher extends CamoufoxFetcher {
  checkAsset(asset) {
    if (!asset.name.startsWith(`camoufox-${BUNDLED_CAMOUFOX_RELEASE}-`)) return null;
    return super.checkAsset(asset);
  }
}

// camoufox-js does not currently expose its fetch command from the public
// entrypoint. Keep its pinned version in package.json while using the same
// downloader implementation as `npx camoufox-js fetch`, without spawning a
// shell or a second Node process during this package's lifecycle hook.
export async function downloadBundledCamoufox({
  createFetcher = () => new CompatibleCamoufoxFetcher(),
  shouldDownloadGeoIp = ALLOW_GEOIP,
  downloadGeoIp = downloadMMDB,
  downloadAddons = maybeDownloadAddons,
} = {}) {
  const fetcher = createFetcher();
  await fetcher.install();

  if (shouldDownloadGeoIp) downloadGeoIp();
  await downloadAddons(DefaultAddons);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  downloadBundledCamoufox().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

import fs from 'fs';
import path from 'path';
import { getSearchFallbacks, isSearchEngineResultUrl } from '../../lib/search-fallbacks.js';

const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');

describe('search fallbacks', () => {
  test('falls back from the Google macro to DuckDuckGo before Bing', () => {
    expect(getSearchFallbacks('@google_search', 'weather today')).toEqual([
      {
        engine: 'duckduckgo',
        url: 'https://duckduckgo.com/?q=weather%20today',
      },
      {
        engine: 'bing',
        url: 'https://www.bing.com/search?q=weather%20today',
      },
    ]);
  });

  test('does not alter explicit URLs or non-Google macros', () => {
    expect(getSearchFallbacks(null, 'weather today')).toEqual([]);
    expect(getSearchFallbacks('@youtube_search', 'weather today')).toEqual([]);
  });

  test('encodes the fallback query', () => {
    expect(getSearchFallbacks('@google_search', 'C++ & Rust')[0].url)
      .toBe('https://duckduckgo.com/?q=C%2B%2B%20%26%20Rust');
  });

  test('validates fallback hosts structurally instead of by substring', () => {
    expect(isSearchEngineResultUrl('https://duckduckgo.com/?q=x', 'duckduckgo')).toBe(true);
    expect(isSearchEngineResultUrl('https://html.duckduckgo.com/html/?q=x', 'duckduckgo')).toBe(true);
    expect(isSearchEngineResultUrl('https://www.bing.com/search?q=x', 'bing')).toBe(true);
    expect(isSearchEngineResultUrl('https://duckduckgo.com.evil.example/?q=x', 'duckduckgo')).toBe(false);
    expect(isSearchEngineResultUrl('https://evilduckduckgo.com/?q=x', 'duckduckgo')).toBe(false);
    expect(isSearchEngineResultUrl('https://bing.com.evil.example/search?q=x', 'bing')).toBe(false);
    expect(isSearchEngineResultUrl('not a url', 'bing')).toBe(false);
  });

  test('waits for organic Google result cards before falling back', () => {
    expect(serverSource).toContain("import { hasGoogleOrganicResults } from './lib/google-serp.js';");
    expect(serverSource).toContain('if (await hasGoogleOrganicResults(tabState.page)) {');
    expect(serverSource).toContain("log('warn', 'google search returned no organic results; using fallback'");
    expect(serverSource).toContain('googleResultsAvailable: false,');
    expect(serverSource).toContain('searchFallbacksExhausted: searchFallbacks.length > 0,');
  });

  test('keeps the Google fallback path for upstream 5xx responses', () => {
    expect(serverSource).toContain("isGoogleSearch && navErr.code === 'destination_unavailable' && await navigateSearchFallback()");
    expect(serverSource).toContain('if (response && response.status() >= 500) {\n              tabState.lastSnapshot = null;\n              throw Object.assign(');
  });

  test('navigation reports the engine used after Google fallback', () => {
    expect(serverSource).toContain("searchFallback = { searchEngine: candidate.engine, fallbackFrom: 'google' }");
    expect(serverSource).toContain('searchFallbackAttempted: searchFallbacks.length > 0');
  });
});

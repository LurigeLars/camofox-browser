const GOOGLE_SEARCH_MACRO = '@google_search';

export function getSearchFallbacks(macro, query) {
  if (macro !== GOOGLE_SEARCH_MACRO) return [];
  const encodedQuery = encodeURIComponent(query || '');
  return [
    {
      engine: 'duckduckgo',
      url: `https://duckduckgo.com/?q=${encodedQuery}`,
    },
    {
      engine: 'bing',
      url: `https://www.bing.com/search?q=${encodedQuery}`,
    },
  ];
}


const SEARCH_ENGINE_HOSTS = Object.freeze({
  duckduckgo: 'duckduckgo.com',
  bing: 'bing.com',
});

export function isSearchEngineResultUrl(rawUrl, engine) {
  const expectedHost = SEARCH_ENGINE_HOSTS[engine];
  if (!expectedHost || typeof rawUrl !== 'string') return false;
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return hostname === expectedHost || hostname.endsWith('.' + expectedHost);
  } catch {
    return false;
  }
}

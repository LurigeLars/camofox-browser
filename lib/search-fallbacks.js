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

function hostnameMatches(hostname, expected) {
  const normalized = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return normalized === expected || normalized.endsWith(`.${expected}`);
}

export function isExpectedSearchFallbackUrl(url, engine) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  if (engine === 'duckduckgo') return hostnameMatches(hostname, 'duckduckgo.com');
  if (engine === 'bing') return hostnameMatches(hostname, 'bing.com');
  return false;
}

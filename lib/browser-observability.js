const MAX_EVENTS = 500;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MAX_TEXT_CHARS = 4000;
const SENSITIVE_QUERY_KEY = /^(?:access[_-]?token|api[_-]?key|auth|authorization|code|credential|jwt|key|password|secret|session|sig|signature|token)$/i;

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function pushBounded(list, item) {
  list.push(item);
  if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
}

export function sanitizeObservedText(value, maxChars = MAX_TEXT_CHARS) {
  let text = String(value ?? '');
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
    .replace(/([?&](?:access[_-]?token|api[_-]?key|auth|authorization|code|credential|jwt|key|password|secret|session|sig|signature|token)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/\b((?:access[_-]?token|api[_-]?key|auth|authorization|credential|jwt|password|secret|session|sig|signature|token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  if (text.length > maxChars) text = `${text.slice(0, Math.max(0, maxChars - 3))}...`;
  return text;
}

export function sanitizeObservedUrl(raw) {
  try {
    const url = new URL(String(raw));
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return sanitizeObservedText(url.toString(), 4096);
  } catch {
    return '[invalid-url]';
  }
}

function networkEvent(tabState, entry) {
  pushBounded(tabState.networkEvents, {
    seq: ++tabState.networkEventSequence,
    time: new Date().toISOString(),
    ...entry,
  });
}

function consoleEvent(tabState, entry) {
  pushBounded(tabState.consoleEvents, {
    seq: ++tabState.consoleEventSequence,
    time: new Date().toISOString(),
    ...entry,
  });
}

export function attachTabObservability(tabState) {
  if (!tabState || tabState._observabilityAttached) return tabState;
  const page = tabState.page;
  tabState.networkEvents ??= [];
  tabState.networkEventSequence ??= 0;
  tabState.consoleEvents ??= [];
  tabState.consoleEventSequence ??= 0;
  tabState._observabilityAttached = true;

  page?.on?.('request', request => {
    networkEvent(tabState, {
      phase: 'request',
      method: sanitizeObservedText(request.method?.() ?? '', 16),
      resourceType: sanitizeObservedText(request.resourceType?.() ?? '', 64),
      url: sanitizeObservedUrl(request.url?.()),
    });
  });

  page?.on?.('response', response => {
    const request = response.request?.();
    networkEvent(tabState, {
      phase: 'response',
      method: sanitizeObservedText(request?.method?.() ?? '', 16),
      resourceType: sanitizeObservedText(request?.resourceType?.() ?? '', 64),
      status: Number.isInteger(response.status?.()) ? response.status() : null,
      url: sanitizeObservedUrl(response.url?.()),
    });
  });

  page?.on?.('requestfailed', request => {
    networkEvent(tabState, {
      phase: 'failed',
      method: sanitizeObservedText(request.method?.() ?? '', 16),
      resourceType: sanitizeObservedText(request.resourceType?.() ?? '', 64),
      url: sanitizeObservedUrl(request.url?.()),
      failure: sanitizeObservedText(request.failure?.()?.errorText ?? 'request failed', 500),
    });
  });

  page?.on?.('websocket', socket => {
    networkEvent(tabState, {
      phase: 'websocket',
      method: 'GET',
      resourceType: 'websocket',
      url: sanitizeObservedUrl(socket.url?.()),
    });
  });

  page?.on?.('console', message => {
    consoleEvent(tabState, {
      kind: 'console',
      level: sanitizeObservedText(message.type?.() ?? 'log', 32),
      text: sanitizeObservedText(message.text?.() ?? '', MAX_TEXT_CHARS),
    });
  });

  page?.on?.('pageerror', error => {
    consoleEvent(tabState, {
      kind: 'pageerror',
      level: 'error',
      text: sanitizeObservedText(error?.message ?? error, MAX_TEXT_CHARS),
    });
  });

  return tabState;
}

export function readNetworkEvents(tabState, limit) {
  return (tabState?.networkEvents ?? []).slice(-boundedLimit(limit));
}

export function readConsoleEvents(tabState, limit) {
  return (tabState?.consoleEvents ?? []).slice(-boundedLimit(limit));
}

export const OBSERVABILITY_LIMITS = Object.freeze({
  maxEvents: MAX_EVENTS,
  defaultLimit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
});

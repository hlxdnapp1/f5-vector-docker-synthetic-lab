/*
 * R6C candidate: pure, offline, synthetic route classifier.
 * NOT a Docker adapter, HTTP gateway, authorization server or production code.
 * No network, socket, filesystem, subprocess, environment or secrets access.
 * The only container identity recognized is the artificial 64x "a" fixture ID.
 */
const SYNTHETIC_ALLOWED_ID = 'a'.repeat(64);
const SAFE_BOOLEAN = new Set(['true', 'false', '1', '0']);
const LOG_BOOLEAN_KEYS = new Set(['stdout', 'stderr', 'follow', 'timestamps']);
const LOG_ALLOWED_KEYS = new Set([...LOG_BOOLEAN_KEYS, 'since', 'until', 'tail']);
const EVENT_KEYS = new Set(['since', 'until', 'filters']);
const LIST_KEYS = new Set(['all', 'filters', 'size']);

const deny = category => Object.freeze({ allowed: false, category, tail: null });
const allow = (category, tail = null) => Object.freeze({ allowed: true, category, tail });
const digits = value => /^(?:0|[1-9][0-9]{0,10})$/.test(value);
const isJsonObject = value => {
  try {
    const obj = JSON.parse(value);
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
  } catch {
    return false;
  }
};

/**
 * Classifies requests without contacting or constructing any Docker endpoint.
 * @param {{method:string,target:string}} input Synthetic request shape.
 * @returns {{allowed:boolean,category:string,tail:number|null}} Finite redacted verdict.
 */
export function classifySyntheticDockerRead(input) {
  if (!input || input.method !== 'GET') return deny('METHOD_DENIED');
  const target = input.target;
  if (typeof target !== 'string' || target.length === 0 || target.length > 2048 ||
      !target.startsWith('/') || target.startsWith('//') || /[\x00-\x20\x7f\\#]/.test(target)) {
    return deny('TARGET_DENIED');
  }
  const queryStart = target.indexOf('?');
  const rawPath = queryStart < 0 ? target : target.slice(0, queryStart);
  const rawQuery = queryStart < 0 ? '' : target.slice(queryStart + 1);
  if (rawPath.includes('%') || rawPath.includes('..') || rawPath.includes('//') ||
      target.split('?').length > 2) return deny('TARGET_DENIED');
  const version = rawPath.match(/^\/v1\.(\d\d)(\/.*)$/);
  if (rawPath.startsWith('/v1.') && (!version || Number(version[1]) < 40 ||
      Number(version[1]) > 59)) return deny('API_VERSION_DENIED');
  const route = version ? version[2] : rawPath;
  if (/^\/v(?:\d|\.)/.test(route) && !version) return deny('API_VERSION_DENIED');
  let params;
  try { params = new URLSearchParams(rawQuery); } catch { return deny('QUERY_DENIED'); }
  const keys = [...params.keys()];
  if (keys.length !== new Set(keys).size) return deny('DUPLICATE_QUERY_DENIED');
  const hasOnly = allowed => keys.every(key => allowed.has(key));

  if (route === '/_ping' || route === '/version') {
    return keys.length === 0 ? allow(route === '/_ping' ? 'PING' : 'VERSION') :
      deny('QUERY_DENIED');
  }
  if (route === '/containers/json') {
    if (!hasOnly(LIST_KEYS) || params.get('all') !== 'false' ||
        (params.has('size') && params.get('size') !== 'false') ||
        !params.has('filters') || !isJsonObject(params.get('filters'))) {
      return deny('LIST_SCOPE_DENIED');
    }
    return allow('CONTAINER_LIST');
  }
  if (route === '/events') {
    if (!hasOnly(EVENT_KEYS) ||
        ['since', 'until'].some(key => params.has(key) && !digits(params.get(key))) ||
        (params.has('filters') && !isJsonObject(params.get('filters')))) {
      return deny('EVENT_SCOPE_DENIED');
    }
    return allow('EVENTS');
  }
  const match = route.match(/^\/containers\/([a-f0-9]{64})\/(json|logs)$/);
  if (!match) return deny('ROUTE_DENIED');
  if (match[1] !== SYNTHETIC_ALLOWED_ID) return deny('SYNTHETIC_ID_DENIED');
  if (match[2] === 'json') return keys.length === 0 ? allow('INSPECT') :
    deny('QUERY_DENIED');

  if (!hasOnly(LOG_ALLOWED_KEYS) ||
      keys.some(key => LOG_BOOLEAN_KEYS.has(key) && !SAFE_BOOLEAN.has(params.get(key))) ||
      ['since', 'until'].some(key => params.has(key) && !digits(params.get(key)))) {
    return deny('LOG_SCOPE_DENIED');
  }
  const requestedTail = params.get('tail');
  if (requestedTail !== null && requestedTail !== 'all' && !digits(requestedTail)) {
    return deny('LOG_TAIL_DENIED');
  }
  const tail = requestedTail === null || requestedTail === 'all' ?
    100 : Number(requestedTail);
  if (!Number.isSafeInteger(tail) || tail > 100) return deny('LOG_TAIL_DENIED');
  return allow('LOGS', tail);
}

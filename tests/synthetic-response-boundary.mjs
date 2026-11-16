/*
 * PUBLIC R6D model: offline and synthetic-only request + response projector.
 * It never contacts, forwards, proxies or opens a connection to Docker.
 * All container identities and event/log content are artificial fixtures.
 * No network I/O, process access, filesystem access or environment reads.
 * NOT a real Docker security proxy or suitable for deployment.
 */
import { classifySyntheticDockerRead } from './synthetic-read-policy.mjs';

const ALLOWED = 'a'.repeat(64);
const OUTSIDER = 'b'.repeat(64);
const MARKER = 'SYNTHETIC_VECTOR_R6B_ONLY';
const MAX_JSON_BYTES = 8192;
const MAX_LOG_BYTES = 16384;
const MAX_LOG_FRAME_BYTES = 512;
const MAX_LOG_FRAMES = 100;
const MAX_EVENTS = 16;
const EVENTS = new Set(['start', 'die', 'pause', 'unpause']);
const decoder = new TextDecoder('utf-8', { fatal: true });

function denied(category) {
  return { allowed: false, category, output: null };
}
function passed(category, output) {
  return { allowed: true, category, output };
}
function parseSmallJson(payload) {
  if (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > MAX_JSON_BYTES ||
      payload.length === 0) return null;
  try { return JSON.parse(payload); } catch { return null; }
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function knownId(value) {
  return value === ALLOWED || value === OUTSIDER;
}
function sanitizeList(payload) {
  const parsed = parseSmallJson(payload);
  if (!Array.isArray(parsed) || parsed.length > 8) return denied('LIST_SHAPE_DENIED');
  const safe = [];
  for (const entry of parsed) {
    if (!object(entry) || !knownId(entry.Id)) return denied('LIST_ID_DENIED');
    if (entry.Id === ALLOWED) {
      safe.push({ Id: ALLOWED, Names: ['/synthetic-allowed'],
        Image: 'synthetic/review-only', State: 'running' });
    }
  }
  return passed('SAFE_CONTAINER_LIST', safe);
}
function sanitizeInspect(payload) {
  const parsed = parseSmallJson(payload);
  if (!object(parsed) || parsed.Id !== ALLOWED ||
      parsed.Name !== '/synthetic-allowed') return denied('INSPECT_ID_DENIED');
  return passed('SAFE_INSPECT', {
    Id: ALLOWED, Name: '/synthetic-allowed',
    Config: { Image: 'synthetic/review-only', Labels: {} },
    State: { Status: 'running' }
  });
}
function sanitizeEvents(payload) {
  if (typeof payload !== 'string' ||
      Buffer.byteLength(payload, 'utf8') > MAX_JSON_BYTES) return denied('EVENT_BODY_DENIED');
  if (!payload || !payload.endsWith('\n')) return denied('EVENT_STREAM_DENIED');
  const lines = payload.slice(0, -1).split('\n');
  if (lines.length > MAX_EVENTS || lines.some(line => !line)) return denied('EVENT_COUNT_DENIED');
  const safe = [];
  for (const line of lines) {
    const event = parseSmallJson(line);
    if (!object(event) || event.Type !== 'container' ||
        !EVENTS.has(event.Action) || !object(event.Actor) ||
        !knownId(event.Actor.ID)) return denied('EVENT_ID_DENIED');
    if (event.Actor.ID === ALLOWED) {
      safe.push({ Type: 'container', Action: event.Action,
        Actor: { ID: ALLOWED } });
    }
  }
  return passed('SAFE_EVENTS', safe);
}
function sanitizeLogs(payload, requestedTail) {
  if (!Buffer.isBuffer(payload) || payload.length === 0 ||
      payload.length > MAX_LOG_BYTES) return denied('LOG_BODY_DENIED');
  let offset = 0;
  const safeFrames = [];
  while (offset < payload.length) {
    if (safeFrames.length >= MAX_LOG_FRAMES ||
        offset + 8 > payload.length) return denied('LOG_FRAME_DENIED');
    const channel = payload[offset];
    if (![1,2].includes(channel) ||
        payload[offset+1] !== 0 || payload[offset+2] !== 0 ||
        payload[offset+3] !== 0) return denied('LOG_HEADER_DENIED');
    const length = payload.readUInt32BE(offset + 4);
    if (length < 1 || length > MAX_LOG_FRAME_BYTES ||
        offset + 8 + length > payload.length) return denied('LOG_LENGTH_DENIED');
    let line;
    try { line = decoder.decode(payload.subarray(offset + 8, offset + 8 + length)); }
    catch { return denied('LOG_ENCODING_DENIED'); }
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) SYNTHETIC_VECTOR_R6B_ONLY\n$/.exec(line);
    if (!match || !Number.isFinite(Date.parse(match[1]))) return denied('LOG_MARKER_DENIED');
    const text = Buffer.from(match[1] + ' ' + MARKER + '\n', 'utf8');
    const header = Buffer.alloc(8);
    header[0] = channel;
    header.writeUInt32BE(text.length, 4);
    safeFrames.push(Buffer.concat([header, text]));
    offset += 8 + length;
  }
  if (safeFrames.length > requestedTail) return denied('LOG_TAIL_LIMIT_DENIED');
  return passed('SAFE_LOGS', Buffer.concat(safeFrames));
}

/**
 * Model of a synthetic response boundary: checks request first, then projects
 * only artificial data. Neither HTTP transport nor Docker daemon code exists.
 * Output is finite and never echoes denied input.
 */
export function filterSyntheticDockerResponse(request, payload) {
  const verdict = classifySyntheticDockerRead(request);
  if (!verdict.allowed) return denied('REQUEST_DENIED');
  switch (verdict.category) {
    case 'PING':
      return payload === 'OK' ? passed('SAFE_PING', 'OK') : denied('PING_BODY_DENIED');
    case 'VERSION': {
      const version = parseSmallJson(payload);
      if (!object(version) || typeof version.ApiVersion !== 'string' ||
          !/^1\.(?:4\d|5\d)$/.test(version.ApiVersion)) return denied('VERSION_BODY_DENIED');
      return passed('SAFE_VERSION', { ApiVersion: version.ApiVersion });
    }
    case 'CONTAINER_LIST': return sanitizeList(payload);
    case 'INSPECT': return sanitizeInspect(payload);
    case 'EVENTS': return sanitizeEvents(payload);
    case 'LOGS': return sanitizeLogs(payload, verdict.tail);
    default: return denied('ROUTE_DENIED');
  }
}

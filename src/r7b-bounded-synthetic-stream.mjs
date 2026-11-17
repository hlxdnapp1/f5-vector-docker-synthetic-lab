/* R7B-G1B: offline-only Docker protocol boundary. No daemon, sockets or transport.
 * Accept ONLY a fixed public synthetic identity / marker. Never relay raw logs.
 * A push is atomic: all complete records in that chunk validate before exposure.
 * Earlier, already-taken safe records cannot be rolled back on later errors.
 */

const ALIAS = 'a'.repeat(64);
const NAME = 'r7b-synthetic-fixture';
const MARKER = 'R7B_PUBLIC_SYNTHETIC_ONLY';
const ACTIONS = new Set(['start', 'die']);
const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true });
const MAX_CHUNK = 2048;
const MAX_RECORD = 768;
const MAX_FRAME_PAYLOAD = 512;
const MAX_TOTAL_BYTES = 65536;
const MAX_TOTAL_RECORDS = 100;
const MAX_PENDING = 8;
const MAX_CARRY = MAX_RECORD + 8;
const HEADER = 8;

function fail(code) { throw new Error(`R7B_BLOCKED_${code}`); }
function exact(o, keys) {
  return o !== null && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
}
function encodeEvent(raw) {
  let event;
  try { event = JSON.parse(FATAL_UTF8.decode(raw)); }
  catch { fail('EVENT_JSON_OR_UTF8'); }
  if (!exact(event, ['Type', 'Action', 'Actor', 'time', 'timeNano']) ||
      event.Type !== 'container' || !ACTIONS.has(event.Action) ||
      !exact(event.Actor, ['ID', 'Attributes']) || event.Actor.ID !== ALIAS ||
      !exact(event.Actor.Attributes, ['name']) || event.Actor.Attributes.name !== NAME ||
      !Number.isSafeInteger(event.time) || event.time < 1 || event.time > 4102444800 ||
      typeof event.timeNano !== 'string' || !/^\d{10,20}$/.test(event.timeNano) ||
      BigInt(event.timeNano) / 1000000000n !== BigInt(event.time)) fail('EVENT_IDENTITY');
  // Deliberately reconstruct from allowlisted keys; raw JSON is never forwarded.
  return Buffer.from(JSON.stringify({Type:'container', Action:event.Action,
    Actor:{ID:ALIAS, Attributes:{name:NAME}}, time:event.time,
    timeNano:event.timeNano}) + '\n');
}
function encodeLog(channel, raw) {
  let text;
  try { text = FATAL_UTF8.decode(raw); }
  catch { fail('LOG_UTF8'); }
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z) R7B_PUBLIC_SYNTHETIC_ONLY\n$/.exec(text);
  const millis = match ? Date.parse(match[1]) : NaN;
  if (!Number.isFinite(millis) ||
      new Date(millis).toISOString().slice(0, 19) !== match[1].slice(0, 19)) fail('LOG_MARKER_OR_TIME');
  const payload = Buffer.from(match[1] + ' ' + MARKER + '\n');
  const header = Buffer.alloc(HEADER);
  header[0] = channel;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
function parseEvents(bytes) {
  const outputs = [];
  let offset = 0;
  while (true) {
    const end = bytes.indexOf(10, offset);
    if (end < 0) break;
    if (end === offset || end - offset > MAX_RECORD) fail('EVENT_LENGTH');
    outputs.push(encodeEvent(bytes.subarray(offset, end)));
    offset = end + 1;
  }
  if (bytes.length - offset > MAX_RECORD) fail('EVENT_LENGTH');
  return { outputs, remaining: Buffer.from(bytes.subarray(offset)) };
}
function parseLogs(bytes) {
  const outputs = [];
  let offset = 0;
  while (bytes.length - offset >= HEADER) {
    const channel = bytes[offset];
    if ((channel !== 1 && channel !== 2) || bytes[offset+1] !== 0 ||
        bytes[offset+2] !== 0 || bytes[offset+3] !== 0) fail('LOG_HEADER');
    const length = bytes.readUInt32BE(offset + 4);
    if (length < 1 || length > MAX_FRAME_PAYLOAD) fail('LOG_FRAME_LENGTH');
    if (bytes.length - offset < HEADER + length) break;
    outputs.push(encodeLog(channel, bytes.subarray(offset + HEADER, offset + HEADER + length)));
    offset += HEADER + length;
  }
  if (bytes.length - offset > MAX_CARRY) fail('LOG_LENGTH');
  return { outputs, remaining: Buffer.from(bytes.subarray(offset)) };
}

/** Deterministic offline parser: EVENTS=NDJSON; LOGS=8-byte Docker mux framing. */
export function createR7BSyntheticStream(kind) {
  if (kind !== 'EVENTS' && kind !== 'LOGS') fail('KIND');
  let state = 'ACTIVE';
  let carry = Buffer.alloc(0);
  let pending = [];
  let bytesReceived = 0;
  let records = 0;
  const status = () => Object.freeze({ kind, state, bytesReceived, records,
    pending: pending.length, buffered: carry.length });
  const wipe = () => {
    carry.fill(0); carry = Buffer.alloc(0);
    for (const frame of pending) frame.fill(0);
    pending = [];
  };
  const blocked = code => { wipe(); state = 'FAILED'; fail(code); };
  return Object.freeze({
    push(chunk) {
      if (state !== 'ACTIVE') fail('NOT_ACTIVE');
      if (!Buffer.isBuffer(chunk) || chunk.length === 0 || chunk.length > MAX_CHUNK)
        blocked('CHUNK');
      if (pending.length === MAX_PENDING) fail('BACKPRESSURE');
      if (bytesReceived + chunk.length > MAX_TOTAL_BYTES ||
          carry.length + chunk.length > MAX_CHUNK + MAX_CARRY) blocked('TOTAL_SIZE');
      const joined = Buffer.concat([carry, chunk]);
      let parsed;
      try { parsed = kind === 'EVENTS' ? parseEvents(joined) : parseLogs(joined); }
      catch (err) {
        joined.fill(0); blocked('INVALID_' + String(err.message).replace(/^R7B_BLOCKED_/, ''));
      }
      joined.fill(0);
      if (pending.length + parsed.outputs.length > MAX_PENDING) {
        parsed.remaining.fill(0);
        for (const item of parsed.outputs) item.fill(0);
        fail('BACKPRESSURE'); // No new bytes/records accepted. Caller splits or drains.
      }
      if (records + parsed.outputs.length > MAX_TOTAL_RECORDS) {
        parsed.remaining.fill(0);
        for (const item of parsed.outputs) item.fill(0);
        blocked('RECORD_LIMIT');
      }
      carry.fill(0);
      carry = parsed.remaining;
      pending.push(...parsed.outputs);
      records += parsed.outputs.length;
      bytesReceived += chunk.length;
      return status();
    },
    take(limit = MAX_PENDING) {
      if (state !== 'ACTIVE' && state !== 'ENDED') fail('NOT_READABLE');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PENDING) fail('TAKE_LIMIT');
      const selected = pending.splice(0, limit);
      const copies = selected.map(frame => Buffer.from(frame));
      for (const frame of selected) frame.fill(0);
      return copies;
    },
    finish() {
      if (state !== 'ACTIVE') fail('NOT_ACTIVE');
      if (carry.length !== 0 || records === 0) blocked('TRUNCATED_OR_EMPTY');
      state = 'ENDED';
      return status();
    },
    cancel() {
      if (state === 'CANCELLED') return status();
      if (state === 'FAILED') fail('NOT_CANCELLABLE');
      wipe(); state = 'CANCELLED';
      return status();
    },
    status
  });
}

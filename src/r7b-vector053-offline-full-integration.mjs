/* R7B-G1B13 — complete owned synthetic composition, offline only.
 *
 * This module composes the already-approved LIST/INSPECT fixtures, the new
 * G1B12 numeric-event decoder, and the unchanged bounded LOGS parser. It does
 * not accept daemon input, open transport, run Vector/Docker, or alter the
 * historical EVENTS parser. Every boundary is checked before publication.
 */
import {runR7B11SyntheticSession} from './r7b-vector053-offline-contract-session.mjs';
import {createR7B12NumericEventStream} from './r7b-vector053-numeric-event-decoder.mjs';
import {createR7BSyntheticStream} from './r7b-bounded-synthetic-stream.mjs';
import {r7bVector053ContractFacts} from './r7b-vector053-wire-contract.mjs';

const ID = 'a'.repeat(64);
const NAME = '/r7b-synthetic-fixture';
const LABEL = 'LAB_ONLY';
const MARKER = 'R7B_PUBLIC_SYNTHETIC_ONLY';
const MAX_SECONDS = 2147483647;
const MAX_EVENT_BYTES = 768;
const MAX_LOG_FRAME_BYTES = 520; // 8-byte Docker mux header + 512-byte payload.
const MAX_BUNDLE_BYTES = 65536;
const EVENT_FRAGMENT_BYTES = 7;
const LOG_FRAGMENT_BYTES = 5;
const fail = code => { throw new Error('R7B13_BLOCKED_' + code); };

function own(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail('SCOPE');
  const props = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(props).length !== keys.length ||
      !keys.every(key => Object.hasOwn(props, key)) ||
      Object.values(props).some(prop => !Object.hasOwn(prop, 'value'))) fail('SCOPE');
  return Object.fromEntries(keys.map(key => [key, props[key].value]));
}

function safeJson(buffer, code) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_BUNDLE_BYTES)
    fail(code);
  try { return JSON.parse(buffer.toString('utf8')); }
  catch { fail(code); }
}

function validatePlan(plan) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan) ||
      Object.getPrototypeOf(plan) !== Object.prototype) fail('PLAN');
  const expected = {
    list: '/containers/json',
    inspect: `/containers/${ID}/json`,
    events: '/events',
    logs: `/containers/${ID}/logs`
  };
  if (Object.keys(plan).length !== 4 || !Object.keys(expected).every(key =>
      Object.hasOwn(plan, key) && plan[key]?.method === 'GET' &&
      plan[key]?.path === expected[key])) fail('PLAN');
  const listQuery = plan.list.query;
  const eventsQuery = plan.events.query;
  const eventFilters = eventsQuery?.filters;
  const logsQuery = plan.logs.query;
  if (listQuery?.all !== false ||
      !Array.isArray(listQuery?.filters?.label) ||
      listQuery.filters.label.length !== 1 ||
      listQuery.filters.label[0] !== 'r7b.lab.owner=LAB_ONLY' ||
      !Array.isArray(eventFilters?.event) ||
      eventFilters.event.join(',') !== 'start,unpause,die,pause' ||
      eventFilters.type?.length !== 1 || eventFilters.type[0] !== 'container' ||
      eventFilters.label?.length !== 1 ||
      eventFilters.label[0] !== 'r7b.lab.owner=LAB_ONLY' ||
      typeof eventsQuery.since !== 'string' ||
      logsQuery?.follow !== true || logsQuery.stdout !== true ||
      logsQuery.stderr !== true || logsQuery.timestamps !== true) fail('PLAN');
}

function validateMetadata(listBytes, inspectBytes, created, nowSeconds) {
  const list = safeJson(listBytes, 'METADATA');
  const inspect = safeJson(inspectBytes, 'METADATA');
  if (!Array.isArray(list) || list.length !== 1 ||
      list[0]?.Id !== ID || list[0]?.State !== 'running' ||
      !Number.isSafeInteger(list[0]?.Created) || list[0].Created > nowSeconds ||
      inspect === null || typeof inspect !== 'object' || Array.isArray(inspect) ||
      inspect.Id !== ID || inspect.Name !== NAME || inspect.Created !== created ||
      inspect.Config?.Image !== list[0].Image || inspect.Image !== list[0].ImageID ||
      inspect.Config?.Labels?.['r7b.lab.owner'] !== LABEL ||
      inspect.Config?.Labels?.['r7b.lab.role'] !== 'fixture') fail('METADATA');
  return Object.freeze({
    list: Buffer.from(listBytes),
    inspect: Buffer.from(inspectBytes),
    listValue: list,
    inspectValue: inspect
  });
}

function decodeEvents(eventBytes, nowSeconds) {
  if (!Array.isArray(eventBytes) || eventBytes.length !== 4 ||
      eventBytes.some(bytes => !Buffer.isBuffer(bytes) ||
        bytes.length < 1 || bytes.length > MAX_EVENT_BYTES)) fail('EVENTS');
  const joined = Buffer.concat(eventBytes);
  const decoder = createR7B12NumericEventStream();
  const decoded = [];
  try {
    for (let offset = 0; offset < joined.length; offset += EVENT_FRAGMENT_BYTES) {
      decoder.push(Buffer.from(joined.subarray(offset, offset + EVENT_FRAGMENT_BYTES)));
      decoded.push(...decoder.take());
    }
    const status = decoder.finish();
    if (status.state !== 'ENDED' || status.records !== 4 || decoded.length !== 4)
      fail('EVENTS');
  } catch (error) {
    if (decoder.status().state === 'ACTIVE') decoder.cancel();
    fail('EVENTS_' + String(error?.message || 'INVALID').replace(/^R7B12_BLOCKED_/, ''));
  } finally {
    joined.fill(0);
  }
  const actions = r7bVector053ContractFacts().eventActions;
  for (let i = 0; i < decoded.length; i++) {
    const event = decoded[i];
    const expectedNano = String(BigInt(nowSeconds) * 1000000000n + BigInt(i));
    if (event.action !== actions[i] || event.actorId !== ID ||
        event.name !== NAME.slice(1) || event.label !== LABEL ||
        event.time !== nowSeconds || event.timeNano !== expectedNano ||
        event.timeNanoWireType !== 'JSON_INT64_NUMBER' ||
        event.origin !== 'R7B_PUBLIC_SYNTHETIC_ONLY') fail('EVENT_SEQUENCE');
  }
  return Object.freeze(decoded);
}

function decodeLogs(logBytes, created) {
  if (!Array.isArray(logBytes) || logBytes.length !== 2 ||
      logBytes.some(frame => !Buffer.isBuffer(frame) ||
        frame.length < 9 || frame.length > MAX_LOG_FRAME_BYTES)) fail('LOGS');
  const joined = Buffer.concat(logBytes);
  const parser = createR7BSyntheticStream('LOGS');
  const parsed = [];
  try {
    for (let offset = 0; offset < joined.length; offset += LOG_FRAGMENT_BYTES) {
      parser.push(Buffer.from(joined.subarray(offset, offset + LOG_FRAGMENT_BYTES)));
      parsed.push(...parser.take());
    }
    const status = parser.finish();
    if (status.state !== 'ENDED' || status.records !== 2 || parsed.length !== 2)
      fail('LOGS');
    for (let i = 0; i < parsed.length; i++) {
      const expected = logBytes[i];
      const payload = parsed[i].subarray(8).toString('utf8');
      if (!parsed[i].equals(expected) || parsed[i][0] !== i + 1 ||
          parsed[i][1] !== 0 || parsed[i][2] !== 0 || parsed[i][3] !== 0 ||
          parsed[i].readUInt32BE(4) !== parsed[i].length - 8 ||
          payload !== `${created} ${MARKER}\n`) fail('LOGS');
    }
  } catch (error) {
    for (const frame of parsed) frame.fill(0);
    if (parser.status().state === 'ACTIVE') parser.cancel();
    fail('LOGS_' + String(error?.message || 'INVALID').replace(/^R7B_BLOCKED_/, ''));
  } finally {
    joined.fill(0);
  }
  return Object.freeze(parsed.map(frame => Buffer.from(frame)));
}

/** Validate the complete owned LIST/INSPECT/events/LOGS proof bundle. */
export function assertR7B13SyntheticBundle(bundle) {
  const {plan, created, nowSeconds, list, inspect, events, logs} = own(bundle,
    ['plan', 'created', 'nowSeconds', 'list', 'inspect', 'events', 'logs']);
  if (typeof created !== 'string' || created.length < 1 || created.length > 96 ||
      !Number.isSafeInteger(nowSeconds) || nowSeconds < 2 || nowSeconds > MAX_SECONDS ||
      !Buffer.isBuffer(list) || !Buffer.isBuffer(inspect) ||
      !Array.isArray(events) || !Array.isArray(logs)) fail('SCOPE');
  const total = list.length + inspect.length +
    events.reduce((sum, bytes) => sum + (Buffer.isBuffer(bytes) ? bytes.length : MAX_BUNDLE_BYTES), 0) +
    logs.reduce((sum, bytes) => sum + (Buffer.isBuffer(bytes) ? bytes.length : MAX_BUNDLE_BYTES), 0);
  if (total > MAX_BUNDLE_BYTES) fail('BUNDLE_SIZE');
  validatePlan(plan);
  const metadata = validateMetadata(list, inspect, created, nowSeconds);
  const decodedEvents = decodeEvents(events, nowSeconds);
  const logFrames = decodeLogs(logs, created);
  return Object.freeze({
    kind: 'OFFLINE_PUBLIC_SYNTHETIC_ONLY',
    containerId: ID,
    created,
    nowSeconds,
    plan,
    list: metadata.list,
    inspect: metadata.inspect,
    decodedEvents,
    logFrames,
    fragmentBytes: Object.freeze({events: EVENT_FRAGMENT_BYTES, logs: LOG_FRAGMENT_BYTES}),
    counts: Object.freeze({list: 1, inspect: 1, events: decodedEvents.length, logs: logFrames.length})
  });
}

/** Generate and validate one complete, in-memory G1B13 synthetic flight. */
export function runR7B13SyntheticIntegration(args) {
  const {created, nowSeconds} = own(args, ['created', 'nowSeconds']);
  let session;
  try { session = runR7B11SyntheticSession({created, nowSeconds}); }
  catch (error) { fail('BASE_' + String(error?.message || 'INVALID').replace(/^R7B11_BLOCKED_/, '')); }
  return assertR7B13SyntheticBundle({
    plan: session.plan,
    created,
    nowSeconds,
    list: session.list,
    inspect: session.inspect,
    events: session.events,
    logs: session.logs
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runR7B11SyntheticSession as base} from '../src/r7b-vector053-offline-contract-session.mjs';
import {assertR7B13SyntheticBundle as verify,
  runR7B13SyntheticIntegration as run} from '../src/r7b-vector053-offline-full-integration.mjs';

const ID = 'a'.repeat(64);
const CREATED = '2026-11-17T12:00:00.123456789Z';
const NOW = 1794916801;
const ACTIONS = ['start', 'unpause', 'die', 'pause'];
const denied = (fn, code) => assert.throws(fn, new RegExp('R7B13_BLOCKED_' + code));
const rawBundle = () => {
  const value = base({created: CREATED, nowSeconds: NOW});
  return {
    plan: value.plan, created: CREATED, nowSeconds: NOW,
    list: Buffer.from(value.list), inspect: Buffer.from(value.inspect),
    events: value.events.map(bytes => Buffer.from(bytes)),
    logs: value.logs.map(bytes => Buffer.from(bytes))
  };
};

test('R7B13-01 completes GET-only LIST/INSPECT/events/LOGS composition', () => {
  const result = run({created: CREATED, nowSeconds: NOW});
  assert.equal(result.kind, 'OFFLINE_PUBLIC_SYNTHETIC_ONLY');
  assert.deepEqual(result.counts, {list: 1, inspect: 1, events: 4, logs: 2});
  assert.deepEqual(result.fragmentBytes, {events: 7, logs: 5});
  for (const request of Object.values(result.plan)) assert.equal(request.method, 'GET');
  assert.equal(result.plan.list.path, '/containers/json');
  assert.equal(result.plan.inspect.path, `/containers/${ID}/json`);
  assert.equal(result.plan.events.path, '/events');
  assert.equal(result.plan.logs.path, `/containers/${ID}/logs`);
});

test('R7B13-02 LIST and INSPECT preserve exact identity and nanosecond Created', () => {
  const result = run({created: CREATED, nowSeconds: NOW});
  const list = JSON.parse(result.list);
  const inspect = JSON.parse(result.inspect);
  assert.equal(list[0].Id, ID);
  assert.equal(inspect.Id, ID);
  assert.equal(inspect.Created, CREATED);
  assert.equal(list[0].Created, 1794916800);
  assert.equal(inspect.Config.Image, list[0].Image);
  assert.equal(inspect.Image, list[0].ImageID);
});

test('R7B13-03 decodes four events in exact order with exact timeNano', () => {
  const result = run({created: CREATED, nowSeconds: NOW});
  assert.deepEqual(result.decodedEvents.map(event => event.action), ACTIONS);
  assert.deepEqual(result.decodedEvents.map(event => event.timeNano), [
    '1794916801000000000', '1794916801000000001',
    '1794916801000000002', '1794916801000000003'
  ]);
  for (const event of result.decodedEvents) {
    assert.equal(event.actorId, ID);
    assert.equal(event.time, NOW);
    assert.equal(event.timeNanoWireType, 'JSON_INT64_NUMBER');
    assert.equal(event.origin, 'R7B_PUBLIC_SYNTHETIC_ONLY');
  }
});

test('R7B13-04 events are decoded from seven-byte fragments', () => {
  const result = run({created: CREATED, nowSeconds: NOW});
  assert.equal(result.fragmentBytes.events, 7);
  assert.equal(result.decodedEvents.length, 4);
  assert.ok(result.decodedEvents.every(event => BigInt(event.timeNano) > BigInt(Number.MAX_SAFE_INTEGER)));
  assert.equal(BigInt(result.decodedEvents[3].timeNano) - BigInt(result.decodedEvents[0].timeNano), 3n);
});

test('R7B13-05 logs are decoded by the unchanged multiplexed parser in fragments', () => {
  const result = run({created: CREATED, nowSeconds: NOW});
  assert.equal(result.fragmentBytes.logs, 5);
  assert.deepEqual(result.logFrames.map(frame => frame[0]), [1, 2]);
  for (const frame of result.logFrames) {
    assert.deepEqual([...frame.subarray(1, 4)], [0, 0, 0]);
    assert.equal(frame.readUInt32BE(4), frame.length - 8);
    assert.equal(frame.subarray(8).toString(), CREATED + ' R7B_PUBLIC_SYNTHETIC_ONLY\n');
  }
});

test('R7B13-06 payload, event and log memory are bounded before composition', () => {
  const bundle = rawBundle();
  assert.ok(bundle.events.every(event => event.length <= 768));
  assert.ok(bundle.logs.every(frame => frame.length <= 520));
  const total = bundle.list.length + bundle.inspect.length +
    bundle.events.reduce((sum, bytes) => sum + bytes.length, 0) +
    bundle.logs.reduce((sum, bytes) => sum + bytes.length, 0);
  assert.ok(total <= 65536);
  assert.equal(verify(bundle).counts.events, 4);
});

test('R7B13-07 altered numeric event is rejected fail-closed', () => {
  const bundle = rawBundle();
  bundle.events[1] = Buffer.from(bundle.events[1].toString().replace(
    '1794916801000000001', '1794916801000000002'));
  denied(() => verify(bundle), 'EVENT');
});

test('R7B13-08 foreign identity and quoted timeNano are rejected', () => {
  const foreign = rawBundle();
  foreign.events[0] = Buffer.from(foreign.events[0].toString().replace(ID, 'b'.repeat(64)));
  denied(() => verify(foreign), 'EVENTS_');
  const quoted = rawBundle();
  quoted.events[0] = Buffer.from(quoted.events[0].toString().replace(
    '"timeNano":1794916801000000000', '"timeNano":"1794916801000000000"'));
  denied(() => verify(quoted), 'EVENTS_');
});

test('R7B13-09 invalid LIST/INSPECT and log frames are rejected', () => {
  const list = rawBundle();
  list.list = Buffer.from(list.list.toString().replace(ID, 'b'.repeat(64)));
  denied(() => verify(list), 'METADATA');
  const inspect = rawBundle();
  inspect.inspect = Buffer.from(inspect.inspect.toString().replace(CREATED, '2026-02-30T12:00:00Z'));
  denied(() => verify(inspect), 'METADATA');
  const logs = rawBundle();
  logs.logs[0][0] = 3;
  denied(() => verify(logs), 'LOGS_');
});

test('R7B13-10 truncation, duplicate scope and oversized bundles fail closed', () => {
  const truncated = rawBundle();
  truncated.events[3] = truncated.events[3].subarray(0, -1);
  denied(() => verify(truncated), 'EVENTS_');
  const extra = {...rawBundle(), secret: 'nope'};
  denied(() => verify(extra), 'SCOPE');
  const oversized = rawBundle();
  oversized.list = Buffer.alloc(65537, 0x61);
  denied(() => verify(oversized), 'BUNDLE_SIZE');
});

test('R7B13-11 rejects inherited/accessor input and never opens transport', () => {
  denied(() => verify(Object.create(rawBundle())), 'SCOPE');
  const value = rawBundle();
  Object.defineProperty(value, 'nowSeconds', {enumerable: true, get() { throw Error('getter'); }});
  denied(() => verify(value), 'SCOPE');
  const source = readFileSync(new URL('../src/r7b-vector053-offline-full-integration.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch\(|createServer\(|docker\.sock|DOCKER_HOST|spawn\(|exec\()/);
});

test('R7B13-12 invalid base clock and metadata remain blocked by prior gates', () => {
  denied(() => run({created: CREATED, nowSeconds: 1}), 'BASE_CLOCK');
  denied(() => run({created: '2026-02-30T12:00:00Z', nowSeconds: NOW}), 'BASE_METADATA');
  denied(() => run({created: CREATED, nowSeconds: NOW, extra: true}), 'SCOPE');
});

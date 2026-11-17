import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { R7BOfflineSource, R7BOfflineSink, pumpR7BOffline } from '../src/r7b-offline-backpressure-pump.mjs';

const ID = 'a'.repeat(64);
const MARKER = 'R7B_PUBLIC_SYNTHETIC_ONLY';
const stamp = '2026-11-16T20:04:10.123456789Z';
const event = (Action = 'start') => Buffer.from(JSON.stringify({
  Type: 'container', Action, Actor: {ID, Attributes: {name: 'r7b-synthetic-fixture'}},
  time: 1794860000, timeNano: '1794860000000000000'
}) + '\n');
const frame = (line = `${stamp} ${MARKER}\n`, channel = 1) => {
  const body = Buffer.from(line);
  const h = Buffer.alloc(8); h[0] = channel; h.writeUInt32BE(body.length, 4);
  return Buffer.concat([h, body]);
};
const source = (kind, chunks) => new R7BOfflineSource(kind, chunks);
const sink = () => new R7BOfflineSink();

test('R7B2-01: synthetic EVENTS passes one owned source and sink', async () => {
  const s = source('EVENTS', [event()]), k = sink();
  const r = await pumpR7BOffline(s, k);
  assert.deepEqual(r, {ok: true, kind: 'EVENTS', frames: 1, bytes: event().length});
  assert.deepEqual(k.bytes(), event());
  assert.equal(s.status().closed, true);
});
test('R7B2-02: Docker LOGS fragments of each byte reconstruct exactly', async () => {
  const f = frame();
  const s = source('LOGS', Array.from(f, byte => Buffer.from([byte])));
  const k = sink();
  assert.equal((await pumpR7BOffline(s, k)).frames, 1);
  assert.deepEqual(k.bytes(), f);
});
test('R7B2-03: both stdout and stderr preserve order across pulls', async () => {
  const a = frame(), b = frame(`${stamp} ${MARKER}\n`, 2);
  const k = sink();
  assert.equal((await pumpR7BOffline(source('LOGS', [a, b]), k)).frames, 2);
  assert.deepEqual(k.bytes(), Buffer.concat([a, b]));
});
test('R7B2-04: held Node Writable prevents upstream source pull until drain', async () => {
  const a = event(), b = event('die');
  const s = source('EVENTS', [a, b]), k = sink();
  k.hold();
  const pending = pumpR7BOffline(s, k, {drainTimeoutMs: 500});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.status().pulled, 1);
  assert.equal(k.status().held, true);
  k.release();
  assert.equal((await pending).frames, 2);
  assert.equal(s.status().pulled, 2);
  assert.deepEqual(k.bytes(), Buffer.concat([a, b]));
});
test('R7B2-05: abort before first pull rejects and wipes sink', async () => {
  const controller = new AbortController(); controller.abort();
  const s = source('EVENTS', [event()]), k = sink();
  await assert.rejects(pumpR7BOffline(s, k, {signal: controller.signal}), /STREAM_ABORTED/);
  assert.equal(s.status().pulled, 0);
  assert.equal(s.status().closed, true);
  assert.equal(k.status().destroyed, true);
});
test('R7B2-06: abort during held write rejects without pulling second chunk', async () => {
  const controller = new AbortController(), s = source('EVENTS', [event(), event('die')]), k = sink();
  k.hold();
  const promise = pumpR7BOffline(s, k, {signal: controller.signal, drainTimeoutMs: 500});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.status().pulled, 1);
  controller.abort();
  await assert.rejects(promise, /STREAM_ABORTED/);
  assert.equal(s.status().pulled, 1);
  assert.equal(k.status().bytes, 0);
});
test('R7B2-07: slow consumer drain timeout fails closed', async () => {
  const s = source('EVENTS', [event(), event('die')]), k = sink();
  k.hold();
  await assert.rejects(pumpR7BOffline(s, k, {drainTimeoutMs: 20}), /STREAM_ABORTED/);
  assert.equal(s.status().pulled, 1);
  assert.equal(k.status().bytes, 0);
  assert.equal(k.status().destroyed, true);
});
test('R7B2-08: invalid second event destroys sink and suppresses collected output', async () => {
  const bad = Buffer.from(JSON.stringify({Type: 'container', Action: 'restart',
    Actor: {ID, Attributes: {name: 'r7b-synthetic-fixture'}}, time: 1794860000,
    timeNano: '1794860000000000000'}) + '\n');
  const s = source('EVENTS', [event(), bad]), k = sink();
  await assert.rejects(pumpR7BOffline(s, k), /STREAM_ABORTED/);
  assert.equal(k.status().bytes, 0);
  assert.throws(() => k.bytes(), /SINK_NOT_FINISHED/);
});
test('R7B2-09: unfinished LOGS header blocks final success', async () => {
  const k = sink();
  await assert.rejects(pumpR7BOffline(source('LOGS', [frame().subarray(0, 7)]), k), /STREAM_ABORTED/);
  assert.equal(k.status().bytes, 0);
});
test('R7B2-10: invalid UTF-8 is rejected', async () => {
  const b = Buffer.concat([Buffer.from([1, 0, 0, 0, 0, 0, 0, 2]), Buffer.from([0xc3, 0x28])]);
  const k = sink();
  await assert.rejects(pumpR7BOffline(source('LOGS', [b]), k), /STREAM_ABORTED/);
  assert.equal(k.status().bytes, 0);
});
test('R7B2-11: unknown event alias is never forwarded', async () => {
  const bad = Buffer.from(event().toString().replace(ID, 'b'.repeat(64)));
  const k = sink();
  await assert.rejects(pumpR7BOffline(source('EVENTS', [bad]), k), /STREAM_ABORTED/);
  assert.equal(k.status().bytes, 0);
});
test('R7B2-12: unknown source type is refused on construction', () => {
  assert.throws(() => source('DOCKER', [event()]), /SOURCE_SCOPE/);
});
test('R7B2-13: malformed or oversized chunks are rejected before starting', () => {
  for (const arr of [[], [null], ['raw'], [Buffer.alloc(0)], [Buffer.alloc(2049)]])
    assert.throws(() => source('EVENTS', arr), /SOURCE_SCOPE|SOURCE_CHUNK/);
});
test('R7B2-14: arbitrary async source and native Writable are not accepted', async () => {
  const fakeSource = {kind: 'EVENTS', *[Symbol.iterator]() { yield event(); }};
  await assert.rejects(pumpR7BOffline(fakeSource, sink()), /SCOPE/);
  const arbitrarySink = new Writable({write(_chunk, _enc, cb) { cb(); }});
  await assert.rejects(pumpR7BOffline(source('EVENTS', [event()]), arbitrarySink), /SCOPE/);
  arbitrarySink.destroy();
});
test('R7B2-15: sink cannot expose data prior to finished valid stream', () => {
  assert.throws(() => sink().bytes(), /SINK_NOT_FINISHED/);
});
test('R7B2-16: invalid timing parameters rejected without source consumption', async () => {
  for (const opts of [{drainTimeoutMs: 0}, {deadlineMs: -1}, {deadlineMs: 1.5},
                      {drainTimeoutMs: Infinity}, {signal: {}}]) {
    const s = source('EVENTS', [event()]);
    await assert.rejects(pumpR7BOffline(s, sink(), opts), /SCOPE/);
    assert.equal(s.status().pulled, 0);
  }
});
test('R7B2-17: once source used, cannot pump it again', async () => {
  const s = source('EVENTS', [event()]);
  await pumpR7BOffline(s, sink());
  await assert.rejects(pumpR7BOffline(s, sink()), /SCOPE/);
});
test('R7B2-18: parser backpressure from >8 same-chunk frames is fail-closed', async () => {
  const f = frame(), nine = Buffer.concat(Array.from({length: 9}, () => f));
  const k = sink();
  await assert.rejects(pumpR7BOffline(source('LOGS', [nine]), k), /STREAM_ABORTED/);
  assert.equal(k.status().bytes, 0);
});
test('R7B2-19: cancel closes source and sink; no further source chunks can be accessed', async () => {
  const a = source('EVENTS', [event()]), k = sink();
  const ctl = new AbortController();ctl.abort();
  await assert.rejects(pumpR7BOffline(a, k, {signal: ctl.signal}), /STREAM_ABORTED/);
  assert.throws(() => a.pull(), /SOURCE_CLOSED/);
});
test('R7B2-20: only in-memory Node streams, no socket, shell, Docker, FS or HTTP code', () => {
  const code = readFileSync(new URL('../src/r7b-offline-backpressure-pump.mjs', import.meta.url), 'utf8');
  assert.match(code, /import \{ Writable \} from 'node:stream'/);
  assert.doesNotMatch(code, /(?:^|\n)import .*node:(?:net|http|https|child_process|fs)/);
  assert.doesNotMatch(code, /docker\.sock|host\.docker\.internal|f5solucoes\.net|github_pat_/);
  assert.doesNotMatch(code, /\b(?:fetch\(|spawn\(|createServer\(|execFile\(|http\.request\()/);
});

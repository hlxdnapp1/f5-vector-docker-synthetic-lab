import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildR7BBollard0192SyntheticPair } from '../src/r7b-bollard0192-fixture.mjs';
import { normalizeR7BOfflineDockerPair as projectPair,
         normalizeR7BOfflineDockerInspect as projectInspect,
         normalizeR7BOfflineDockerList as projectList } from '../src/r7b-offline-docker-api-normalizer.mjs';

const ID = 'a'.repeat(64);
const FOREIGN = 'd'.repeat(64);
const CREATED = '2026-11-17T12:00:00.123456789Z';
const fixture = (created = CREATED) => buildR7BBollard0192SyntheticPair({ created });
const pair = (created = CREATED) => {
  const f = fixture(created);
  return projectPair(f.list, f.inspect, ID);
};
const outDate = (created = CREATED) => JSON.parse(pair(created).inspect.toString()).Created;
const error = (f, pattern) => assert.throws(f, pattern);

// End-to-end regression against the Bollard 0.19.2 fixture, not a local replacement of its schema.
test('R7B7-01 fixture LIST and INSPECT accepted together', () => {
  const x = pair();
  assert.equal(JSON.parse(x.list.toString()).length, 1);
  assert.equal(JSON.parse(x.inspect.toString()).Id, ID);
});
test('R7B7-02 nine fractional digits survive the paired normalizer unchanged', () => {
  assert.equal(outDate(), CREATED);
});
test('R7B7-03 nine fractional digits survive direct INSPECT normalization', () => {
  const f = fixture();
  assert.equal(JSON.parse(projectInspect(f.inspect, ID).toString()).Created, CREATED);
});
test('R7B7-04 a one-nanosecond delta remains visible', () => {
  const a = outDate('2026-11-17T12:00:00.123456789Z');
  const b = outDate('2026-11-17T12:00:00.123456788Z');
  assert.notEqual(a, b);
});
test('R7B7-05 all supported fractional precision lengths preserved', () => {
  for (let digits = 1; digits <= 9; digits++) {
    const stamp = `2026-11-17T12:00:00.${'123456789'.slice(0, digits)}Z`;
    assert.equal(outDate(stamp), stamp);
  }
});
test('R7B7-06 no fraction stays valid RFC3339 Z', () => {
  assert.equal(outDate('2026-11-17T12:00:00Z'), '2026-11-17T12:00:00Z');
});
test('R7B7-07 existing .000Z representation remains exact', () => {
  assert.equal(outDate('2026-11-17T12:00:00.000Z'), '2026-11-17T12:00:00.000Z');
});
test('R7B7-08 LIST Created still whole epoch seconds', () => {
  const item = JSON.parse(pair().list.toString())[0];
  assert.equal(item.Created, 1794916800);
});
test('R7B7-09 paired INSPECT retains only safe metadata', () => {
  const result = JSON.parse(pair().inspect.toString());
  assert.deepEqual(Object.keys(result),
    ['Id','Name','Image','Created','State','Config','HostConfig','Mounts','NetworkSettings']);
  assert.equal(result.Config.Image, 'r7b-public-synthetic@sha256:' + 'b'.repeat(64));
});
test('R7B7-10 LIST projection still strips arbitrary outsider records', () => {
  const f = fixture();
  const list = JSON.parse(f.list.toString());
  const outsider = {...list[0], Id: FOREIGN, Names: ['/CANARY_PRIVATE'], Secret:'CANARY_PRIVATE'};
  const output = projectList(Buffer.from(JSON.stringify([outsider,...list]))).toString();
  assert.equal(JSON.parse(output).length, 1);
  assert.doesNotMatch(output, /CANARY_PRIVATE/);
});
test('R7B7-11 private INSPECT fields are never projected', () => {
  const f = fixture();
  const detail = JSON.parse(f.inspect.toString());
  detail.LogPath = '/CANARY_PRIVATE';
  detail.Config.Cmd = ['CANARY_PRIVATE'];
  const output = projectInspect(Buffer.from(JSON.stringify(detail)), ID).toString();
  assert.equal(JSON.parse(output).Created, CREATED);
  assert.doesNotMatch(output, /CANARY_PRIVATE|LogPath|Cmd/);
});
test('R7B7-12 foreign requested ID blocked before emitting metadata', () => {
  const f = fixture();
  error(() => projectPair(f.list, f.inspect, FOREIGN), /R7B4_BLOCKED_REQUESTED_ID/);
});
test('R7B7-13 mismatched LIST/INSPECT creation seconds block pair', () => {
  const f = fixture();
  const inspect = JSON.parse(f.inspect.toString());
  inspect.Created = '2026-11-17T12:00:01.123456789Z';
  error(() => projectPair(f.list, Buffer.from(JSON.stringify(inspect)), ID), /R7B4_BLOCKED_CREATED_DRIFT/);
});
test('R7B7-14 malformed timestamp is still blocked', () => {
  const f = fixture();
  const inspect = JSON.parse(f.inspect.toString());
  inspect.Created = '2026-02-30T12:00:00.123456789Z';
  error(() => projectInspect(Buffer.from(JSON.stringify(inspect)), ID), /R7B4_BLOCKED_INSPECT_CREATED/);
});
test('R7B7-15 incorrect date timezone is blocked', () => {
  const f = fixture();
  const inspect = JSON.parse(f.inspect.toString());
  inspect.Created = '2026-11-17T12:00:00.123456789+00:00';
  error(() => projectInspect(Buffer.from(JSON.stringify(inspect)), ID), /R7B4_BLOCKED_INSPECT_CREATED/);
});
test('R7B7-16 duplicated JSON keys cannot pass', () => {
  const f = fixture();
  const inspect = f.inspect.toString().replace('"Created":', '"Created":"BAD", "Created":');
  error(() => projectInspect(Buffer.from(inspect), ID), /R7B4_BLOCKED_JSON_DUPLICATE/);
});
test('R7B7-17 wrong image config ID remains blocked', () => {
  const f = fixture();
  const inspect = JSON.parse(f.inspect.toString());
  inspect.Image = 'sha256:' + 'f'.repeat(64);
  error(() => projectInspect(Buffer.from(JSON.stringify(inspect)), ID), /R7B4_BLOCKED_INSPECT_TARGET/);
});
test('R7B7-18 rootfs privileges remain blocked', () => {
  const f = fixture();
  const inspect = JSON.parse(f.inspect.toString());
  inspect.HostConfig.Privileged = true;
  error(() => projectInspect(Buffer.from(JSON.stringify(inspect)), ID), /R7B4_BLOCKED_INSPECT_TARGET/);
});
test('R7B7-19 network attachments remain blocked', () => {
  const f = fixture();
  const inspect = JSON.parse(f.inspect.toString());
  inspect.NetworkSettings.Networks.bridge = {};
  error(() => projectInspect(Buffer.from(JSON.stringify(inspect)), ID), /R7B4_BLOCKED_INSPECT_TARGET/);
});
test('R7B7-20 no outputs share their Buffer memory across invocations', () => {
  const a = pair(), b = pair();
  a.inspect.fill(0); a.list.fill(0);
  assert.equal(JSON.parse(b.inspect.toString()).Created, CREATED);
  assert.equal(JSON.parse(b.list.toString())[0].Id, ID);
});
test('R7B7-21 invalid UTF-8 remains blocked', () => {
  error(() => projectInspect(Buffer.from([0xc3, 0x28]), ID), /R7B4_BLOCKED_UTF8/);
});
test('R7B7-22 oversized input remains blocked', () => {
  error(() => projectInspect(Buffer.alloc(32769), ID), /R7B4_BLOCKED_BODY_SCOPE/);
});
test('R7B7-23 no new network or Docker code introduced', () => {
  const s = readFileSync(new URL('../src/r7b-offline-docker-api-normalizer.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(s, /^\s*import\b/m);
  assert.doesNotMatch(s, /\b(?:fetch|spawn|child_process|createServer|createConnection|writeFileSync|Dockerode)\b/);
  assert.doesNotMatch(s, /docker\.sock|host\.docker\.internal|f5solucoes\.net/);
});

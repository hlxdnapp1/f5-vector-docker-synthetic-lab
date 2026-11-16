import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLabRead, projectLabResponse } from '../src/r6f-real-docker-adapter.mjs';

const id = 'c'.repeat(64);
const fake = 'a'.repeat(64);
const marker = 'R6F_PUBLIC_SYNTHETIC_ONLY';
const target = (query='tail=all') => '/containers/'+fake+'/logs?'+query;
const plan = (query='tail=all') => planLabRead({method:'GET',target:target(query)},id);
const line = timestamp => timestamp+' '+marker+'\n';
const frame = (payload,channel=1) => {
  const body=Buffer.isBuffer(payload)?payload:Buffer.from(payload,'utf8');
  const header=Buffer.alloc(8);
  header[0]=channel;
  header.writeUInt32BE(body.length,4);
  return Buffer.concat([header,body]);
};
const project = (buffer,query='tail=all') => projectLabResponse(plan(query),{status:200,body:buffer},id);
const accepted = (timestamp,channel=1) => {
  const data=frame(line(timestamp),channel);
  const result=project(data);
  assert.equal(result.ok,true,timestamp);
  assert.equal(result.kind,'LOGS');
  assert.ok(Buffer.isBuffer(result.body));
  assert.deepEqual(result.body,data);
};

test('R6J-01: official padded nine-digit RFC3339Nano UTC Docker timestamp passes',()=>{
  accepted('2026-11-16T19:48:31.000000000Z');
});
test('R6J-02: nonzero nanoseconds are preserved byte-for-byte',()=>{
  accepted('2026-11-16T19:48:31.123456789Z');
  accepted('2026-11-16T19:48:31.000000001Z',2);
});
test('R6J-03: compatible UTC fractional precision from 1 through 9 digits',()=>{
  for(const frac of ['1','12','123','1234','123456','12345678','123456789']) {
    accepted('2026-11-16T19:48:31.'+frac+'Z');
  }
});
test('R6J-04: valid RFC3339 UTC seconds without fractional part pass',()=>{
  accepted('2026-11-16T19:48:31Z');
});
test('R6J-05: excessive nanosecond precision and dangling fractions fail closed',()=>{
  for(const stamp of [
    '2026-11-16T19:48:31.1234567890Z',
    '2026-11-16T19:48:31.Z',
    '2026-11-16T19:48:31.123456789012Z'
  ]) {
    const r=project(frame(line(stamp)));
    assert.equal(r.ok,false,stamp);
    assert.equal(r.body,null);
  }
});
test('R6J-06: malformed calendar days and impossible leap dates fail closed',()=>{
  for(const stamp of [
    '2026-02-29T19:48:31.000000000Z',
    '2026-02-30T19:48:31.000000000Z',
    '2026-11-31T19:48:31.123456789Z',
    '2026-13-01T19:48:31.000000000Z'
  ]) {
    assert.equal(project(frame(line(stamp))).ok,false,stamp);
  }
  accepted('2024-02-29T19:48:31.123456789Z');
});
test('R6J-07: hour, minute, second and timezone mutations are rejected',()=>{
  for(const stamp of [
    '2026-11-16T24:48:31.123456789Z',
    '2026-11-16T19:60:31.123456789Z',
    '2026-11-16T19:48:60.123456789Z',
    '2026-11-16T19:48:31.123456789+00:00',
    '2026-11-16T19:48:31.123456789z'
  ]) assert.equal(project(frame(line(stamp))).ok,false,stamp);
});
test('R6J-08: arbitrary log messages and additional fields never pass',()=>{
  for(const payload of [
    '2026-11-16T19:48:31.123456789Z SECRET_CANARY\n',
    '2026-11-16T19:48:31.123456789Z '+marker+' SECRET_CANARY\n',
    '2026-11-16T19:48:31.123456789Z '+marker+'\nSECRET_CANARY\n',
    '2026-11-16T19:48:31.123456789Z '+marker,
  ]) {
    const r=project(frame(payload));
    assert.equal(r.ok,false);
    assert.equal(r.body,null);
    assert.doesNotMatch(JSON.stringify(r),/SECRET_CANARY/);
  }
});
test('R6J-09: malformed binary UTF-8 is refused without echo',()=>{
  const b=Buffer.concat([Buffer.from('2026-11-16T19:48:31.123456789Z '),Buffer.from([0xc3,0x28]),Buffer.from('\n')]);
  const r=project(frame(b));
  assert.equal(r.ok,false);
  assert.equal(r.body,null);
});
test('R6J-10: mux channel, reserved header and truncated framing remain guarded',()=>{
  const good=frame(line('2026-11-16T19:48:31.123456789Z'));
  const reserved=Buffer.from(good);reserved[3]=1;
  const channel=Buffer.from(good);channel[0]=3;
  const broken=Buffer.from(good);broken.writeUInt32BE(9000,4);
  for(const b of [reserved,channel,broken,good.subarray(0,5)]) {
    assert.equal(project(b).ok,false);
  }
  assert.equal(project(Buffer.alloc(0)).ok,true); // Empty log snapshot is valid.
});
test('R6J-11: one bad frame invalidates the complete response atomically',()=>{
  const body=Buffer.concat([
    frame(line('2026-11-16T19:48:31.123456789Z')),
    frame('SECRET_CANARY\n',2)
  ]);
  const r=project(body);
  assert.equal(r.ok,false);
  assert.equal(r.body,null);
  assert.doesNotMatch(JSON.stringify(r),/SECRET_CANARY/);
});
test('R6J-12: tail=all is rewritten into finite upstream tail=100, follow=false',()=>{
  const p=plan('tail=all&follow=true');
  assert.equal(p.ok,true);
  assert.equal(p.tail,100);
  assert.equal(p.path,'/containers/'+id+'/logs?stdout=true&stderr=true&timestamps=true&follow=false&tail=100');
  assert.equal(plan('tail=101').ok,false);
});
test('R6J-13: frame count is enforced against requested tail',()=>{
  const two=Buffer.concat([
    frame(line('2026-11-16T19:48:31.123456789Z'),1),
    frame(line('2026-11-16T19:48:32.987654321Z'),2)
  ]);
  assert.equal(project(two,'tail=2').ok,true);
  assert.equal(project(two,'tail=1').ok,false);
  assert.equal(project(two,'tail=0').ok,false);
});
test('R6J-14: oversized or partial frame bodies are never returned',()=>{
  const large=Buffer.alloc(16385,65);
  const r=project(large);
  assert.equal(r.ok,false);assert.equal(r.body,null);
  const header=Buffer.alloc(8);header[0]=1;header.writeUInt32BE(512,4);
  assert.equal(project(Buffer.concat([header,Buffer.from('partial')])).ok,false);
});
test('R6J-15: unrelated routes, read only gates and synthetic identity stay unchanged',()=>{
  const a=planLabRead({method:'GET',target:'/_ping'},id);
  assert.equal(a.ok,true);assert.equal(a.kind,'PING');
  assert.equal(projectLabResponse(a,{status:200,body:Buffer.from('OK')},id).ok,true);
  assert.equal(planLabRead({method:'POST',target:target()},id).ok,false);
  assert.equal(planLabRead({method:'GET',target:'/containers/'+'d'.repeat(64)+'/logs?tail=1'},id).ok,false);
});
test('R6J-16: patched adapter does not introduce network, filesystem or daemon operations',()=>{
  const src=readFileSync(new URL('../src/r6f-real-docker-adapter.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^import\s.*node:(?:fs|net|http|https|child_process)/m);
  assert.doesNotMatch(src,/\b(?:spawn|execFile|readFileSync|writeFileSync|createConnection|createServer)\s*\(/);
  assert.match(src,/follow=false&tail=/);
  assert.match(src,/R6F_PUBLIC_SYNTHETIC_ONLY/);
});

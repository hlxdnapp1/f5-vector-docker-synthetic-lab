import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createR6KDecoder } from '../src/r6k-bounded-docker-frame-decoder.mjs';

const time = '2026-11-16T20:04:10.123456789Z';
const marker = 'R6F_PUBLIC_SYNTHETIC_ONLY';
const text = (stamp=time) => stamp+' '+marker+'\n';
const frame = (payload=text(), channel=1) => {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload,'utf8');
  const head = Buffer.alloc(8);
  head[0] = channel;
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head,body]);
};
const oneFrame = frame();
const decoder = () => createR6KDecoder();

test('R6K-01: accepts a synthetic frame split across single-byte chunks', () => {
  const d=decoder();
  for (const b of oneFrame) d.push(Buffer.from([b]));
  assert.deepEqual(d.take(),[oneFrame]);
  assert.equal(d.finish().state,'ENDED');
});
test('R6K-02: every split point of header and payload reconstructs exactly', () => {
  for(let cut=1;cut<oneFrame.length;cut++){
    const d=decoder(); d.push(oneFrame.subarray(0,cut));
    d.push(oneFrame.subarray(cut));
    assert.deepEqual(d.take(),[oneFrame]);
    assert.equal(d.finish().state,'ENDED');
  }
});
test('R6K-03: RFC3339Nano with padded 9 digits preserved',()=>{
  const d=decoder();d.push(frame(text('2026-11-16T20:04:10.000000001Z'),2));
  assert.equal(d.take()[0].subarray(8).toString(),text('2026-11-16T20:04:10.000000001Z'));
  d.finish();
});
test('R6K-04: previous three-digit timestamp and valid no-fraction timestamp still work',()=>{
  for(const stamp of ['2026-11-16T20:04:10.123Z','2026-11-16T20:04:10Z']){
    const d=decoder();d.push(frame(text(stamp)));assert.equal(d.take().length,1);d.finish();
  }
});
test('R6K-05: rejects any arbitrary log, even if timestamp is correct',()=>{
  const d=decoder();assert.throws(()=>d.push(frame(time+' SECRET_CANARY\n')),/MARKER_OR_TIME/);
  assert.equal(d.status().state,'FAILED');assert.equal(d.status().bufferedBytes,0);
});
test('R6K-06: rejects invalid calendar timestamp without normalization',()=>{
  for(const stamp of ['2026-02-29T20:04:10.123456789Z','2026-11-31T20:04:10Z']){
    assert.throws(()=>decoder().push(frame(text(stamp))),/MARKER_OR_TIME/);
  }
});
test('R6K-07: rejects invalid UTF-8 bytes atomically',()=>{
  const d=decoder();const bytes=Buffer.concat([Buffer.from(time+' '),Buffer.from([0xc3,0x28]),Buffer.from('\n')]);
  assert.throws(()=>d.push(frame(bytes)),/UTF8/);
  assert.equal(d.status().pendingFrames,0);
});
test('R6K-08: refuses unknown mux channels',()=>{
  for(const channel of [0,3,255]) assert.throws(()=>decoder().push(frame(text(),channel)),/HEADER/);
});
test('R6K-09: refuses any nonzero reserved header byte',()=>{
  for(const i of [1,2,3]){
    const b=Buffer.from(oneFrame);b[i]=1;
    assert.throws(()=>decoder().push(b),/HEADER/);
  }
});
test('R6K-10: zero-length frame rejected',()=>{
  const h=Buffer.alloc(8);h[0]=1;
  assert.throws(()=>decoder().push(h),/FRAME_LENGTH/);
});
test('R6K-11: frame length over 512 is rejected before payload',()=>{
  const h=Buffer.alloc(8);h[0]=1;h.writeUInt32BE(513,4);
  assert.throws(()=>decoder().push(h),/FRAME_LENGTH/);
});
test('R6K-12: truncated header at EOF is never treated as success',()=>{
  const d=decoder();d.push(oneFrame.subarray(0,7));
  assert.throws(()=>d.finish(),/TRUNCATED/);assert.equal(d.status().state,'FAILED');
});
test('R6K-13: truncated payload at EOF is refused',()=>{
  const d=decoder();d.push(oneFrame.subarray(0,oneFrame.length-1));
  assert.throws(()=>d.finish(),/TRUNCATED/);
});
test('R6K-14: multiple frames across arbitrary chunks preserve channel order',()=>{
  const a=frame(),b=frame(text('2026-11-16T20:04:11.987654321Z'),2);
  const combined=Buffer.concat([a,b]);const d=decoder();
  for(let pos=0;pos<combined.length;pos+=11)d.push(combined.subarray(pos,pos+11));
  assert.deepEqual(d.take(),[a,b]);assert.equal(d.finish().state,'ENDED');
});
test('R6K-15: a bad frame in the same push does not expose any earlier validated frame',()=>{
  const d=decoder();const payload=Buffer.concat([frame(),frame('SECRET_CANARY\n',2)]);
  assert.throws(()=>d.push(payload),/MARKER_OR_TIME/);
  assert.equal(d.status().pendingFrames,0);
  assert.throws(()=>d.take(),/NOT_READABLE/);
});
test('R6K-16: when the output window is full, further input is blocked',()=>{
  const d=decoder();d.push(Buffer.concat(Array.from({length:8},()=>frame())));
  assert.equal(d.status().pendingFrames,8);
  assert.throws(()=>d.push(frame()),/BACKPRESSURE/);
  assert.equal(d.status().state,'ACTIVE');
});
test('R6K-17: draining output releases capacity, no unbounded queue',()=>{
  const d=decoder();d.push(Buffer.concat(Array.from({length:8},()=>frame())));
  const taken=d.take(3);assert.equal(taken.length,3);
  d.push(frame());assert.ok(d.status().pendingFrames<=8);
  assert.equal(d.take().length,6);assert.equal(d.finish().state,'ENDED');
});
test('R6K-18: exactly 100 frames across bounded batches accepted',()=>{
  const d=decoder();let total=0;
  for(let n=0;n<12;n++){
    d.push(Buffer.concat(Array.from({length:8},()=>frame())));
    total+=d.take().length;
  }
  d.push(Buffer.concat(Array.from({length:4},()=>frame())));
  total+=d.take().length;
  assert.equal(total,100);assert.equal(d.finish().parsedFrames,100);
});
test('R6K-19: frame 101 permanently fails closed',()=>{
  const d=decoder();for(let n=0;n<12;n++){
    d.push(Buffer.concat(Array.from({length:8},()=>frame())));d.take();
  }
  d.push(Buffer.concat(Array.from({length:4},()=>frame())));d.take();
  assert.throws(()=>d.push(frame()),/FRAME_COUNT/);
  assert.equal(d.status().state,'FAILED');
});
test('R6K-20: cancellation clears buffered bytes, is idempotent and denies further operations',()=>{
  const d=decoder();d.push(oneFrame.subarray(0,15));
  assert.equal(d.cancel().state,'CANCELLED');assert.equal(d.cancel().state,'CANCELLED');
  assert.equal(d.status().bufferedBytes,0);
  assert.throws(()=>d.push(frame()),/NOT_ACTIVE/);
  assert.throws(()=>d.take(),/NOT_READABLE/);
});
test('R6K-21: invalid, empty or oversized input chunk fails closed',()=>{
  for(const chunk of [Buffer.alloc(0),Buffer.alloc(2049), 'raw-string',null]){
    const d=decoder();assert.throws(()=>d.push(chunk),/INPUT_TYPE_OR_SIZE/);
  }
});
test('R6K-22: cannot continue after success or error',()=>{
  const d=decoder();d.push(frame());d.finish();
  assert.throws(()=>d.push(frame()),/NOT_ACTIVE/);
  assert.throws(()=>d.finish(),/NOT_ACTIVE/);
  assert.equal(d.take().length,1);
});
test('R6K-23: invalid take limits are denied without consuming frames',()=>{
  const d=decoder();d.push(frame());
  for(const limit of [0,-1,9,1.2,Infinity])assert.throws(()=>d.take(limit),/TAKE_LIMIT/);
  assert.equal(d.take().length,1);
});
test('R6K-24: no network, filesystem, Docker or process I/O primitives in source',()=>{
  const src=readFileSync(new URL('../src/r6k-bounded-docker-frame-decoder.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^\s*import\b/m);
  assert.doesNotMatch(src,/\b(?:fetch|spawn|child_process|readFileSync|writeFileSync|createServer|createConnection|http\.request|https\.request|Dockerode)\b/);
  assert.doesNotMatch(src,/docker\.sock|host\.docker\.internal|docker\.exe|f5solucoes\.net/);
});

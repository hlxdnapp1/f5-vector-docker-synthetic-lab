import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createR7BSyntheticStream} from '../src/r7b-bounded-synthetic-stream.mjs';

const ID='a'.repeat(64);
const NAME='r7b-synthetic-fixture';
const MARKER='R7B_PUBLIC_SYNTHETIC_ONLY';
const ts='2026-11-16T20:04:10.123456789Z';
const event=(overrides={})=>({Type:'container',Action:'start',Actor:{ID,Attributes:{name:NAME}},time:1794860000,timeNano:'1794860000000000000',...overrides});
const ev=(obj=event())=>Buffer.from(JSON.stringify(obj)+'\n');
const frame=(line=`${ts} ${MARKER}\n`,channel=1)=>{
  const payload=Buffer.isBuffer(line)?line:Buffer.from(line);
  const head=Buffer.alloc(8);head[0]=channel;head.writeUInt32BE(payload.length,4);
  return Buffer.concat([head,payload]);
};
const get=(kind)=>createR7BSyntheticStream(kind);

test('R7B-01 rejects unknown mode',()=>assert.throws(()=>get('UNKNOWN'),/KIND/));
test('R7B-02 EVENTS valid synthetic identity and Attributes',()=>{
  const d=get('EVENTS');d.push(ev());const out=d.take()[0];
  assert.deepEqual(JSON.parse(out.toString()),event());assert.equal(d.finish().state,'ENDED');
});
test('R7B-03 EVENTS accepts every one-byte fragmentation',()=>{
  const d=get('EVENTS');for(const b of ev())d.push(Buffer.from([b]));
  assert.deepEqual(d.take(),[ev()]);assert.equal(d.finish().records,1);
});
test('R7B-04 EVENTS accepts multiple records with exact ordering',()=>{
  const d=get('EVENTS'), a=ev(),b=ev(event({Action:'die'}));
  d.push(Buffer.concat([a,b]));assert.deepEqual(d.take(),[a,b]);d.finish();
});
test('R7B-05 EVENTS denies foreign ID and foreign name',()=>{
  for(const bad of [event({Actor:{ID:'b'.repeat(64),Attributes:{name:NAME}}}),
    event({Actor:{ID,Attributes:{name:'outsider'}}})]) {
    const d=get('EVENTS');assert.throws(()=>d.push(ev(bad)),/EVENT_IDENTITY/);
    assert.equal(d.status().state,'FAILED');assert.equal(d.status().pending,0);
  }
});
test('R7B-06 EVENTS refuses missing Attributes, extra fields and unknown action',()=>{
  const bad=[event({Actor:{ID}}),event({secret:'SENSITIVE'}),event({Action:'destroy'}),
    event({Type:'image'}),event({Actor:{ID,Attributes:{name:NAME,secret:'x'}}})];
  for(const e of bad)assert.throws(()=>get('EVENTS').push(ev(e)),/EVENT_IDENTITY/);
});
test('R7B-07 EVENTS nanoseconds match seconds exactly',()=>{
  for(const bad of ['1','1794860001000000000','179486000000000000X'])
    assert.throws(()=>get('EVENTS').push(ev(event({timeNano:bad}))),/EVENT_IDENTITY/);
});
test('R7B-08 EVENTS strict utf8 and invalid JSON fail closed',()=>{
  for(const b of [Buffer.from([0xc3,0x28,10]),Buffer.from('null\n'),Buffer.from('{broken\n')])
    assert.throws(()=>get('EVENTS').push(b),/EVENT_JSON_OR_UTF8|EVENT_IDENTITY/);
});
test('R7B-09 EVENTS no unvalidated output if later event in same push invalid',()=>{
  const d=get('EVENTS');assert.throws(()=>d.push(Buffer.concat([ev(),ev(event({Action:'restart'}))])),/EVENT_IDENTITY/);
  assert.equal(d.status().pending,0);assert.throws(()=>d.take(),/NOT_READABLE/);
});
test('R7B-10 EVENTS oversized undelimited record fails before release',()=>{
  const d=get('EVENTS');assert.throws(()=>d.push(Buffer.alloc(769,65)),/EVENT_LENGTH/);
  assert.equal(d.status().state,'FAILED');
});
test('R7B-11 LOGS handles every byte splitting',()=>{
  const f=frame();for(let cut=1;cut<f.length;cut++){
    const d=get('LOGS');d.push(f.subarray(0,cut));d.push(f.subarray(cut));
    assert.deepEqual(d.take(),[f]);assert.equal(d.finish().records,1);
  }
});
test('R7B-12 LOGS accepts stdout/stderr and nine-nanosecond UTC',()=>{
  const d=get('LOGS'),a=frame(),b=frame(`2026-11-16T20:04:11.000000001Z ${MARKER}\n`,2);
  d.push(Buffer.concat([a,b]));assert.deepEqual(d.take(),[a,b]);d.finish();
});
test('R7B-13 LOGS accepts valid 0/3 fractional UTC',()=>{
  for(const v of ['2026-11-16T20:04:10Z','2026-11-16T20:04:10.123Z']){
    const f=frame(`${v} ${MARKER}\n`),d=get('LOGS');d.push(f);assert.deepEqual(d.take(),[f]);d.finish();
  }
});
test('R7B-14 LOGS refuses unknown channel and reserved header bytes',()=>{
  for(const ch of [0,3,255])assert.throws(()=>get('LOGS').push(frame(undefined,ch)),/LOG_HEADER/);
  for(const i of [1,2,3]){const f=frame();f[i]=1;assert.throws(()=>get('LOGS').push(f),/LOG_HEADER/);}
});
test('R7B-15 LOGS refuses zero and oversized payload length',()=>{
  for(const n of [0,513]){const h=Buffer.alloc(8);h[0]=1;h.writeUInt32BE(n,4);
    assert.throws(()=>get('LOGS').push(h),/LOG_FRAME_LENGTH/);}
});
test('R7B-16 LOGS forbids foreign text, bad date, malformed timestamp',()=>{
  for(const text of [`${ts} PRIVATE_VALUE\n`,`2026-02-30T20:04:10.123Z ${MARKER}\n`,
    `2026-11-16T20:04:10.1234567890Z ${MARKER}\n`])
    assert.throws(()=>get('LOGS').push(frame(text)),/LOG_MARKER_OR_TIME/);
});
test('R7B-17 LOGS invalid utf8 is fatal',()=>{
  assert.throws(()=>get('LOGS').push(frame(Buffer.from([0xc3,0x28]))),/LOG_UTF8/);
});
test('R7B-18 LOGS later malicious frame in same push suppresses all output',()=>{
  const d=get('LOGS');assert.throws(()=>d.push(Buffer.concat([frame(),frame(`${ts} RAW_LEAK\n`)])),/LOG_MARKER_OR_TIME/);
  assert.equal(d.status().pending,0);
});
test('R7B-19 EOF incomplete event, log header or payload is not success',()=>{
  for(const [kind,data] of [['EVENTS',ev().subarray(0,10)],['LOGS',frame().subarray(0,5)],['LOGS',frame().subarray(0,frame().length-1)]]){
    const d=get(kind);d.push(data);assert.throws(()=>d.finish(),/TRUNCATED_OR_EMPTY/);assert.equal(d.status().state,'FAILED');
  }
});
test('R7B-20 cancel wipes buffers and forbids further writes, idempotent',()=>{
  const d=get('LOGS');d.push(frame().subarray(0,12));assert.equal(d.cancel().buffered,0);
  assert.equal(d.cancel().state,'CANCELLED');assert.throws(()=>d.push(frame()),/NOT_ACTIVE/);
});
test('R7B-21 invalid and oversized chunk fails closed',()=>{
  for(const x of [null,'string',Buffer.alloc(0),Buffer.alloc(2049)]){
    const d=get('LOGS');assert.throws(()=>d.push(x),/CHUNK/);assert.equal(d.status().state,'FAILED');
  }
});
test('R7B-22 window backpressure refuses input without consuming',()=>{
  const d=get('LOGS'),seven=Buffer.concat(Array.from({length:7},()=>frame()));
  d.push(seven);const st=d.status();
  assert.throws(()=>d.push(Buffer.concat([frame(),frame()])),/BACKPRESSURE/);
  assert.deepEqual(d.status(),st);
  assert.equal(d.take(3).length,3);d.push(Buffer.concat([frame(),frame()]));
  assert.equal(d.take().length,6);d.finish();
});
test('R7B-23 100 records pass in bounded batches; 101st fails closed',()=>{
  const d=get('LOGS');for(let n=0;n<12;n++){d.push(Buffer.concat(Array.from({length:8},()=>frame())));d.take();}
  d.push(Buffer.concat(Array.from({length:4},()=>frame())));d.take();
  assert.equal(d.status().records,100);
  assert.throws(()=>d.push(frame()),/RECORD_LIMIT/);assert.equal(d.status().state,'FAILED');
});
test('R7B-24 finish retains safe output; subsequent push prohibited',()=>{
  const d=get('LOGS'),f=frame();d.push(f);d.finish();assert.deepEqual(d.take(),[f]);
  assert.throws(()=>d.push(frame()),/NOT_ACTIVE/);
});
test('R7B-25 returned frames are copies and limit parameters validated',()=>{
  const d=get('LOGS'),f=frame();d.push(f);
  for(const v of [0,-1,9,NaN,1.5])assert.throws(()=>d.take(v),/TAKE_LIMIT/);
  const got=d.take(1)[0];got.fill(0);assert.equal(d.status().pending,0);d.finish();
});
test('R7B-26 source is offline-only and never opens network, files or Docker client',()=>{
  const src=readFileSync(new URL('../src/r7b-bounded-synthetic-stream.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^\s*import\s/m);
  assert.doesNotMatch(src,/\b(?:fetch|spawn|child_process|createServer|createConnection|readFileSync|writeFileSync|Dockerode)\b/);
  assert.doesNotMatch(src,/host\.docker\.internal|docker\.sock|f5solucoes\.net|github_pat_/);
});

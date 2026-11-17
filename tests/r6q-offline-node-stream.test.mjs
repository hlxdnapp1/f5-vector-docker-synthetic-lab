import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import {R6QOfflineChunks,R6QOfflineSink,pumpR6QOffline} from '../src/r6q-offline-node-stream.mjs';

const ALIAS = 'a'.repeat(64), ID = 'c'.repeat(64);
const name = 'r6g-synthetic-ffffffff';
const event = (action='start',patch={}) => Buffer.from(JSON.stringify({Type:'container',Action:action,
  Actor:{ID:ALIAS,Attributes:{name}},time:1900000000,...patch})+'\n');
const frame = (ts='2026-11-16T20:48:31.123456789Z',channel=1,marker='R6F_PUBLIC_SYNTHETIC_ONLY')=>{
  const bytes=Buffer.from(ts+' '+marker+'\n'),h=Buffer.alloc(8);
  h[0]=channel;h.writeUInt32BE(bytes.length,4);return Buffer.concat([h,bytes]);
};
const split=(b,n)=>Array.from({length:Math.ceil(b.length/n)},(_,i)=>b.subarray(i*n,(i+1)*n));
const sample = (kind='EVENTS',chunks=kind==='EVENTS'?[event(),event('die')]:[frame(),frame(undefined,2)])=>
  new R6QOfflineChunks(kind,chunks);
const execute=async (s=sample(),sink=new R6QOfflineSink(),opts={})=>{
  const result=await pumpR6QOffline(s,sink,opts);return {result,sink,bytes:sink.bytes()};
};
const parsedEvents = b => b.toString().trim().split('\n').map(JSON.parse);

// Native unit tests run without external files, daemons, sockets, or HTTP listeners.
test('R6Q-01 owned chunks and owned Node Writable accepted',async()=>{
  const {result,bytes,sink}=await execute();assert.deepEqual(result,{ok:true,kind:'EVENTS',frames:2,bytes:bytes.length});
  assert.deepEqual(parsedEvents(bytes).map(e=>e.Action),['start','die']);
  assert.equal(sink.status().parts,2);
});
test('R6Q-02 in-memory frames preserve original stdout/stderr channel and timestamp',async()=>{
  const original=Buffer.concat([frame(),frame(undefined,2)]),{result,bytes}=await execute(sample('LOGS',split(original,1)));
  assert.equal(result.frames,2);assert.deepEqual(bytes,original);
});
test('R6Q-03 bytewise NDJSON fragments reconstruct only complete records',async()=>{
  const b=event();const {bytes}=await execute(sample('EVENTS',split(b,1)));
  assert.deepEqual(parsedEvents(bytes).map(e=>e.Action),['start']);
});
test('R6Q-04 combined event records in one chunk both validated',async()=>{
  const x=Buffer.concat([event(),event('pause')]);const {bytes}=await execute(sample('EVENTS',[x]));
  assert.equal(parsedEvents(bytes).length,2);
});
test('R6Q-05 same-chunk malicious second event releases no first event',async()=>{
  const s=sample('EVENTS',[Buffer.concat([event(),event('die',{extra:'SECRET_CANARY'})])]),sink=new R6QOfflineSink();
  await assert.rejects(pumpR6QOffline(s,sink),/R6Q_BLOCKED_STREAM_ABORTED/);assert.equal(sink.bytes().length,0);
});
test('R6Q-06 valid prior chunk cannot be revoked after later invalid chunk',async()=>{
  const sink=new R6QOfflineSink(),s=sample('EVENTS',[event(),event('die',{extra:'SECRET_CANARY'})]);
  await assert.rejects(pumpR6QOffline(s,sink),/STREAM_ABORTED/);
  assert.equal(parsedEvents(sink.bytes()).length,1);assert.equal(s.status().closed,true);
});
test('R6Q-07 foreign real container ID denied without leak',async()=>{
  const bad=event('start',{Actor:{ID,Attributes:{name}}}),sink=new R6QOfflineSink();
  await assert.rejects(pumpR6QOffline(sample('EVENTS',[bad]),sink),/STREAM_ABORTED/);
  assert.equal(sink.bytes().length,0);
});
test('R6Q-08 arbitrary Actor.Attributes secrets denied',async()=>{
  const bad=event('start',{Actor:{ID:ALIAS,Attributes:{name,SECRET_CANARY:'x'}}});
  await assert.rejects(execute(sample('EVENTS',[bad])),/STREAM_ABORTED/);
});
test('R6Q-09 invalid JSON and invalid UTF-8 denied',async()=>{
  for(const bad of [Buffer.from('{\n'),Buffer.from([0xff,10])]) {
    await assert.rejects(execute(sample('EVENTS',[bad])),/STREAM_ABORTED/);
  }
});
test('R6Q-10 missing newline and empty stream denied',async()=>{
  await assert.rejects(execute(sample('EVENTS',[Buffer.from(event().subarray(0,-1))])),/STREAM_ABORTED/);
});
test('R6Q-11 invalid action, type, time, attributes rejected',async()=>{
  const bads=[{Action:'exec'},{Type:'service'},{time:-1},
    {Actor:{ID:ALIAS,Attributes:{name:'private-host'}}}];
  for(const patch of bads) await assert.rejects(execute(sample('EVENTS',[event('start',patch)])),/STREAM_ABORTED/);
});
test('R6Q-12 oversized event record denied before output',async()=>{
  const huge=Buffer.concat([Buffer.from('{"x":"'),Buffer.alloc(1200,65),Buffer.from('"}\n')]);
  await assert.rejects(execute(sample('EVENTS',[huge])),/STREAM_ABORTED/);
});
test('R6Q-13 invalid multiplex header and channel denied',async()=>{
  const bads=[Buffer.from(frame()),Buffer.from(frame())];bads[0][0]=3;bads[1][3]=1;
  for(const bad of bads) await assert.rejects(execute(sample('LOGS',[bad])),/STREAM_ABORTED/);
});
test('R6Q-14 malformed frame size and incomplete frame denied',async()=>{
  const x=Buffer.from(frame()),y=Buffer.from(frame());x.writeUInt32BE(513,4);
  await assert.rejects(execute(sample('LOGS',[x])),/STREAM_ABORTED/);
  await assert.rejects(execute(sample('LOGS',[y.subarray(0,-2)])),/STREAM_ABORTED/);
});
test('R6Q-15 malicious payload and invalid UTF-8 denied',async()=>{
  const bad=frame(undefined,1,'SECRET_CANARY'),utf=Buffer.from(frame());utf[utf.length-2]=0xff;
  for(const b of [bad,utf]) await assert.rejects(execute(sample('LOGS',[b])),/STREAM_ABORTED/);
});
test('R6Q-16 invalid timestamp is rejected',async()=>{
  await assert.rejects(execute(sample('LOGS',[frame('2026-13-35T20:48:31Z')])),/STREAM_ABORTED/);
});
test('R6Q-17 same-chunk malformed second frame blocks first',async()=>{
  const good=frame(),bad=frame(undefined,2,'SECRET_CANARY'),sink=new R6QOfflineSink();
  await assert.rejects(pumpR6QOffline(sample('LOGS',[Buffer.concat([good,bad])]),sink),/STREAM_ABORTED/);
  assert.equal(sink.bytes().length,0);
});
test('R6Q-18 no arbitrary iterator or unbranded Writable accepted',async()=>{
  const sink=new Writable({write(x,e,cb){cb();}});
  await assert.rejects(pumpR6QOffline(sample(),sink),/PUMP_SCOPE/);
  await assert.rejects(pumpR6QOffline({async *[Symbol.asyncIterator](){yield event();}},new R6QOfflineSink()),/PUMP_SCOPE/);
  sink.destroy();
});
test('R6Q-19 fake source scope and chunk size enforce quotas',()=>{
  for(const t of [[],[Buffer.alloc(0)],[Buffer.alloc(2049)],Array.from({length:513},()=>Buffer.from('x'))])
    assert.throws(()=>new R6QOfflineChunks('EVENTS',t),/R6Q_BLOCKED_SOURCE_/);
  assert.throws(()=>new R6QOfflineChunks('OTHER',[event()]),/SOURCE_SCOPE/);
});
test('R6Q-20 source one-shot and zeroized on completion',async()=>{
  const s=sample();await execute(s);assert.equal(s.status().closed,true);
  await assert.rejects(pumpR6QOffline(s,new R6QOfflineSink()),/PUMP_SCOPE/);
});
test('R6Q-21 fake source pull failure sanitized and closes sink',async()=>{
  const s=new R6QOfflineChunks('EVENTS',[event()],{failOnPull:1}),sink=new R6QOfflineSink();
  await assert.rejects(pumpR6QOffline(s,sink),/STREAM_ABORTED/);
  assert.equal(s.status().closed,true);assert.equal(sink.destroyed,true);
});
test('R6Q-22 pre-aborted session never pulls fake source',async()=>{
  const ctl=new AbortController();ctl.abort();const s=sample(),sink=new R6QOfflineSink();
  await assert.rejects(pumpR6QOffline(s,sink,{signal:ctl.signal}),/STREAM_ABORTED/);
  assert.equal(s.status().pulled,0);
});
test('R6Q-23 backpressure truly stops pulling source until sink releases',async()=>{
  const s=sample(),sink=new R6QOfflineSink();sink.hold();
  const p=pumpR6QOffline(s,sink,{drainTimeoutMs:5000});
  for(let i=0;i<30&&sink.status().parts===0;i++) await new Promise(r=>setImmediate(r));
  assert.equal(sink.status().parts,1);assert.equal(s.status().pulled,1);
  await Promise.resolve();await Promise.resolve();assert.equal(s.status().pulled,1);
  sink.release();const result=await p;assert.equal(result.frames,2);
});
test('R6Q-24 held sink timeout fails closed, no second fake pull',async()=>{
  const s=sample(),sink=new R6QOfflineSink();sink.hold();
  await assert.rejects(pumpR6QOffline(s,sink,{drainTimeoutMs:15}),/STREAM_ABORTED/);
  assert.equal(s.status().pulled,1);assert.equal(s.status().closed,true);
});
test('R6Q-25 cancellation during backpressure fails safely',async()=>{
  const ctl=new AbortController(),s=sample(),sink=new R6QOfflineSink();sink.hold();
  const p=pumpR6QOffline(s,sink,{signal:ctl.signal});
  for(let i=0;i<30&&sink.status().parts===0;i++) await new Promise(r=>setImmediate(r));
  ctl.abort();await assert.rejects(p,/STREAM_ABORTED/);assert.equal(s.status().pulled,1);
});
test('R6Q-26 elapsed clock deadline fails before release',async()=>{
  const s=sample(),sink=new R6QOfflineSink();let time=0;
  await assert.rejects(pumpR6QOffline(s,sink,{deadlineMs:1,clock:()=>time+=100}),/STREAM_ABORTED/);
});
test('R6Q-27 invalid runtime configuration denied',async()=>{
  for(const opts of [{deadlineMs:0},{drainTimeoutMs:0},{signal:{}},{clock:null}])
    await assert.rejects(pumpR6QOffline(sample(),new R6QOfflineSink(),opts),/PUMP_SCOPE/);
});
test('R6Q-28 static guard: no Docker/network/filesystem/process side effects',()=>{
  const src=readFileSync(new URL('../src/r6q-offline-node-stream.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/from ['"]node:(?:http|https|net|tls|fs|child_process)/);
  assert.doesNotMatch(src,/docker\.sock|host\.docker\.internal|2375|createServer\s*\(|fetch\s*\(|spawn\s*\(/);
});

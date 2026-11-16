import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OfflineR6LChunks, relayR6LOffline } from '../src/r6l-offline-pull-relay.mjs';

const marker='R6F_PUBLIC_SYNTHETIC_ONLY';
const line=(s='2026-11-16T20:11:00.123456789Z')=>s+' '+marker+'\n';
const frame=(s=line(),channel=1)=>{
  const body=Buffer.from(s),head=Buffer.alloc(8);
  head[0]=channel;head.writeUInt32BE(body.length,4);
  return Buffer.concat([head,body]);
};
const one=frame();
const source=chunks=>new OfflineR6LChunks(chunks);
const consume=async (s,options)=>{
  const output=[];
  for await(const frame of relayR6LOffline(s,options)) output.push(frame);
  return output;
};
const split=(buf,n)=>{
  const parts=[];
  for(let i=0;i<buf.length;i+=n)parts.push(buf.subarray(i,i+n));
  return parts;
};

test('R6L-01 refuses caller-supplied arbitrary async iterable before pulling',async()=>{
  let calls=0;
  const hostile={async *[Symbol.asyncIterator](){calls++;yield one;}};
  await assert.rejects(consume(hostile),/R6L_BLOCKED_RELAY_SCOPE/);
  assert.equal(calls,0);
});
test('R6L-02 refuses subclass of fake source as potential transport override',async()=>{
  class Alternate extends OfflineR6LChunks {}
  await assert.rejects(consume(new Alternate([one])),/R6L_BLOCKED_RELAY_SCOPE/);
});
test('R6L-03 source copies input buffers and never reflects later caller mutation',async()=>{
  const mutable=Buffer.from(one),s=source([mutable]);
  mutable.fill(65);
  assert.deepEqual(await consume(s),[one]);
  assert.equal(s.status().closed,true);
});
test('R6L-04 accepts one framed UTC RFC3339Nano log and closes fake producer',async()=>{
  const s=source([one]);
  assert.deepEqual(await consume(s),[one]);
  assert.equal(s.status().pulled,1);
  assert.equal(s.status().remaining,0);
  assert.equal(s.status().closed,true);
});
test('R6L-05 handles a header split at every possible single boundary',async()=>{
  for(let cut=1;cut<8;cut++){
    const s=source([one.subarray(0,cut),one.subarray(cut)]);
    assert.deepEqual(await consume(s),[one]);
  }
});
test('R6L-06 handles one-byte chunks across entire header and payload',async()=>{
  const s=source(split(one,1));
  assert.deepEqual(await consume(s),[one]);
  assert.equal(s.status().pulled,one.length);
});
test('R6L-07 multiplexed stdout/stderr frames preserve order',async()=>{
  const b=frame(line('2026-11-16T20:11:01.987654321Z'),2);
  assert.deepEqual(await consume(source(split(Buffer.concat([one,b]),13))),[one,b]);
});
test('R6L-08 does not poll fake source again while consumer holds first result',async()=>{
  const s=source([one,one]),it=relayR6LOffline(s);
  const a=await it.next();
  assert.equal(a.done,false);assert.deepEqual(a.value,one);
  assert.equal(s.status().pulled,1);
  await Promise.resolve();await Promise.resolve();
  assert.equal(s.status().pulled,1);
  const b=await it.next();assert.deepEqual(b.value,one);
  assert.equal(s.status().pulled,2);
  await it.return();assert.equal(s.status().closed,true);
});
test('R6L-09 output queue does not cause extra upstream pulls until drained',async()=>{
  const pack=Buffer.concat(Array.from({length:8},()=>one));
  const s=source([pack,one]),it=relayR6LOffline(s);
  for(let n=0;n<8;n++){
    assert.deepEqual((await it.next()).value,one);
    assert.equal(s.status().pulled,1);
  }
  assert.deepEqual((await it.next()).value,one);
  assert.equal(s.status().pulled,2);
  await it.return();
});
test('R6L-10 consumer break sends return and closes upstream fake source',async()=>{
  const s=source([one,one,one]);
  for await(const b of relayR6LOffline(s)){
    assert.deepEqual(b,one);break;
  }
  assert.equal(s.status().closed,true);assert.equal(s.status().pulled,1);
});
test('R6L-11 cancel before first pull denies and wipes fake buffers',async()=>{
  const controller=new AbortController(),s=source([one]);
  controller.abort();
  await assert.rejects(consume(s,{signal:controller.signal}),/R6L_BLOCKED_CANCELLED/);
  assert.equal(s.status().closed,true);assert.equal(s.status().pulled,0);
});
test('R6L-12 abort after first output denies further pull, closes source',async()=>{
  const controller=new AbortController(),s=source([one,one]);
  const it=relayR6LOffline(s,{signal:controller.signal});
  assert.deepEqual((await it.next()).value,one);
  controller.abort();
  await assert.rejects(it.next(),/R6L_BLOCKED_CANCELLED/);
  assert.equal(s.status().pulled,1);assert.equal(s.status().closed,true);
});
test('R6L-13 injected upstream failure never leaks raw source error text',async()=>{
  const s=new OfflineR6LChunks([one],{failOnPull:1});
  await assert.rejects(consume(s),e=>{
    assert.match(e.message,/R6L_BLOCKED_SOURCE_FAILURE/);
    assert.doesNotMatch(e.message,/UPSTREAM_SECRET_CANARY/);
    return true;
  });
  assert.equal(s.status().closed,true);
});
test('R6L-14 bad first log marker causes no output and sanitized failure',async()=>{
  const s=source([frame('2026-11-16T20:11:00.123456789Z SECRET_CANARY\n')]);
  await assert.rejects(consume(s),e=>{
    assert.equal(e.message,'R6L_BLOCKED_FRAME_OR_SIZE');return true;
  });
  assert.equal(s.status().closed,true);
});
test('R6L-15 bad second frame in same push prevents earlier frame release',async()=>{
  const s=source([Buffer.concat([one,frame('SECRET_CANARY\n')])]);
  const it=relayR6LOffline(s);
  await assert.rejects(it.next(),/R6L_BLOCKED_FRAME_OR_SIZE/);
  assert.equal(s.status().closed,true);
});
test('R6L-16 good earlier chunk may be consumed; later corruption still fails closed',async()=>{
  const s=source([one,frame('SECRET_CANARY\n')]),it=relayR6LOffline(s);
  assert.deepEqual((await it.next()).value,one);
  await assert.rejects(it.next(),e=>{
    assert.equal(e.message,'R6L_BLOCKED_FRAME_OR_SIZE');return true;
  });
  assert.equal(s.status().closed,true);
});
test('R6L-17 invalid RFC3339Nano calendar date rejected and source closed',async()=>{
  const s=source([frame(line('2026-02-29T20:11:00.123456789Z'))]);
  await assert.rejects(consume(s),/R6L_BLOCKED_FRAME_OR_SIZE/);
  assert.equal(s.status().closed,true);
});
test('R6L-18 incomplete EOF frame fails, while an empty producer completes',async()=>{
  await assert.rejects(consume(source([one.subarray(0,one.length-1)])),/R6L_BLOCKED_TRUNCATED_OR_FRAME/);
  assert.deepEqual(await consume(source([])),[]);
});
test('R6L-19 exactly 100 bounded frames are relayed in order',async()=>{
  const chunks=Array.from({length:10},()=>Buffer.concat(Array.from({length:10},()=>one)));
  const s=source(chunks);const output=await consume(s);
  assert.equal(output.length,100);
  assert.ok(output.every(x=>x.equals(one)));
});
test('R6L-20 frame 101 fails instead of accepting an unbounded stream',async()=>{
  const chunks=Array.from({length:10},()=>Buffer.concat(Array.from({length:10},()=>one)));
  chunks.push(one);const s=source(chunks);
  await assert.rejects(consume(s),/R6L_BLOCKED_FRAME_OR_SIZE/);
  assert.equal(s.status().closed,true);
});
test('R6L-21 construction rejects invalid chunks, oversized inputs and excessive count',()=>{
  for(const bad of [ ['raw'],[Buffer.alloc(0)],[Buffer.alloc(2049)],
    Array.from({length:513},()=>Buffer.from([1])),
    Array.from({length:40},()=>Buffer.alloc(2048)) ]) {
    assert.throws(()=>source(bad),/R6L_BLOCKED_SOURCE_/);
  }
});
test('R6L-22 cooperative chunk-count and elapsed-time guards fail closed',async()=>{
  await assert.rejects(consume(source([one,one]),{maxChunks:1}),/R6L_BLOCKED_CHUNK_COUNT/);
  const s=source([one]);let t=0;
  await assert.rejects(consume(s,{clock:()=>{t+=100;return t;},maxElapsedMs:250}),/R6L_BLOCKED_DEADLINE/);
  assert.equal(s.status().closed,true);
});
test('R6L-23 invalid options, clock regressions and source reuse are blocked',async()=>{
  for(const opts of [{maxChunks:0},{maxElapsedMs:40000},{clock:null},{signal:{}}]){
    await assert.rejects(consume(source([one]),opts),/R6L_BLOCKED_RELAY_SCOPE/);
  }
  const times=[50,40];
  await assert.rejects(consume(source([one]),{clock:()=>times.shift()??40}),/R6L_BLOCKED_DEADLINE/);
  const s=source([one]);await consume(s);
  await assert.rejects(consume(s),/R6L_BLOCKED_SOURCE_REUSED/);
});
test('R6L-24 source contains no Docker, HTTPS, sockets, filesystem or subprocess calls',()=>{
  const src=readFileSync(new URL('../src/r6l-offline-pull-relay.mjs',import.meta.url),'utf8');
  assert.match(src,/import \{ createR6KDecoder \} from '\.\/r6k-bounded-docker-frame-decoder\.mjs'/);
  assert.doesNotMatch(src,/(?:from|require\()\s*['"]node:(?:http|https|net|tls|fs|child_process)/);
  assert.doesNotMatch(src,/\b(?:fetch|createServer|createConnection|execFile|spawn|writeFileSync|Dockerode)\s*\(/);
  assert.doesNotMatch(src,/docker\.sock|host\.docker\.internal|f5solucoes\.net/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {R6OOfflineScenario} from '../src/r6o-offline-vector-session.mjs';
import {makeR6NFixture,planR6NVectorGet} from '../src/r6n-vector-v053-contract.mjs';
const id='c'.repeat(64),alias='a'.repeat(64),foreign='d'.repeat(64);
const nonce='f'.repeat(32),nowSec=1900000000,name='r6g-synthetic-'+nonce.slice(0,8);
const manifest='docker.io/library/busybox@sha256:'+'e'.repeat(64);
const cfg='sha256:'+'b'.repeat(64);
const spec=makeR6NFixture({id,nonce,runId:33,nowSec,imageRef:manifest,imageConfigId:cfg});
const labels=()=>({'f5.synthetic.lab':'R6G_ONLY','f5.synthetic.nonce':nonce,
  'f5.synthetic.run':'33','f5.synthetic.role':'authorized'});
const list=()=>[{Id:id,Names:['/'+name],Labels:labels(),Env:['SECRET_CANARY'],Image:'private/image'},
  {Id:foreign,Names:['/outsider'],Env:['SECRET_CANARY']}];
const inspect=()=>({Id:id,Name:'/'+name,Image:cfg,
  Created:new Date((nowSec-2)*1000).toISOString(),RestartCount:0,
  Config:{Image:manifest,Labels:labels(),User:'10001:10001',Tty:false,Env:['SECRET_CANARY']},
  State:{Running:true},Mounts:[],HostConfig:{Privileged:false,NetworkMode:'none',
    ReadonlyRootfs:true,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],
    Memory:67108864,NanoCpus:500000000,PidsLimit:32,RestartPolicy:{Name:'no'},
    AutoRemove:true,Binds:[]}});
const event=(action='start')=>({Type:'container',Action:action,
  Actor:{ID:id,Attributes:{name,SECRET_CANARY:'private'}},time:nowSec});
const frame=(time='2026-11-16T20:48:31.123456789Z',channel=1,text='R6F_PUBLIC_SYNTHETIC_ONLY')=>{
  const b=Buffer.from(time+' '+text+'\n'),head=Buffer.alloc(8);
  head[0]=channel;head.writeUInt32BE(b.length,4);
  return Buffer.concat([head,b]);
};
const f1=frame(),f2=frame('2026-11-16T20:48:32.987654321Z',2);
const split=(b,n)=>Array.from({length:Math.ceil(b.length/n)},(_,i)=>b.subarray(i*n,(i+1)*n));
const scenario=(opts={})=>new R6OOfflineScenario({spec,list:list(),inspect:inspect(),
  events:[event(),event('die')],logChunks:split(Buffer.concat([f1,f2]),8),...opts});
const get=target=>({method:'GET',target});
const route={list:'/containers/json?all=false&filters=%7B%7D',
  inspect:'/containers/'+alias+'/json',
  events:'/events?since='+nowSec+'&until=0',
  logs:'/containers/'+alias+'/logs?follow=true&stdout=true&stderr=true&since='+nowSec+'&timestamps=true'};
const bytes=async response=>{const chunks=[];for await(const b of response.bytes())chunks.push(b);return Buffer.concat(chunks)};
const silent=x=>assert.doesNotMatch(JSON.stringify(x),/SECRET_CANARY|private\/image|outsider|"c{64}"|"d{64}"/);

test('R6O-01 scenario accepts only verified owned synthetic list/inspect/events',()=>{
  const s=scenario();assert.equal(R6OOfflineScenario.isOffline(s),true);
  assert.equal(s.status().closed,false);s.close();assert.equal(s.status().closed,true);
});
test('R6O-02 invalid scenario missing canonical owner fails before any bytes',()=>{
  for(const patch of [{list:[]},{inspect:{...inspect(),Image:'sha256:'+'0'.repeat(64)}},
    {events:[]},{events:Array.from({length:17},()=>event())}]){
    assert.throws(()=>scenario(patch),/R6O_BLOCKED_SCENARIO_PROOF/);
  }
});
test('R6O-03 malicious arbitrary async iterable is not accepted as log source',()=>{
  assert.throws(()=>scenario({logChunks:{async *[Symbol.asyncIterator](){yield f1;}}}),/SCENARIO_PROOF/);
});
test('R6O-04 client POST or outsider ID blocked without a transport side effect',()=>{
  const s=scenario();for(const req of [{method:'POST',target:'/_ping'},get('/containers/'+foreign+'/json'),get('//daemon')]){
    assert.throws(()=>s.open(req),/R6O_BLOCKED_REQUEST/);
  }
});
test('R6O-05 synthetic list response hides outsider and sensitive source fields',async()=>{
  const s=scenario(),r=s.open(get(route.list));assert.equal(r.stream,false);
  const data=JSON.parse((await bytes(r)).toString());assert.equal(data.length,1);
  assert.equal(data[0].Id,alias);assert.deepEqual(data[0].Names,['/'+name]);silent(data);
});
test('R6O-06 synthetic inspect shape preserves only Vector-required metadata',async()=>{
  const data=JSON.parse((await bytes(scenario().open(get(route.inspect)))).toString());
  assert.equal(data.Id,alias);assert.equal(data.Config.Image,'synthetic/vector-v053-review-only');
  assert.equal(data.Config.Labels['f5.synthetic.lab'],'R6G_ONLY');
  assert.ok(Date.parse(data.Created));silent(data);
});
test('R6O-07 ping/version outputs contain no daemon data or host details',async()=>{
  const s=scenario();assert.equal((await bytes(s.open(get('/_ping')))).toString(),'OK');
  const v=JSON.parse((await bytes(s.open(get('/version')))).toString());
  assert.equal(v.Version,'0.0.0-r6o-offline');silent(v);
});
test('R6O-08 EVENT stream emits exactly two synthetic NDJSON objects',async()=>{
  const s=scenario(),r=s.open(get(route.events));assert.equal(r.stream,true);
  assert.equal(r.contentType,'application/x-ndjson');
  const records=(await bytes(r)).toString().trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(x=>x.Action),['start','die']);
  assert.ok(records.every(x=>x.Actor.ID===alias&&x.Actor.Attributes.name===name));silent(records);
});
test('R6O-09 NDJSON event bytes may fragment at one-byte boundaries, reconstruct safely',async()=>{
  const s=scenario(),response=s.open(get(route.events),{eventChunkBytes:1});
  const parts=[];for await(const b of response.bytes()){assert.equal(b.length,1);parts.push(b);}
  const rows=Buffer.concat(parts).toString().trim().split('\n');
  assert.equal(rows.length,2);assert.equal(JSON.parse(rows[0]).Actor.ID,alias);
});
test('R6O-10 event fails closed when source lacks Actor.Attributes',()=>{
  assert.throws(()=>scenario({events:[{...event(),Actor:{ID:id}}]}),/SCENARIO_PROOF/);
});
test('R6O-11 no foreign event can be accepted even when a valid event precedes it',()=>{
  assert.throws(()=>scenario({events:[event(),{...event(),Actor:{ID:foreign,Attributes:{name}}}]}),/SCENARIO_PROOF/);
});
test('R6O-12 only one session can consume a synthetic event stream',()=>{
  const s=scenario();s.open(get(route.events));assert.throws(()=>s.open(get(route.events)),/STREAM_REOPEN/);
});
test('R6O-13 logs preserve framed stdout/stderr, including chunk-split headers',async()=>{
  const s=scenario(),r=s.open(get(route.logs));assert.equal(r.stream,true);
  assert.equal(r.contentType,'application/vnd.docker.multiplexed-stream');
  assert.deepEqual(await bytes(r),Buffer.concat([f1,f2]));
  assert.equal(s.status().logSourceClosed,true);
});
test('R6O-14 single-byte source chunks are reassembled through R6K and R6L',async()=>{
  const s=scenario({logChunks:split(Buffer.concat([f1,f2]),1)});
  assert.deepEqual(await bytes(s.open(get(route.logs))),Buffer.concat([f1,f2]));
});
test('R6O-15 fake producer is not pulled again while client pauses after first log',async()=>{
  const s=scenario({logChunks:[f1,f2]}),it=s.open(get(route.logs)).bytes();
  assert.deepEqual((await it.next()).value,f1);assert.equal(s.status().logChunksPulled,1);
  await Promise.resolve();await Promise.resolve();assert.equal(s.status().logChunksPulled,1);
  assert.deepEqual((await it.next()).value,f2);assert.equal(s.status().logChunksPulled,2);
  await it.return();assert.equal(s.status().logSourceClosed,true);
});
test('R6O-16 stopped consumer closes the fake log producer promptly',async()=>{
  const s=scenario({logChunks:[f1,f2]});
  for await(const b of s.open(get(route.logs)).bytes()){assert.deepEqual(b,f1);break;}
  assert.equal(s.status().logChunksPulled,1);assert.equal(s.status().logSourceClosed,true);
  const s2=scenario({logChunks:[f1,f2]}), it=s2.open(get(route.logs)).bytes();
  assert.deepEqual((await it.next()).value,f1);
  s2.close();
  await assert.rejects(it.next(),/R6O_BLOCKED_LOG_STREAM/);
});
test('R6O-17 malicious log marker is rejected without reflecting its contents',async()=>{
  const s=scenario({logChunks:[frame(undefined,1,'SECRET_CANARY')]});
  await assert.rejects(bytes(s.open(get(route.logs))),e=>{
    assert.equal(e.message,'R6O_BLOCKED_LOG_STREAM');silent(e.message);return true;
  });
});
test('R6O-18 corrupt later frame within one fake chunk releases no partial output',async()=>{
  const s=scenario({logChunks:[Buffer.concat([f1,frame(undefined,1,'SECRET_CANARY')])]}),
    it=s.open(get(route.logs)).bytes();
  await assert.rejects(it.next(),/R6O_BLOCKED_LOG_STREAM/);
});
test('R6O-19 later corruption fails with sanitized error after prior safe output',async()=>{
  const s=scenario({logChunks:[f1,frame(undefined,1,'SECRET_CANARY')]}),it=s.open(get(route.logs)).bytes();
  assert.deepEqual((await it.next()).value,f1);
  await assert.rejects(it.next(),e=>{
    assert.equal(e.message,'R6O_BLOCKED_LOG_STREAM');return true;
  });
});
test('R6O-20 abort before first event chunk denies and yields nothing',async()=>{
  const abort=new AbortController();abort.abort();const s=scenario();
  await assert.rejects(bytes(s.open(get(route.events),{signal:abort.signal})),/R6O_BLOCKED_CANCELLED/);
});
test('R6O-21 abort after first event fragment blocks further fragments',async()=>{
  const abort=new AbortController(),s=scenario(),it=s.open(get(route.events),
    {signal:abort.signal,eventChunkBytes:1}).bytes();
  assert.equal((await it.next()).value.length,1);abort.abort();
  await assert.rejects(it.next(),/R6O_BLOCKED_CANCELLED/);
});
test('R6O-22 invalid options, clock failures and deadlines are fail closed',async()=>{
  const s=scenario();for(const options of [{eventChunkBytes:0},{eventChunkBytes:257},
    {maxElapsedMs:0},{maxElapsedMs:30001},{signal:{}}]){
    assert.throws(()=>s.open(get(route.list),options),/R6O_BLOCKED_OPTIONS/);
  }
  const times=[0,50,150];
  await assert.rejects(bytes(s.open(get(route.events),{eventChunkBytes:1,
    clock:()=>times.shift()??150,maxElapsedMs:40})),/R6O_BLOCKED_DEADLINE/);
});
test('R6O-23 response is one-shot, scenario close rejects new requests',async()=>{
  const s=scenario(),r=s.open(get(route.list));await bytes(r);
  await assert.rejects(bytes(r),/R6O_BLOCKED_RESPONSE_REUSED/);
  s.close();s.close();assert.equal(s.status().logSourceClosed,true);
  assert.throws(()=>s.open(get('/_ping')),/R6O_BLOCKED_CLOSED/);
});
test('R6O-24 R6N follow=true remains a PLAN; no real socket/daemon/import in new module',()=>{
  const upstream=planR6NVectorGet(get(route.logs),spec);
  assert.equal(upstream.inert,true);assert.equal(upstream.stream,true);
  assert.match(upstream.path,/follow=true/);
  const src=readFileSync(new URL('../src/r6o-offline-vector-session.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\b(?:fetch|createServer|createConnection|execFile|spawn|writeFileSync|Dockerode)\s*\(/);
  assert.doesNotMatch(src,/docker\.sock|host\.docker\.internal|2375|f5solucoes\.net/);
  assert.doesNotMatch(src,/from ['"]node:(?:http|https|net|tls|fs|child_process)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeR6NFixture} from '../src/r6n-vector-v053-contract.mjs';
import {R6OOfflineScenario} from '../src/r6o-offline-vector-session.mjs';
import {runR6ROffline,demonstrateR6RReplay} from '../src/r6r-offline-synthetic-bridge.mjs';

const id='c'.repeat(64),foreign='d'.repeat(64),alias='a'.repeat(64);
const nonce='f'.repeat(32),nowSec=1900000000,name='r6g-synthetic-'+nonce.slice(0,8);
const manifest='docker.io/library/busybox@sha256:'+'e'.repeat(64);
const imageConfigId='sha256:'+'b'.repeat(64);
const spec=makeR6NFixture({id,nonce,runId:33,nowSec,imageRef:manifest,imageConfigId});
const labels=()=>({'f5.synthetic.lab':'R6G_ONLY','f5.synthetic.nonce':nonce,
  'f5.synthetic.run':'33','f5.synthetic.role':'authorized'});
const list=()=>[{Id:id,Names:['/'+name],Labels:labels(),Env:['SECRET_CANARY'],Image:'secret/private'},
  {Id:foreign,Names:['/outsider'],Env:['SECRET_CANARY']}];
const inspect=()=>({Id:id,Name:'/'+name,Image:imageConfigId,
  Created:new Date((nowSec-2)*1000).toISOString(),RestartCount:0,
  Config:{Image:manifest,Labels:labels(),User:'10001:10001',Tty:false,Env:['SECRET_CANARY']},
  State:{Running:true},Mounts:[],HostConfig:{Privileged:false,NetworkMode:'none',
    ReadonlyRootfs:true,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],
    Memory:67108864,NanoCpus:500000000,PidsLimit:32,RestartPolicy:{Name:'no'},
    AutoRemove:true,Binds:[]}});
const event=(action='start')=>({Type:'container',Action:action,
  Actor:{ID:id,Attributes:{name,SECRET_CANARY:'secret'}},time:nowSec});
const frame=(ts='2026-11-16T20:48:31.123456789Z',channel=1,text='R6F_PUBLIC_SYNTHETIC_ONLY')=>{
  const bytes=Buffer.from(ts+' '+text+'\n'),head=Buffer.alloc(8);
  head[0]=channel;head.writeUInt32BE(bytes.length,4);return Buffer.concat([head,bytes]);
};
const split=(buffer,n)=>Array.from({length:Math.ceil(buffer.length/n)},(_,i)=>
  buffer.subarray(i*n,(i+1)*n));
const opts=(override={})=>({
  spec,list:list(),inspect:inspect(),events:[event(),event('die')],
  logChunks:[frame(),frame('2026-11-16T20:48:32.987654321Z',2)],
  ...override
});
const scenario=(override={})=>new R6OOfflineScenario(opts(override));
const route={
  events:{method:'GET',target:'/events?since='+nowSec+'&until=0'},
  logs:{method:'GET',target:'/containers/'+alias+'/logs?follow=true&stdout=true&stderr=true&since='+nowSec+'&timestamps=true'}
};
const run=(s=scenario(),change={})=>runR6ROffline({
  scenario:s,eventsRequest:route.events,logsRequest:route.logs,...change
});

test('R6R-01 R6O synthetic events/logs round-trip into R6Q bounded Writable',async()=>{
  const result=await run();
  assert.equal(result.result,'PASS_SYNTHETIC_FINITE_ONLY');
  assert.equal(result.events,2);assert.equal(result.logFrames,2);
  assert.ok(result.eventBytes>0&&result.logBytes>0);
});
test('R6R-02 result is payload-free and asserts no real streaming/transport',async()=>{
  const result=await run();
  assert.equal(result.checkpoint,'NONE');assert.equal(result.deduplication,'NOT_PROVEN');
  assert.equal(result.trueStreaming,false);assert.equal(result.realTransport,false);
  assert.doesNotMatch(JSON.stringify(result),/SECRET_CANARY|secret\/private|outsider|"c{64}"/);
});
test('R6R-03 recreated fake session explicitly does not deduplicate replay',async()=>{
  const result=await demonstrateR6RReplay({first:scenario(),second:scenario(),
    eventsRequest:route.events,logsRequest:route.logs});
  assert.equal(result.sessions,2);assert.equal(result.totalSyntheticEvents,4);
  assert.equal(result.totalSyntheticLogFrames,4);
  assert.equal(result.checkpoint,'NONE');assert.equal(result.networkReconnect,false);
});
test('R6R-04 identical scenario cannot pretend to be a reconnection',async()=>{
  const one=scenario();
  await assert.rejects(demonstrateR6RReplay({first:one,second:one,
    eventsRequest:route.events,logsRequest:route.logs}),/REPLAY_SCOPE/);
  one.close();
});
test('R6R-05 original session is one-shot, prevents silent replay',async()=>{
  const s=scenario();await run(s);assert.equal(s.status().closed,true);
  await assert.rejects(run(s),/R6R_BLOCKED_FLOW/);
});
test('R6R-06 rejects arbitrary fake-like object, no untrusted iterators accepted',async()=>{
  await assert.rejects(run({open(){throw Error('SECRET_CANARY')}}),/R6R_BLOCKED_SCOPE/);
});
test('R6R-07 rejects method or route outside the pinned Vector GET planner',async()=>{
  const reqs=[
    {eventsRequest:{method:'POST',target:route.events.target}},
    {logsRequest:{method:'GET',target:'/containers/'+foreign+'/logs?follow=true'}}
  ];
  for(const patch of reqs){
    const s=scenario();
    await assert.rejects(run(s,patch),/R6R_BLOCKED_FLOW/);
    assert.equal(s.status().closed,true);
  }
});
test('R6R-08 event and log request kinds cannot be interchanged',async()=>{
  await assert.rejects(run(scenario(),{eventsRequest:route.logs}),/R6R_BLOCKED_FLOW/);
});
test('R6R-09 quota and signal scope are checked before first read',async()=>{
  for(const patch of [{limitBytes:0},{limitBytes:65537},{signal:{}}])
    await assert.rejects(run(scenario(),patch),/R6R_BLOCKED_SCOPE/);
});
test('R6R-10 pre-aborted session produces sanitized failure and closes fake source',async()=>{
  const signal=new AbortController();signal.abort();
  const s=scenario();
  await assert.rejects(run(s,{signal:signal.signal}),/R6R_BLOCKED_FLOW/);
  assert.equal(s.status().closed,true);
});
test('R6R-11 small quota fails closed without a partially approved summary',async()=>{
  const s=scenario();await assert.rejects(run(s,{limitBytes:5}),/R6R_BLOCKED_FLOW/);
  assert.equal(s.status().closed,true);
});
test('R6R-12 invalid log marker in fake R6O source fails without secret reflection',async()=>{
  const s=scenario({logChunks:[frame(undefined,1,'SECRET_CANARY')]});
  await assert.rejects(run(s),e=>e.message==='R6R_BLOCKED_FLOW');
  assert.equal(s.status().closed,true);
});
test('R6R-13 byte-fragmented mux frames remain valid across R6O-R6Q bridge',async()=>{
  const chunks=split(Buffer.concat([frame(),frame(undefined,2)]),1);
  const x=await run(scenario({logChunks:chunks}));
  assert.equal(x.logFrames,2);
});
test('R6R-14 malformed late mux frame denies entire bridge result',async()=>{
  const chunks=[frame(),frame(undefined,2,'SECRET_CANARY')];
  await assert.rejects(run(scenario({logChunks:chunks})),/R6R_BLOCKED_FLOW/);
});
test('R6R-15 scenario must prevalidate all foreign/malformed events before release',()=>{
  assert.throws(()=>scenario({events:[event(),{...event('die'),
    Actor:{ID:foreign,Attributes:{name}}}]}),/SCENARIO_PROOF/);
});
test('R6R-16 static no-network, no-Docker, no-container-mutations contract',()=>{
  const path=new URL('../src/r6r-offline-synthetic-bridge.mjs',import.meta.url);
  const src=readFileSync(path,'utf8');
  assert.doesNotMatch(src,/from ['"]node:(?:http|https|net|tls|fs|child_process)/);
  assert.doesNotMatch(src,/docker\.sock|host\.docker\.internal|2375|createServer\s*\(|fetch\s*\(|spawn\s*\(/);
  assert.match(src,/FINITE/);
});

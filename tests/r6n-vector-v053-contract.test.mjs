import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeR6NFixture, planR6NVectorGet, projectR6NList,
  projectR6NInspect, projectR6NEvent, assertR6NVectorShape
} from '../src/r6n-vector-v053-contract.mjs';
const id='c'.repeat(64),outsider='d'.repeat(64),alias='a'.repeat(64);
const nonce='f'.repeat(32),nowSec=1900000000;
const imageRef='docker.io/library/busybox@sha256:'+'e'.repeat(64);
const imageConfigId='sha256:'+'b'.repeat(64);
const s=makeR6NFixture({id,nonce,nowSec,runId:33,imageRef,imageConfigId});
const name='r6g-synthetic-'+nonce.slice(0,8);
const get=target=>({method:'GET',target});
const plan=target=>planR6NVectorGet(get(target),s);
const labels=()=>({'f5.synthetic.lab':'R6G_ONLY','f5.synthetic.nonce':nonce,'f5.synthetic.run':'33','f5.synthetic.role':'authorized'});
const inspect=()=>({Id:id,Name:'/'+name,Image:imageConfigId,
  Created:new Date((nowSec-2)*1000).toISOString(),RestartCount:0,
  Config:{Image:imageRef,User:'10001:10001',Tty:false,Labels:labels(),Env:['SECRET_CANARY']},
  State:{Running:true},Mounts:[],
  HostConfig:{Privileged:false,NetworkMode:'none',ReadonlyRootfs:true,
    CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Memory:67108864,
    NanoCpus:500000000,PidsLimit:32,RestartPolicy:{Name:'no'},AutoRemove:true,Binds:[]}});
const listing=()=>({Id:id,Names:['/'+name],Labels:labels(),Env:['SECRET_CANARY'],Image:'private/image'});
const event=(action='start')=>({Type:'container',Action:action,
  Actor:{ID:id,Attributes:{name,SECRET_CANARY:'private'}},time:nowSec});
const noSecret=x=>{assert.doesNotMatch(JSON.stringify(x),/SECRET_CANARY|private\/image|cccccccc|dddddddd/)};

test('R6N-01: spec requires exact fake target, nonce, image refs and run identity',()=>{
  assert.equal(s.publicId,alias);assert.equal(s.mode,'R6N_OFFLINE_ONLY');
  for(const change of [{id:alias},{id:'bad'},{nonce:'bad'},{runId:0},{nowSec:0},
    {imageRef:'busybox:latest'},{imageConfigId:'not-a-digest'}]){
    assert.throws(()=>makeR6NFixture({...s,...change}),/R6N_BLOCKED_SPEC/);
  }
});
test('R6N-02: an unapproved spec mutation is blocked, not treated as attestation',()=>{
  assert.throws(()=>planR6NVectorGet(get('/_ping'),{...s,name:'admin'}),/SPEC_DRIFT/);
});
test('R6N-03: GET Docker list is constrained to the one real target despite broad client query',()=>{
  const p=plan('/containers/json?all=false&filters=%7B%7D&size=false&limit=0');
  assert.equal(p.kind,'LIST');assert.equal(p.stream,false);
  assert.match(decodeURIComponent(p.path),/"id":\["c{64}"\]/);
  assert.doesNotMatch(p.path,/all=true/);
});
test('R6N-04: versioned v1.40 to v1.59 Docker GET reads recognized',()=>{
  for(const version of ['v1.40','v1.43','v1.59']){
    assert.equal(plan('/'+version+'/containers/'+alias+'/json').kind,'INSPECT');
  }
});
test('R6N-05: list rejects all=true, unknown keys and duplicate query params',()=>{
  for(const p of ['/containers/json?all=true','/containers/json?all=false&all=false',
    '/containers/json?all=false&network=host','/containers/json?all=false&limit=2']){
    assert.throws(()=>plan(p),/R6N_BLOCKED_/);
  }
});
test('R6N-06: list filters permit only artificial lab label',()=>{
  assert.equal(plan('/containers/json?all=false&filters='+encodeURIComponent(JSON.stringify({label:['f5.synthetic.lab=R6G_ONLY']}))).kind,'LIST');
  assert.throws(()=>plan('/containers/json?all=false&filters='+encodeURIComponent(JSON.stringify({label:['secret=1']}))),/FILTERS/);
});
test('R6N-07: events are modeled as followable ID-scoped GET with until=0',()=>{
  const p=plan('/events?since='+nowSec+'&until=0&filters='+encodeURIComponent(JSON.stringify({type:['container']})));
  assert.equal(p.kind,'EVENTS');assert.equal(p.stream,true);assert.equal(p.method,'GET');
  assert.match(decodeURIComponent(p.path),/"container":\["c{64}"\]/);
});
test('R6N-08: events timestamps and unknown filters are denied',()=>{
  for(const p of ['/events?since=1','/events?since='+nowSec+'&until='+nowSec,
    '/events?since='+nowSec+'&filters='+encodeURIComponent(JSON.stringify({type:['volume']})),
    '/events?since=abc','/events?since='+nowSec+'&until=0&until=0']){
    assert.throws(()=>plan(p),/R6N_BLOCKED_/);
  }
});
test('R6N-09: inspect GET uses real target privately, never a client-provided foreign ID',()=>{
  const p=plan('/containers/'+alias+'/json');
  assert.equal(p.kind,'INSPECT');assert.equal(p.path,'/containers/'+id+'/json');
  assert.throws(()=>plan('/containers/'+outsider+'/json'),/ROUTE/);
});
test('R6N-10: Vector 0.53 logs follow=true and since are preserved as an INERT stream plan',()=>{
  const p=plan('/containers/'+alias+'/logs?follow=true&stdout=true&stderr=true&since='+nowSec+'&until=0&timestamps=true&tail=all');
  assert.equal(p.kind,'LOGS');assert.equal(p.inert,true);assert.equal(p.stream,true);
  assert.match(p.path,/follow=true/);assert.match(p.path,/since=1900000000/);
  assert.match(p.path,/tail=all/);
});
test('R6N-11: no downgrade to snapshot/follow=false or early tail caps',()=>{
  for(const p of ['/containers/'+alias+'/logs?follow=false&stdout=true&stderr=true&since='+nowSec+'&timestamps=true',
    '/containers/'+alias+'/logs?follow=true&stdout=true&stderr=true&since='+nowSec+'&timestamps=true&tail=100',
    '/containers/'+alias+'/logs?follow=true&stdout=true&stderr=true&timestamps=true']){
    assert.throws(()=>plan(p),/R6N_BLOCKED_/);
  }
});
test('R6N-12: all mutations, outsider ID and path/query smuggling fail closed',()=>{
  for(const req of [{method:'POST',target:'/_ping'},get('//evil'),get('/containers/'+outsider+'/logs'),
    get('/_ping?x=1'),get('/containers/%61/json'),get('/containers/../_ping'),get('/_ping#x')]){
    assert.throws(()=>planR6NVectorGet(req,s),/R6N_BLOCKED_/);
  }
});
test('R6N-13: synthetic list exposes exactly one authorized container, never outsiders',()=>{
  const list=projectR6NList([listing(),{Id:outsider,Env:['SECRET_CANARY'],Names:['/third-party']}],s);
  assert.equal(list.length,1);assert.equal(list[0].Id,alias);assert.deepEqual(list[0].Names,['/'+name]);noSecret(list);
});
test('R6N-14: a malformed authorized list cannot be accepted',()=>{
  assert.throws(()=>projectR6NList([{...listing(),Names:['/other']}],s),/LIST_ATTESTATION/);
  assert.throws(()=>projectR6NList([{...listing(),Labels:{}}],s),/LIST_ATTESTATION/);
  assert.throws(()=>projectR6NList([listing(),listing()],s),/LIST_DUPLICATE/);
});
test('R6N-15: inspector provides the four fields actually consumed by Vector ContainerMetadata',()=>{
  const projected=projectR6NInspect(inspect(),s);
  assert.equal(projected.Name,'/'+name);assert.equal(typeof projected.Created,'string');
  assert.equal(projected.Config.Image,'synthetic/vector-v053-review-only');
  assert.equal(projected.Config.Labels['f5.synthetic.lab'],'R6G_ONLY');
  assert.equal(projected.Id,alias);noSecret(projected);
});
test('R6N-16: inspection rejects mismatched target, digest and privilege changes',()=>{
  for(const change of [{Id:outsider},{Image:'sha256:'+'0'.repeat(64)},
    {HostConfig:{...inspect().HostConfig,Privileged:true}},
    {Mounts:[{Source:'/host'}]},{Config:{...inspect().Config,Labels:{}}}]){
    assert.throws(()=>projectR6NInspect({...inspect(),...change},s),/INSPECT_ATTESTATION/);
  }
});
test('R6N-17: inspection rejects nonroot violations, lost safeguards and stale creation',()=>{
  for(const change of [{Config:{...inspect().Config,User:'0'}},
    {HostConfig:{...inspect().HostConfig,NetworkMode:'host'}},
    {State:{Running:false}}, {RestartCount:1},
    {Created:new Date((nowSec-650)*1000).toISOString()}]){
    assert.throws(()=>projectR6NInspect({...inspect(),...change},s),/INSPECT_/);
  }
});
test('R6N-18: event includes Actor.Attributes so the official Vector unwrap has data',()=>{
  const e=projectR6NEvent(event(),s);
  assert.equal(e.Action,'start');assert.equal(e.Actor.ID,alias);
  assert.deepEqual(e.Actor.Attributes,{name});noSecret(e);
});
test('R6N-19: start, unpause, die and pause event actions are supported',()=>{
  for(const action of ['start','unpause','die','pause']){
    assert.equal(projectR6NEvent(event(action),s).Action,action);
  }
});
test('R6N-20: any event from outsider or missing actor attributes is rejected',()=>{
  for(const change of [{Actor:{ID:outsider,Attributes:{name}}},
    {Actor:{ID:id}},{Actor:{ID:id,Attributes:{name:'other'}}},
    {Type:'volume'},{Action:'destroy'}, {time:nowSec-1000}]){
    assert.throws(()=>projectR6NEvent({...event(),...change},s),/EVENT_ATTESTATION/);
  }
});
test('R6N-21: no raw event attributes can escape sanitized projection',()=>{
  const input=event();input.Actor.Attributes.SECRET_CANARY='secret';
  noSecret(projectR6NEvent(input,s));
});
test('R6N-22: full synthetic list/inspect/event fields agree by public identity',()=>{
  assert.equal(assertR6NVectorShape({list:projectR6NList([listing()],s),
    inspect:projectR6NInspect(inspect(),s),event:projectR6NEvent(event(),s)},s),true);
});
test('R6N-23: official Vector shape guard detects missing metadata/Actor fields',()=>{
  const good={list:projectR6NList([listing()],s),inspect:projectR6NInspect(inspect(),s),event:projectR6NEvent(event(),s)};
  assert.throws(()=>assertR6NVectorShape({...good,inspect:{Config:{}}},s),/VECTOR_SHAPE/);
  assert.throws(()=>assertR6NVectorShape({...good,event:{Actor:{ID:alias}}},s),/VECTOR_SHAPE/);
});
test('R6N-24: contract is inert, never invokes Docker, network or mutating operations',()=>{
  const content=readFileSync(new URL('../src/r6n-vector-v053-contract.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(content,/^\s*import\b/m);
  assert.doesNotMatch(content,/\b(?:fetch|spawn|execFile|createServer|createConnection|writeFileSync|readFileSync)\s*\(/);
  assert.doesNotMatch(content,/docker\.sock|host\.docker\.internal|f5solucoes\.net/);
});

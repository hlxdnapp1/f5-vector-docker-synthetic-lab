import test from 'node:test';
import assert from 'node:assert/strict';
import { planLabRead, projectLabResponse, handleLabRead, attestLabContainer } from '../src/r6f-real-docker-adapter.mjs';
import { checkHostedRunnerGate, isBoundedUnixGet, createHostedUnixRead } from '../src/r6f-unix-transport.mjs';
import { readFileSync } from 'node:fs';
const id='c'.repeat(64), outside='d'.repeat(64), alias='a'.repeat(64);
const fakeMeta={Id:id,Name:'/r6f-synthetic-a1b2c3d4',Config:{Tty:false,Labels:{'f5.synthetic.lab':'R6F_ONLY'}},HostConfig:{Privileged:false,NetworkMode:'none',Binds:null},Mounts:[]};
const req=t=>({method:'GET',target:t});
const frame=(text,channel=1)=>{const b=Buffer.from(text),h=Buffer.alloc(8);h[0]=channel;h.writeUInt32BE(b.length,4);return Buffer.concat([h,b]);};
const marker='2026-11-16T16:55:00.000Z R6F_PUBLIC_SYNTHETIC_ONLY\n';
const result=(p,b)=>projectLabResponse(p,{status:200,body:Buffer.isBuffer(b)?b:Buffer.from(b)},id);

test('R6F-01: real ID requires a fresh synthetic-only attestation',()=>{
 assert.equal(attestLabContainer(fakeMeta,id),true);
 for(const patch of [ {Mounts:[{Source:'/root'}]}, {HostConfig:{...fakeMeta.HostConfig,NetworkMode:'host'}},
 {Config:{...fakeMeta.Config,Labels:{}}}, {Id:outside}, {Name:'/other'} ]) {
  assert.equal(attestLabContainer({...fakeMeta,...patch},id),false);
 }
});
test('R6F-02: request planner refuses mutations, unknown routes, outsider ID',()=>{
 for(const r of [{method:'POST',target:'/_ping'},req('/containers/'+outside+'/json'),req('/info'),req('/containers/'+id+'/logs'),req('/_ping#evil')]){
  assert.equal(planLabRead(r,id).ok,false);
 }
});
test('R6F-03: list is rewritten to a fixed ID-scoped upstream GET',()=>{
 const p=planLabRead(req('/containers/json?all=false&size=false&filters=%7B%7D'),id);
 assert.equal(p.ok,true);assert.equal(p.kind,'LIST');assert.ok(p.path.includes(encodeURIComponent(JSON.stringify({id:[id]}))));
 assert.ok(!p.path.includes('all=true'));
});
test('R6F-04: bad list filters, duplicated keys and bad API prefixes fail closed',()=>{
 for(const p of ['/containers/json?all=true&filters=%7B%7D','/containers/json?all=false',
 '/containers/json?all=false&filters=%5B%5D','/containers/json?all=false&all=false&filters=%7B%7D',
 '/v1.39/containers/json?all=false&filters=%7B%7D','/v1.60/_ping']){
  assert.equal(planLabRead(req(p),id).ok,false,p);
 }
});
test('R6F-05: logs always normalize follow=false and tail<=100 on the actual upstream path',()=>{
 const p=planLabRead(req('/containers/'+alias+'/logs?follow=true&tail=all&stdout=true&timestamps=true'),id);
 assert.equal(p.ok,true);assert.equal(p.kind,'LOGS');assert.equal(p.tail,100);
 assert.ok(p.path.endsWith('follow=false&tail=100'));
 assert.equal(planLabRead(req('/containers/'+alias+'/logs?tail=101'),id).ok,false);
});
test('R6F-06: events are rewritten to a short, ID-scoped bounded time window',()=>{
 const p=planLabRead(req('/events?since=0&filters=%7B%7D'),id,1900000000);
 assert.equal(p.ok,true);assert.equal(p.kind,'EVENTS');assert.ok(p.path.includes('since=1899999999&until=1900000002'));
 assert.ok(p.path.includes(encodeURIComponent(JSON.stringify({type:['container'],container:[id]}))));
});
test('R6F-07: list output cannot reveal real ID or outsider secrets',()=>{
 const p=planLabRead(req('/containers/json?all=false&filters=%7B%7D'),id);
 const x=result(p,JSON.stringify([{Id:id,Names:['secret'],Env:['LEAK_CANARY']},{Id:outside,Labels:{secret:'LEAK_CANARY'}}]));
 assert.equal(x.ok,true);assert.equal(JSON.parse(x.body).length,1);assert.equal(JSON.parse(x.body)[0].Id,alias);
 assert.doesNotMatch(x.body.toString(),/LEAK_CANARY|cccccccc|dddddddd/);
});
test('R6F-08: inspect checks attestation and discards raw Env, mounts and IP',()=>{
 const p=planLabRead(req('/containers/'+alias+'/json'),id);
 const x=result(p,JSON.stringify({...fakeMeta,NetworkSettings:{IPAddress:'LEAK_CANARY'},Config:{...fakeMeta.Config,Env:['LEAK_CANARY']}}));
 assert.equal(x.ok,true);assert.equal(JSON.parse(x.body).Id,alias);
 assert.doesNotMatch(x.body.toString(),/LEAK_CANARY|cccccccc/);
 assert.equal(result(p,JSON.stringify({...fakeMeta,Mounts:[{Source:'LEAK_CANARY'}]})).ok,false);
});
test('R6F-09: event filtering removes outsider identities and attributes',()=>{
 const p=planLabRead(req('/events?since=0'),id,1900000000);
 const x=result(p,[{Type:'container',Action:'start',Actor:{ID:outside,Attributes:{secret:'LEAK_CANARY'}}},
 {Type:'container',Action:'die',Actor:{ID:id,Attributes:{secret:'LEAK_CANARY'}}}].map(JSON.stringify).join('\n')+'\n');
 assert.equal(x.ok,true);assert.equal(x.body.toString().split('\n').filter(Boolean).length,1);
 assert.doesNotMatch(x.body.toString(),/LEAK_CANARY|dddddddd|cccccccc/);
});
test('R6F-10: logs accept only framed timestamped marker, strip non-marker bytes',()=>{
 const p=planLabRead(req('/containers/'+alias+'/logs?tail=all'),id);
 const x=result(p,frame(marker));assert.equal(x.ok,true);
 assert.equal(x.body.readUInt32BE(4),Buffer.byteLength(marker));
 assert.equal(x.body.subarray(8).toString(),marker);
 assert.equal(result(p,frame('LEAK_CANARY\n')).ok,false);
 const broken=frame(marker);broken[1]=1;assert.equal(result(p,broken).ok,false);
});
test('R6F-11: malformed and overlimit response buffers never leak',()=>{
 const p=planLabRead(req('/containers/json?all=false&filters=%7B%7D'),id);
 for(const b of [Buffer.alloc(17000),Buffer.from('{'),Buffer.from(JSON.stringify([{Id:'a'}]))]){
  const x=result(p,b);assert.equal(x.ok,false);assert.equal(x.body,null);
 }
});
test('R6F-12: injected transport never invoked for unauthenticated ID or denied request',async()=>{
 let calls=0;const fetchUpstream=async()=>{calls++;return{status:200,body:Buffer.from('OK')}};
 let x=await handleLabRead(req('/_ping'),{id,attestation:{...fakeMeta,Mounts:[{Source:'LEAK_CANARY'}]},fetchUpstream});
 assert.equal(x.ok,false);assert.equal(calls,0);
 x=await handleLabRead({method:'POST',target:'/_ping'},{id,attestation:fakeMeta,fetchUpstream});
 assert.equal(x.ok,false);assert.equal(calls,0);
 x=await handleLabRead(req('/_ping'),{id,attestation:fakeMeta,fetchUpstream});
 assert.equal(x.ok,true);assert.equal(calls,1);
});
test('R6F-13: any upstream exception is sanitized',async()=>{
 const x=await handleLabRead(req('/version'),{id,attestation:fakeMeta,fetchUpstream:async()=>{throw Error('LEAK_CANARY')}});
 assert.equal(x.ok,false);assert.equal(x.body,null);
 assert.doesNotMatch(JSON.stringify(x),/LEAK_CANARY/);
});
test('R6F-14: real transport requires explicit owner gate and GitHub-hosted runner',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'hlxdnapp1/f5-vector-docker-synthetic-lab',
 GITHUB_REF:'refs/heads/main',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',R6F_REAL_DOCKER_APPROVAL:'EXPLICIT_SEPARATE_OWNER_APPROVAL',GITHUB_SHA:'e'.repeat(40),R6F_APPROVED_COMMIT:'e'.repeat(40)};
 assert.equal(checkHostedRunnerGate(env),true);
 for(const patch of [{RUNNER_ENVIRONMENT:'self-hosted'},{DOCKER_HOST:'tcp://host.docker.internal:2375'},
 {GITHUB_REF:'refs/heads/review'},{GITHUB_EVENT_NAME:'push'},{R6F_REAL_DOCKER_APPROVAL:''},{R6F_APPROVED_COMMIT:'f'.repeat(40)}]){
 assert.equal(checkHostedRunnerGate({...env,...patch}),false);
 }
 assert.throws(()=>createHostedUnixRead({env:{},id}),/R6F_BLOCKED_RUNNER_OR_SOCKET/);
});
test('R6F-15: raw Unix transport has an independent, fixed scoped path guard',()=>{
 const now=1900000000;
 const list='/containers/json?all=false&size=false&filters='+encodeURIComponent(JSON.stringify({id:[id]}));
 assert.equal(isBoundedUnixGet(list,id,16384,now),true);
 assert.equal(isBoundedUnixGet('/containers/'+id+'/logs?stdout=true&stderr=true&timestamps=true&follow=false&tail=100',id,16384,now),true);
 for(const p of ['/containers/'+outside+'/json','/containers/'+id+'/start','/_ping?token=evil','/containers/json?all=true&filters=%7B%7D',
 '/containers/'+id+'/logs?stdout=true&stderr=true&timestamps=true&follow=true&tail=all']){
   assert.equal(isBoundedUnixGet(p,id,16384,now),false,p);
 }
});
test('R6F-16: candidate code contains no write methods, TCP endpoint, Docker commands or workflow hooks',()=>{
 const a=readFileSync(new URL('../src/r6f-real-docker-adapter.mjs',import.meta.url),'utf8');
 const b=readFileSync(new URL('../src/r6f-unix-transport.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(a,/from 'node:(?:http|net|tls|https)'/);
 assert.doesNotMatch(b,/\b(?:createServer|listen|child_process|spawn|execFile|writeFile|unlink|rmSync)\b/);
 assert.doesNotMatch(a+b,/host\.docker\.internal:2375|docker\.exe|system prune|--privileged|supabase_vector/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyR6GSyntheticContainer, executeR6GAttestedRead } from '../src/r6g-reconciled-read.mjs';
import { r6gTlsOptions, r6gClientRequestAllowed, makeR6GLoopbackGateway } from '../src/r6g-loopback-mtls-gateway.mjs';

const id='c'.repeat(64), outsider='d'.repeat(64), fake='a'.repeat(64);
const nowSec=1900000000, nonce='e'.repeat(32), imageId='sha256:'+'f'.repeat(64);
const fingerprint=Array.from({length:32},()=> 'AA').join(':');
const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_REPOSITORY:'hlxdnapp1/f5-vector-docker-synthetic-lab',
 GITHUB_REF:'refs/heads/main',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
 R6F_REAL_DOCKER_APPROVAL:'EXPLICIT_SEPARATE_OWNER_APPROVAL',GITHUB_SHA:'b'.repeat(40),
 R6F_APPROVED_COMMIT:'b'.repeat(40)};
const spec={id,imageId,nonce,nowSec};
const proof=()=>({
 Id:id,Image:imageId,Created:new Date((nowSec-2)*1000).toISOString(),
 Name:'/r6g-synthetic-a1b2c3d4',RestartCount:0,
 Config:{User:'10001:10001',Tty:false,Labels:{'f5.synthetic.lab':'R6G_ONLY',
 'f5.synthetic.nonce':nonce}},
 HostConfig:{Privileged:false,NetworkMode:'none',ReadonlyRootfs:true,
 CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Memory:64*1024*1024,
 NanoCpus:500000000,PidsLimit:32,RestartPolicy:{Name:'no'},AutoRemove:true,Binds:[]},
 Mounts:[],State:{Running:true}
});
const json=x=>Buffer.from(JSON.stringify(x));
const get=target=>({method:'GET',target});
const snapshot=(value=proof())=>({status:200,body:json(value)});
const run=(request,fetchUpstream,other={})=>executeR6GAttestedRead({env,request,spec,fetchUpstream,...other});

test('R6G-01 freshly created synthetic container proof is accepted',()=>{
 const x=verifyR6GSyntheticContainer(proof(),spec);
 assert.equal(x.Id,id);assert.equal(x.Image,imageId);assert.equal(x.Label,nonce);
});
test('R6G-02 rejects foreign container identity, image or nonce',()=>{
 for(const [key,value] of [['Id',outsider],['Image','sha256:'+'d'.repeat(64)]]) {
  assert.equal(verifyR6GSyntheticContainer({...proof(),[key]:value},spec),null);
 }
 const x=proof();x.Config.Labels['f5.synthetic.nonce']='1'.repeat(32);
 assert.equal(verifyR6GSyntheticContainer(x,spec),null);
});
test('R6G-03 rejects privileged, mounted or networked containers',()=>{
 for(const mutation of [
  x=>{x.HostConfig.Privileged=true}, x=>{x.Mounts=[{Source:'/tmp/private'}]},
  x=>{x.HostConfig.NetworkMode='host'},x=>{x.HostConfig.Binds=['/:/host']},
  x=>{x.HostConfig.ReadonlyRootfs=false}]) {
  const x=proof();mutation(x);assert.equal(verifyR6GSyntheticContainer(x,spec),null);
 }
});
test('R6G-04 refuses root, excessive resources and ambient capabilities',()=>{
 for(const mutation of [
  x=>{x.Config.User='0'},x=>{x.HostConfig.CapDrop=[]},
  x=>{x.HostConfig.SecurityOpt=[]}, x=>{x.HostConfig.Memory=1024*1024*1024},
  x=>{x.HostConfig.NanoCpus=4_000_000_000},x=>{x.HostConfig.PidsLimit=512}]){
  const x=proof();mutation(x);assert.equal(verifyR6GSyntheticContainer(x,spec),null);
 }
});
test('R6G-05 stale, future, stopped and restarted containers are rejected',()=>{
 for(const mutation of [
  x=>{x.Created=new Date((nowSec-610)*1000).toISOString()},
  x=>{x.Created=new Date((nowSec+10)*1000).toISOString()},
  x=>{x.State.Running=false},x=>{x.RestartCount=2},
  x=>{x.HostConfig.RestartPolicy.Name='always'}]){
  const x=proof();mutation(x);assert.equal(verifyR6GSyntheticContainer(x,spec),null);
 }
});
test('R6G-06 no upstream call without a separately authorized hosted runner',async()=>{
 let count=0;
 const fetchUpstream=async()=>{count++;return snapshot()};
 const r=await run(get('/_ping'),fetchUpstream,{env:{}});
 assert.equal(r.ok,false);assert.equal(r.kind,'RUNTIME_GATE_DENIED');assert.equal(count,0);
});
test('R6G-07 denied requests are rejected before any Docker inspect GET',async()=>{
 let calls=0;
 const fetchUpstream=async()=>{calls++;return snapshot()};
 for(const request of [{method:'POST',target:'/_ping'},get('/info'),get('/containers/'+outsider+'/json')]){
  const r=await run(request,fetchUpstream);assert.equal(r.ok,false);
 }
 assert.equal(calls,0);
});
test('R6G-08 a valid ping requires pre- and post-inspection (3 calls)',async()=>{
 const calls=[];
 const response=await run(get('/_ping'),async(path,cap)=>{
   calls.push([path,cap]);return path==='/_ping'?{status:200,body:Buffer.from('OK')}:snapshot();
 });
 assert.equal(response.ok,true);assert.equal(response.body.toString(),'OK');
 assert.deepEqual(calls.map(x=>x[0]),['/containers/'+id+'/json','/_ping','/containers/'+id+'/json']);
});
test('R6G-09 failure in pre-inspection prevents target GET',async()=>{
 const paths=[];
 const r=await run(get('/_ping'),async path=>{paths.push(path);return snapshot({...proof(),Id:outsider})});
 assert.equal(r.ok,false);assert.equal(r.kind,'PRE_ATTESTATION_DENIED');assert.equal(paths.length,1);
});
test('R6G-10 metadata drift after upstream read denies release',async()=>{
 let call=0;
 const r=await run(get('/_ping'),async path=>{
  call++;
  if(call===1)return snapshot();
  if(call===2)return {status:200,body:Buffer.from('OK')};
  return snapshot({...proof(),Name:'/r6g-synthetic-deadbeef'});
 });
 assert.equal(call,3);assert.equal(r.ok,false);assert.equal(r.kind,'POST_ATTESTATION_DENIED');assert.equal(r.body,null);
});
test('R6G-11 missing or oversized data fails closed before post-inspection',async()=>{
 let call=0;
 const r=await run(get('/_ping'),async path=>{
  call++;return path==='/_ping'?{status:200,body:Buffer.alloc(9000)}:snapshot();
 });
 assert.equal(r.ok,false);assert.equal(r.body,null);assert.equal(call,2);
});
test('R6G-12 lists project fake authorized identity and discard outsiders and secret canaries',async()=>{
 const raw=json([{Id:id,Env:['LEAK_CANARY']},{Id:outsider,Env:['LEAK_CANARY']}]);
 const r=await run(get('/containers/json?all=false&filters=%7B%7D'),
 async path=>path.startsWith('/containers/json?')?{status:200,body:raw}:snapshot());
 assert.equal(r.ok,true);assert.equal(JSON.parse(r.body).length,1);
 assert.equal(JSON.parse(r.body)[0].Id,fake);
 assert.doesNotMatch(r.body.toString(),/LEAK_CANARY|cccccccc|dddddddd/);
});
test('R6G-13 daemon inspection cannot expose raw Env or host mounts',async()=>{
 const x=proof();x.Config.Env=['LEAK_CANARY'];x.NetworkSettings={IPAddress:'LEAK_CANARY'};
 const r=await run(get('/containers/'+fake+'/json'),async()=>snapshot(x));
 assert.equal(r.ok,true);assert.doesNotMatch(r.body.toString(),/LEAK_CANARY|cccccccc/);
});
test('R6G-14 upstream errors are sanitized without secret echoes',async()=>{
 const r=await run(get('/_ping'),async()=>{throw Error('LEAK_CANARY')});
 assert.equal(r.ok,false);assert.equal(r.body,null);
 assert.doesNotMatch(JSON.stringify(r),/LEAK_CANARY/);
});
test('R6G-15 TLS options require external nonempty cert/key/CA and pinned peer',()=>{
 assert.throws(()=>r6gTlsOptions({}),/R6G_TLS_MATERIAL_REQUIRED/);
 const tls=r6gTlsOptions({key:Buffer.alloc(64),cert:Buffer.alloc(64),ca:Buffer.alloc(64),clientFingerprint:fingerprint});
 assert.equal(tls.requestCert,true);assert.equal(tls.rejectUnauthorized,true);
 assert.equal(tls.minVersion,'TLSv1.3');assert.equal(tls.maxVersion,'TLSv1.3');
});
test('R6G-16 accepted HTTPS request has verified certificate, peer hash, loopback and GET',()=>{
 const info={authorized:true,fingerprint256:fingerprint,remoteAddress:'127.0.0.1',method:'GET',
  host:'localhost:4000',url:'/_ping',headerCount:2,headerNames:['host','user-agent'],hasRequestBody:false};
 assert.equal(r6gClientRequestAllowed(info,fingerprint),true);
 for(const patch of [{authorized:false},{remoteAddress:'192.0.2.10'},
  {fingerprint256:'BB'+fingerprint.slice(2)},{method:'POST'},{host:'evil.invalid'},
  {url:'//host/path'},{headerCount:25},{headerNames:['authorization']},
  {hasRequestBody:true}]){
  assert.equal(r6gClientRequestAllowed({...info,...patch},fingerprint),false);
 }
});
test('R6G-17 gateway cannot be created without runner approval, and never listens on import',()=>{
 assert.throws(()=>makeR6GLoopbackGateway({env:{},spec,tls:{},fetchUpstream:async()=>{}}),/R6G_RUNNER_GATE_DENIED/);
});
test('R6G-18 all active R6G request paths require independent bounded Unix read guard',async()=>{
 const paths=[];
 await run(get('/containers/'+fake+'/logs?tail=all'),async(path,cap)=>{
  paths.push([path,cap]);
  if(path.endsWith('/json'))return snapshot();
  return {status:200,body:Buffer.from('LEAK_CANARY')};
 });
 assert.equal(paths.length,3);
 assert.match(paths[1][0],/follow=false&tail=100$/);
 assert.ok(paths.every(x=>x[1]<=32768));
});
test('R6G-19 implementation does not create Docker containers or read credential files',()=>{
 for(const filename of ['r6g-reconciled-read.mjs','r6g-loopback-mtls-gateway.mjs']){
  const code=readFileSync(new URL('../src/'+filename,import.meta.url),'utf8');
  assert.doesNotMatch(code,/\b(?:spawn|child_process|readFileSync|createWriteStream|writeFileSync|docker\.exe)\b/);
  assert.doesNotMatch(code,/host\.docker\.internal:2375|f5solucoes\.net|Sistema_Automacao_Comercial/);
 }
});

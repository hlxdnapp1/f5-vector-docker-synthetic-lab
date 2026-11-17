import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectR7BOfflineList as list, projectR7BOfflineInspect as inspect,
        projectR7BOfflinePair as pair} from '../src/r7b-offline-list-inspect-projection.mjs';

const ID='a'.repeat(64);
const FOREIGN='d'.repeat(64);
const NAME='/r7b-synthetic-fixture';
const IMAGE='r7b-public-synthetic@sha256:'+'b'.repeat(64);
const IMAGE_ID='sha256:'+'c'.repeat(64);
const LABELS={'r7b.lab.owner':'LAB_ONLY','r7b.lab.role':'fixture'};
const CREATED=1794860000;
const iso=new Date(CREATED*1000).toISOString();
const record=()=>({Id:ID,Names:[NAME],Image:IMAGE,ImageID:IMAGE_ID,
  Labels:{...LABELS},State:'running',Status:'Up 1 second',Created:CREATED});
const details=()=>({Id:ID,Name:NAME,Created:iso,
  State:{Status:'running',Running:true},Config:{Image:IMAGE,Labels:{...LABELS},Tty:false},
  HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true},
  Mounts:[],NetworkSettings:{Networks:{}}});
const buf=o=>Buffer.from(JSON.stringify(o));
const reject=(fn,pattern)=>assert.throws(fn,pattern);

// LIST only reveals one approved synthetic fixture and is deterministic.
test('R7B3-01: LIST projects one exact fixture',()=>{
  assert.deepEqual(JSON.parse(list(buf([record()])).toString()),[record()]);
});
test('R7B3-02: LIST foreign IDs and metadata never appear in output',()=>{
  const stranger={Id:FOREIGN,Names:['/PRIVATE_NAME'],Secret:'CANARY_TOKEN',Labels:{'private':'CANARY'}};
  const result=list(buf([stranger,record()]));
  assert.deepEqual(JSON.parse(result.toString()),[record()]);
  assert.doesNotMatch(result.toString(),/PRIVATE_NAME|CANARY_TOKEN|private/);
});
test('R7B3-03: LIST empty and foreign-only arrays project empty safely',()=>{
  assert.equal(list(buf([])).toString(),'[]');
  assert.equal(list(buf([{Id:FOREIGN,extra:'DO_NOT_LEAK'}])).toString(),'[]');
});
test('R7B3-04: LIST rejects duplicate authorized ID',()=>reject(()=>list(buf([record(),record()])),/LIST_DUPLICATE/));
test('R7B3-05: LIST rejects malformed foreign entries rather than guessing scope',()=>{
  for(const item of [null,{}, {Id:'not-a-docker-id'},7,[],{Id:'a'.repeat(63)}])
    reject(()=>list(buf([item])),/LIST_ITEM/);
});
test('R7B3-06: LIST refuses wrong labels, status and image',()=>{
  const mutations=[['Labels',{'r7b.lab.owner':'OTHER','r7b.lab.role':'fixture'}],
    ['State','exited'],['Status','Up 2 seconds'],['Image','not-a-pinned-synthetic-image'],
    ['ImageID','sha256:'+'e'.repeat(64)]];
  for(const [key,value] of mutations)reject(()=>list(buf([{...record(),[key]:value}])),/LIST_TARGET/);
});
test('R7B3-07: LIST rejects extra fields and unexpected container metadata',()=>{
  reject(()=>list(buf([{...record(),Mounts:[{Source:'/private'}]}])),/LIST_TARGET/);
  reject(()=>list(buf([{...record(),LogPath:'/private/log'}])),/LIST_TARGET/);
});
test('R7B3-08: LIST requires exact synthetic Names',()=>{
  reject(()=>list(buf([{...record(),Names:['/other']}])) ,/LIST_TARGET/);
  reject(()=>list(buf([{...record(),Names:[NAME,'/other']}])) ,/LIST_TARGET/);
});
test('R7B3-09: LIST rejects oversized item count',()=>{
  reject(()=>list(buf(Array.from({length:13},(_,i)=>({Id:i.toString(16).padStart(64,'0')})))),/LIST_SCOPE/);
});
test('R7B3-10: LIST rejects non-buffer, zero and huge input',()=>{
  for(const v of [null,'[]',Buffer.alloc(0),Buffer.alloc(16385,32)])
    reject(()=>list(v),/BODY_SCOPE/);
});
test('R7B3-11: LIST rejects invalid UTF-8',()=>reject(()=>list(Buffer.from([91,0xc3,0x28,93])),/UTF8/));
test('R7B3-12: LIST rejects duplicate JSON keys before projecting',()=>{
  const body=buf([record()]).toString().replace('"Id":"'+ID+'"', '"Id":"'+FOREIGN+'","Id":"'+ID+'"');
  reject(()=>list(Buffer.from(body)),/JSON_DUPLICATE_KEY/);
});
test('R7B3-13: LIST rejects duplicate escape-equivalent keys',()=>{
  const body=buf([record()]).toString().replace('"State":"running"','"State":"running","St\\u0061te":"running"');
  reject(()=>list(Buffer.from(body)),/JSON_DUPLICATE_KEY/);
});
test('R7B3-14: LIST wrong JSON structure and malformed JSON fail closed',()=>{
  for(const b of [buf({Id:ID}),Buffer.from('[]garbage'),Buffer.from('[{]')])
    reject(()=>list(b),/LIST_SCOPE|JSON_SYNTAX/);
});

// INSPECT outputs no raw paths, environment, network, mounts or secrets.
test('R7B3-15: INSPECT exact synthetic fixture projects safe subset',()=>{
  assert.deepEqual(JSON.parse(inspect(buf(details()),ID).toString()),details());
});
test('R7B3-16: INSPECT denies foreign requested IDs even with valid body',()=>{
  for(const wanted of [FOREIGN,'fixture',null,undefined])
    reject(()=>inspect(buf(details()),wanted),/REQUESTED_ID/);
});
test('R7B3-17: INSPECT denies body with foreign container ID',()=>{
  reject(()=>inspect(buf({...details(),Id:FOREIGN}),ID),/INSPECT_TARGET/);
});
test('R7B3-18: INSPECT rejects extra secrets/LogPath and private env',()=>{
  for(const field of [{LogPath:'/home/secret/log'}, {Path:'/bin/secret'}, {Private:'CANARY'}])
    reject(()=>inspect(buf({...details(),...field}),ID),/INSPECT_TARGET/);
  reject(()=>inspect(buf({...details(),Config:{...details().Config,Env:['SECRET=CANARY']}}),ID),/INSPECT_TARGET/);
});
test('R7B3-19: INSPECT requires rootfs read-only and no privileges',()=>{
  for(const bad of [{Privileged:true},{ReadonlyRootfs:false},{NetworkMode:'host'}]){
    reject(()=>inspect(buf({...details(),HostConfig:{...details().HostConfig,...bad}}),ID),/INSPECT_TARGET/);
  }
});
test('R7B3-20: INSPECT rejects mounts and attached networks',()=>{
  reject(()=>inspect(buf({...details(),Mounts:[{Source:'/mnt/private'}]}),ID),/INSPECT_TARGET/);
  reject(()=>inspect(buf({...details(),NetworkSettings:{Networks:{bridge:{}}}}),ID),/INSPECT_TARGET/);
});
test('R7B3-21: INSPECT state, TTY, label and image mismatch fail closed',()=>{
  const bad=[{State:{Status:'exited',Running:false}},
    {Config:{...details().Config,Tty:true}},
    {Config:{...details().Config,Labels:{...LABELS,secret:'x'}}},
    {Config:{...details().Config,Image:'latest'}}];
  for(const mutation of bad)reject(()=>inspect(buf({...details(),...mutation}),ID),/INSPECT_TARGET/);
});
test('R7B3-22: INSPECT timestamp and identity drift are rejected',()=>{
  for(const mutation of [{Created:'2026-11-17T00:00:00Z'}, {Name:'/foreign'}])
    reject(()=>inspect(buf({...details(),...mutation}),ID),/INSPECT_TARGET/);
});
test('R7B3-23: INSPECT rejects repeated nested JSON keys',()=>{
  const raw=buf(details()).toString().replace('"Running":true','"Running":false,"Running":true');
  reject(()=>inspect(Buffer.from(raw),ID),/JSON_DUPLICATE_KEY/);
});
test('R7B3-24: INSPECT rejects malformed UTF-8 and non-JSON',()=>{
  reject(()=>inspect(Buffer.from([123,0xc3,0x28,125]),ID),/UTF8/);
  reject(()=>inspect(Buffer.from('{broken'),ID),/JSON_SYNTAX/);
});
test('R7B3-25: INSPECT nested arrays/extra network keys are rejected',()=>{
  reject(()=>inspect(buf({...details(),NetworkSettings:{Networks:[]}}),ID),/INSPECT_TARGET/);
  reject(()=>inspect(buf({...details(),State:{...details().State,ExitCode:1}}),ID),/INSPECT_TARGET/);
});

// LIST and INSPECT must agree before either Buffer can be returned.
test('R7B3-26: paired valid LIST and INSPECT return independent projected buffers',()=>{
  const output=pair(buf([record()]),buf(details()),ID);
  assert.deepEqual(JSON.parse(output.list.toString()),[record()]);
  assert.deepEqual(JSON.parse(output.inspect.toString()),details());
  assert.equal(Object.isFrozen(output),true);
});
test('R7B3-27: pair refuses missing authorized LIST before INSPECT',()=>{
  reject(()=>pair(buf([{Id:FOREIGN,Private:'hidden'}]),buf(details()),ID),/LIST_MISSING/);
});
test('R7B3-28: pair refuses wrong requested ID even with both valid snapshots',()=>{
  reject(()=>pair(buf([record()]),buf(details()),FOREIGN),/REQUESTED_ID/);
});
test('R7B3-29: pair rejects invalid INSPECT without exposing LIST output',()=>{
  reject(()=>pair(buf([record()]),buf({...details(),Mounts:['/private']}),ID),/INSPECT_TARGET/);
});
test('R7B3-30: pair rejects poisoned second LIST record before releasing safe first',()=>{
  reject(()=>pair(buf([record(),{Id:ID}]),buf(details()),ID),/LIST_DUPLICATE/);
});
test('R7B3-31: source has no Docker/network/filesystem I/O capability',()=>{
  const src=readFileSync(new URL('../src/r7b-offline-list-inspect-projection.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^\s*import\b/m);
  assert.doesNotMatch(src,/\b(?:fetch|spawn|child_process|createServer|createConnection|readFileSync|writeFileSync|Dockerode)\b/);
  assert.doesNotMatch(src,/docker\.sock|host\.docker\.internal|f5solucoes\.net/);
});
test('R7B3-32: output is deterministic and never an alias of input buffers',()=>{
  const input=buf([record()]),out=list(input),original=Buffer.from(out);
  input.fill(0);assert.deepEqual(out,original);
  out.fill(0);assert.deepEqual(JSON.parse(list(buf([record()])).toString()),[record()]);
});

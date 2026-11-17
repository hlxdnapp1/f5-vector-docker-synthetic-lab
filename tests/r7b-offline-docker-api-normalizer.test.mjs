import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeR7BOfflineDockerList as list,
        normalizeR7BOfflineDockerInspect as inspect,
        normalizeR7BOfflineDockerPair as pair} from '../src/r7b-offline-docker-api-normalizer.mjs';

const ID='a'.repeat(64), FOREIGN='d'.repeat(64);
const NAME='/r7b-synthetic-fixture';
const IMAGE='r7b-public-synthetic@sha256:'+'b'.repeat(64);
const IMAGE_ID='sha256:'+'c'.repeat(64);
const LABELS={'r7b.lab.owner':'LAB_ONLY','r7b.lab.role':'fixture'};
const CREATED=1794860000;
const stamp=new Date(CREATED*1000).toISOString();
const body=x=>Buffer.from(JSON.stringify(x));
const entry=()=>({Id:ID,Names:[NAME],Image:IMAGE,ImageID:IMAGE_ID,
  Command:'sh -c CANARY_PRIVATE',Created:CREATED,Ports:[],Mounts:[],
  Labels:{...LABELS},State:'running',Status:'Up 2 minutes',
  HostConfig:{NetworkMode:'none'},NetworkSettings:{Networks:{}},
  Ignored:{Opaque:'CANARY_PRIVATE'}});
const detail=()=>({Id:ID,Name:NAME,Image:IMAGE_ID,Created:stamp,
  State:{Status:'running',Running:true,Pid:12345},
  Config:{Image:IMAGE,Labels:{...LABELS},Tty:false,Env:[],
    Cmd:['CANARY_PRIVATE'],ExposedPorts:{}},
  HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true,
    Binds:null,Mounts:[],Devices:[],CapAdd:null,PortBindings:{}},
  Mounts:[],NetworkSettings:{Networks:{},Ports:{}},
  LogPath:'/private/CANARY_PRIVATE.log',Path:'/private/CANARY_PRIVATE',
  Opaque:{Private:'CANARY_PRIVATE'}});
const err=(fn,code)=>assert.throws(fn,new RegExp('R7B4_BLOCKED_'+code));
const targetList=changes=>[{...entry(),...changes}];
const targetInspect=changes=>({...detail(),...changes});

test('R7B4-01 valid LIST projects a single bounded synthetic item',()=>{
  const result=JSON.parse(list(body([entry()])).toString());
  assert.equal(result.length,1); assert.equal(result[0].Id,ID);assert.equal(result[0].Created,CREATED);
});
test('R7B4-02 valid INSPECT projects only safe synthetic metadata',()=>{
  const result=JSON.parse(inspect(body(detail()),ID).toString());
  assert.equal(result.Id,ID);assert.equal(result.Image,IMAGE_ID);
  assert.equal(result.State.Running,true);
});
test('R7B4-03 valid PAIR checks LIST/INSPECT coherence before release',()=>{
  const result=pair(body([entry()]),body(detail()),ID);
  assert.equal(JSON.parse(result.list.toString())[0].Created,CREATED);
  assert.equal(JSON.parse(result.inspect.toString()).Id,ID);
});
test('R7B4-04 accepts additional real-shaped noncritical LIST keys',()=>{
  const o=entry();o.Ports=[];o.Command='/bin/sh';o.SizeRootFs=4096;
  assert.equal(JSON.parse(list(body([o]))).length,1);
});
test('R7B4-05 accepts additional real-shaped noncritical INSPECT keys',()=>{
  const o=detail();o.State.Pid=54321;o.GraphDriver={Name:'overlay2',Data:{Secret:'CANARY_PRIVATE'}};
  assert.equal(JSON.parse(inspect(body(o),ID)).Id,ID);
});
test('R7B4-06 no private values forwarded from LIST',()=>{
  const out=list(body([entry()])).toString();
  assert.doesNotMatch(out,/CANARY_PRIVATE|Command|Ignored|Opaque|SizeRootFs/);
});
test('R7B4-07 no private paths or environment forwarded from INSPECT',()=>{
  const out=inspect(body(detail()),ID).toString();
  assert.doesNotMatch(out,/CANARY_PRIVATE|LogPath|\/private|Cmd|Env|Opaque|Pid/);
});
test('R7B4-08 foreign entries are excluded even when private metadata exists',()=>{
  const stranger={...entry(),Id:FOREIGN,Names:['/foreign'],Private:'CANARY_PRIVATE'};
  const projected=JSON.parse(list(body([stranger,entry()])).toString());
  assert.equal(projected.length,1);assert.equal(projected[0].Id,ID);
});
test('R7B4-09 foreign-only response returns empty LIST',()=>{
  const out=JSON.parse(list(body([{...entry(),Id:FOREIGN}])).toString());
  assert.deepEqual(out,[]);
});
test('R7B4-10 missing LIST fixture blocks paired release',()=>{
  err(()=>pair(body([{...entry(),Id:FOREIGN}]),body(detail()),ID),'LIST_MISSING');
});
test('R7B4-11 duplicate target LIST item blocks entire response',()=>{
  err(()=>list(body([entry(),entry()])),'LIST_DUPLICATE');
});
test('R7B4-12 malformed foreign ID blocks entire response',()=>{
  err(()=>list(body([{...entry(),Id:'not-an-id'},entry()])),'LIST_ITEM');
});
test('R7B4-13 null foreign entry blocks without exposing valid target',()=>{
  err(()=>list(body([entry(),null])),'LIST_ITEM');
});
for(const [label,changes] of [
  ['wrong name',{Names:['/foreign']}],
  ['multiple names',{Names:[NAME,'/extra']}],
  ['wrong repository digest',{Image:IMAGE.replace('b','f')}],
  ['wrong image config ID',{ImageID:'sha256:'+'f'.repeat(64)}],
  ['extra tenant label',{Labels:{...LABELS,tenant:'other'}}],
  ['wrong state',{State:'exited'}],
  ['down status',{Status:'Exited (0) 1 second ago'}],
  ['unsafe network',{HostConfig:{NetworkMode:'bridge'}}],
  ['mounted path',{Mounts:[{Source:'/private'}]}],
  ['exposed port',{Ports:[{PrivatePort:80,PublicPort:80}]}],
  ['network attachment',{NetworkSettings:{Networks:{bridge:{}}}}],
  ['bad created seconds',{Created:'not-a-number'}],
  ['created too old',{Created:1}],
]) test('R7B4-LIST denies '+label,()=>err(()=>list(body(targetList(changes))),'LIST_TARGET'));

test('R7B4-14 rejects LIST with more than 12 entries',()=>{
  err(()=>list(body(Array.from({length:13},(_,i)=>({...entry(),Id:String(i).padStart(64,'0')})))),'LIST_SCOPE');
});
test('R7B4-15 rejects object instead of LIST array',()=>err(()=>list(body(entry())),'LIST_SCOPE'));
test('R7B4-16 rejects wrong requested INSPECT ID before parsing',()=>{
  err(()=>inspect(body(detail()),FOREIGN),'REQUESTED_ID');
});
test('R7B4-17 rejects wrong requested ID in PAIR',()=>{
  err(()=>pair(body([entry()]),body(detail()),FOREIGN),'REQUESTED_ID');
});
for(const [label,changes] of [
  ['foreign ID',{Id:FOREIGN}],
  ['foreign name',{Name:'/foreign'}],
  ['wrong image ID',{Image:'sha256:'+'f'.repeat(64)}],
  ['not running',{State:{Status:'exited',Running:false}}],
  ['wrong config image',{Config:{...detail().Config,Image:'latest'}}],
  ['extra tenant label',{Config:{...detail().Config,Labels:{...LABELS,tenant:'outsider'}}}],
  ['TTY enabled',{Config:{...detail().Config,Tty:true}}],
  ['nonempty Env',{Config:{...detail().Config,Env:['TOKEN=CANARY_PRIVATE']}}],
  ['exposed ports',{Config:{...detail().Config,ExposedPorts:{'80/tcp':{}}}}],
  ['privileged',{HostConfig:{...detail().HostConfig,Privileged:true}}],
  ['writable filesystem',{HostConfig:{...detail().HostConfig,ReadonlyRootfs:false}}],
  ['host network',{HostConfig:{...detail().HostConfig,NetworkMode:'host'}}],
  ['bind mount',{HostConfig:{...detail().HostConfig,Binds:['/private:/secret']}}],
  ['mount definitions',{HostConfig:{...detail().HostConfig,Mounts:[{Target:'/private'}]}}],
  ['device passthrough',{HostConfig:{...detail().HostConfig,Devices:[{PathOnHost:'/dev/sda'}]}}],
  ['extra capabilities',{HostConfig:{...detail().HostConfig,CapAdd:['SYS_ADMIN']}}],
  ['port bindings',{HostConfig:{...detail().HostConfig,PortBindings:{'80/tcp':[{HostPort:'8080'}]}}}],
  ['mounts',{Mounts:[{Source:'/private'}]}],
  ['network attachment',{NetworkSettings:{...detail().NetworkSettings,Networks:{bridge:{}}}}],
  ['open ports',{NetworkSettings:{Networks:{},Ports:{'80/tcp':[{'HostPort':'8080'}]}}}],
  ['malformed timestamp',{Created:'2026-02-30T00:00:00Z'}],
]) test('R7B4-INSPECT denies '+label,()=>err(()=>inspect(body(targetInspect(changes)),ID),
  label==='malformed timestamp'?'INSPECT_CREATED':'INSPECT_TARGET'));

test('R7B4-18 pair rejects timestamp drift even when both bodies individually valid',()=>{
  const o=detail();o.Created=new Date((CREATED+1)*1000).toISOString();
  err(()=>pair(body([entry()]),body(o),ID),'CREATED_DRIFT');
});
test('R7B4-19 inspect preserves RFC3339Nano 9-digit fraction',()=>{
  const o=detail();o.Created=stamp.replace('.000Z','.123456789Z');
  assert.equal(JSON.parse(inspect(body(o),ID)).Created,o.Created);
});
test('R7B4-20 invalid JSON bodies rejected',()=>{
  err(()=>list(Buffer.from('[broken')),'JSON_SYNTAX');
});
test('R7B4-21 non-Buffer input fails before parsing',()=>err(()=>list('[ ]'),'BODY_SCOPE'));
test('R7B4-22 BOM input refused',()=>err(()=>list(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),body([entry()])])),'BOM'));
test('R7B4-23 invalid UTF-8 fails closed',()=>err(()=>list(Buffer.from([91,0xc3,0x28,93])),'UTF8'));
test('R7B4-24 body exceeding quota denied',()=>err(()=>list(Buffer.alloc(32769,32)),'BODY_SCOPE'));
test('R7B4-25 duplicate JSON key (same spelling) rejected',()=>{
  const raw=`[{"Id":"${ID}","Id":"${FOREIGN}"}]`;
  err(()=>list(Buffer.from(raw)),'JSON_DUPLICATE');
});
test('R7B4-26 unicode escaped equivalent duplicate JSON key rejected',()=>{
  const raw=`[{"Id":"${ID}","\\u0049d":"${FOREIGN}"}]`;
  err(()=>list(Buffer.from(raw)),'JSON_DUPLICATE');
});
test('R7B4-27 duplicate key in foreign entry also rejected',()=>{
  const raw=`[{"Id":"${FOREIGN}","Private":{"a":1,"a":2}},{"Id":"${ID}"}]`;
  err(()=>list(Buffer.from(raw)),'JSON_DUPLICATE');
});
test('R7B4-28 depth limit rejected',()=>{
  const raw='['.repeat(13)+'{}'+']'.repeat(13);
  err(()=>list(Buffer.from(raw)),'JSON_DEPTH');
});
test('R7B4-29 projected Buffers independent from input',()=>{
  const b=body([entry()]);const out=list(b);const snapshot=Buffer.from(out);
  b.fill(0);assert.deepEqual(out,snapshot);out.fill(0);
  assert.equal(JSON.parse(list(body([entry()])))[0].Id,ID);
});
test('R7B4-30 pair cannot publish partial metadata on bad inspect',()=>{
  err(()=>pair(body([entry()]),body({...detail(),Name:'/other'}),ID),'INSPECT_TARGET');
});
test('R7B4-31 constant synthetic identity only, no real Docker provenance',()=>{
  const item=JSON.parse(list(body([entry()])))[0];
  assert.equal(item.Id,'a'.repeat(64));assert.equal(item.ImageID,'sha256:'+'c'.repeat(64));
});
test('R7B4-32 source does not import network, filesystem, transport or Docker',()=>{
  const s=readFileSync(new URL('../src/r7b-offline-docker-api-normalizer.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/^\s*import\b/m);
  assert.doesNotMatch(s,/\b(?:fetch|spawn|child_process|createServer|createConnection|readFileSync|writeFileSync|Dockerode)\b/);
  assert.doesNotMatch(s,/docker\.sock|host\.docker\.internal|f5solucoes\.net|github_pat_/);
});

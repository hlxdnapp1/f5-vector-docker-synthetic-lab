import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runR7B11SyntheticSession as run,assertR7B11GeneratedEventWire as verify} from '../src/r7b-vector053-offline-contract-session.mjs';
import {renderR7BVector053SyntheticEvent as render} from '../src/r7b-vector053-wire-contract.mjs';
import {createR7BSyntheticStream} from '../src/r7b-bounded-synthetic-stream.mjs';
const ID='a'.repeat(64),STAMP='2026-11-17T12:00:00.123456789Z',NOW=1794916801;
const session=()=>run({created:STAMP,nowSeconds:NOW});
const args=()=>({action:'start',time:NOW,timeNano:'1794916801000000000'});
const event=()=>render(args());
const denied=(f,k)=>assert.throws(f,new RegExp('R7B11_BLOCKED_'+k));
const checks=[
['GET-only four operations',()=>{const p=session().plan;assert.deepEqual(Object.keys(p),['list','inspect','events','logs']);for(const v of Object.values(p))assert.equal(v.method,'GET');}],
['LIST filters owned fixture',()=>{const p=session().plan;assert.equal(p.list.query.all,false);assert.deepEqual(p.list.query.filters.label,['r7b.lab.owner=LAB_ONLY']);}],
['INSPECT ID exact',()=>assert.equal(session().plan.inspect.path,'/containers/'+ID+'/json')],
['LOGS ID exact',()=>assert.equal(session().plan.logs.path,'/containers/'+ID+'/logs')],
['LOGS follow read-only flags',()=>assert.deepEqual(session().plan.logs.query,{follow:true,stdout:true,stderr:true,since:NOW-1,timestamps:true})],
['LIST one running fixture',()=>{const a=JSON.parse(session().list);assert.equal(a.length,1);assert.equal(a[0].Id,ID);assert.equal(a[0].State,'running');}],
['INSPECT exact RFC3339Nano',()=>assert.equal(JSON.parse(session().inspect).Created,STAMP)],
['LIST creation second',()=>assert.equal(JSON.parse(session().list)[0].Created,1794916800)],
['name and images match',()=>{const a=session(),l=JSON.parse(a.list)[0],i=JSON.parse(a.inspect);assert.equal(i.Name,'/r7b-synthetic-fixture');assert.equal(l.Image,i.Config.Image);assert.equal(l.ImageID,i.Image);}],
['labels match',()=>{const a=session();assert.deepEqual(JSON.parse(a.list)[0].Labels,JSON.parse(a.inspect).Config.Labels);}],
['no private raw fields',()=>{const a=session();assert.doesNotMatch(a.list.toString()+a.inspect.toString(),/Env|LogPath|GraphDriver|CANARY|host\.docker/);}],
['four official actions',()=>assert.deepEqual(session().events.map(b=>JSON.parse(b).Action),['start','unpause','die','pause'])],
['fixed actor identity',()=>{for(const b of session().events)assert.equal(JSON.parse(b).Actor.ID,ID);}],
['fixed actor attributes',()=>{for(const b of session().events)assert.deepEqual(JSON.parse(b).Actor.Attributes,{name:'r7b-synthetic-fixture','r7b.lab.owner':'LAB_ONLY'});}],
['numeric timeNano',()=>{for(const b of session().events)assert.match(b.toString(),/"timeNano":179491680100000000[0-3]\}\n$/);}],
['one-nanosecond steps remain exact',()=>{const vals=session().events.map(b=>BigInt(b.toString().match(/"timeNano":([0-9]+)\}/)[1]));for(let i=1;i<4;i++)assert.equal(vals[i]-vals[i-1],1n);assert.ok(vals[0]>BigInt(Number.MAX_SAFE_INTEGER));}],
['legacy parser rejects numeric events',()=>{const p=createR7BSyntheticStream('EVENTS');assert.throws(()=>p.push(session().events[0]),/R7B_BLOCKED_INVALID_EVENT_IDENTITY/);assert.equal(p.status().state,'FAILED');}],
['canonical event equality accepted',()=>assert.equal(verify(event(),args()),true)],
['nanosecond tamper rejected',()=>denied(()=>verify(Buffer.from(event().toString().replace('1000000000','1000000001')),args()),'EVENT_WIRE')],
['quoted timeNano rejected',()=>denied(()=>verify(Buffer.from(event().toString().replace('"timeNano":1794916801000000000','"timeNano":"1794916801000000000"')),args()),'EVENT_WIRE')],
['duplicate Action rejected',()=>denied(()=>verify(Buffer.from(event().toString().replace('"Action":"start"','"Action":"start","Action":"die"')),args()),'EVENT_WIRE')],
['foreign ID rejected',()=>denied(()=>verify(Buffer.from(event().toString().replace(ID,'b'.repeat(64))),args()),'EVENT_WIRE')],
['foreign label rejected',()=>denied(()=>verify(Buffer.from(event().toString().replace('LAB_ONLY','OTHER')),args()),'EVENT_WIRE')],
['truncation rejected',()=>denied(()=>verify(event().subarray(0,event().length-1),args()),'EVENT_WIRE')],
['wrong event shape rejected',()=>{denied(()=>verify({},args()),'EVENT_SCOPE');denied(()=>verify(Buffer.alloc(769),args()),'EVENT_SCOPE');}],
['bad event generator inputs rejected',()=>{denied(()=>verify(event(),{action:'start',time:NOW}),'EVENT_INPUT');denied(()=>verify(event(),{...args(),action:'die'}),'EVENT_WIRE');}],
['two mux log channels',()=>assert.deepEqual(session().logs.map(b=>b[0]),[1,2])],
['log mux header reserved bytes',()=>{for(const b of session().logs)assert.deepEqual([...b.subarray(1,4)],[0,0,0]);}],
['log mux big-endian lengths',()=>{for(const b of session().logs)assert.equal(b.readUInt32BE(4),b.length-8);}],
['log precision and synthetic marker',()=>{for(const b of session().logs)assert.equal(b.subarray(8).toString(),STAMP+' R7B_PUBLIC_SYNTHETIC_ONLY\n');}],
['legacy log parser fragmentation',()=>{const s=session(),p=createR7BSyntheticStream('LOGS'),got=[];for(const w of s.logs)for(let i=0;i<w.length;i+=3){p.push(Buffer.from(w.subarray(i,i+3)));got.push(...p.take());}assert.equal(p.finish().state,'ENDED');assert.deepEqual(got,s.logs);}],
['independent mutable buffers',()=>{const a=session(),b=session();a.list.fill(0);a.inspect.fill(0);a.events[0].fill(0);a.logs[0].fill(0);assert.equal(JSON.parse(b.list)[0].Id,ID);assert.ok(b.events[0][0]&&b.logs[0][0]);}],
['missing and extra scope denied',()=>{denied(()=>run({created:STAMP}),'SCOPE');denied(()=>run({created:STAMP,nowSeconds:NOW,secret:true}),'SCOPE');}],
['inherited shape and getters denied',()=>{denied(()=>run(Object.create({created:STAMP,nowSeconds:NOW})),'SCOPE');let seen=0;const x={created:STAMP};Object.defineProperty(x,'nowSeconds',{enumerable:true,get(){seen++;return NOW;}});denied(()=>run(x),'SCOPE');assert.equal(seen,0);}],
['invalid times denied',()=>{denied(()=>run({created:STAMP,nowSeconds:NOW-2}),'CROSS_CONTRACT');denied(()=>run({created:'2026-02-30T12:00:00Z',nowSeconds:NOW}),'METADATA');for(const n of [0,2147483648,NaN,'1794916801'])denied(()=>run({created:STAMP,nowSeconds:n}),'CLOCK');}],
['upper i32 clock and offline boundary',()=>{assert.equal(run({created:STAMP,nowSeconds:2147483647}).events.length,4);const source=readFileSync(new URL('../src/r7b-vector053-offline-contract-session.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:fetch\(|createServer\(|docker\.sock|DOCKER_HOST)\b/);assert.equal(session().kind,'OFFLINE_PUBLIC_SYNTHETIC_ONLY');}]
];
assert.equal(checks.length,36);
for(let i=0;i<checks.length;i++)test('R7B11-'+String(i+1).padStart(2,'0')+' '+checks[i][0],checks[i][1]);

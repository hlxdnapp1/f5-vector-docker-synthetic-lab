import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planR7BVector053ReadOnly, renderR7BVector053SyntheticEvent, r7bVector053ContractFacts} from '../src/r7b-vector053-wire-contract.mjs';

const ID='a'.repeat(64), NOW=1794860000;
const names=['start','unpause','die','pause'];
const plan=()=>planR7BVector053ReadOnly({nowSeconds:NOW,containerId:ID});
const emit=(action='start',timeNano='1794860000000000001')=>renderR7BVector053SyntheticEvent({action,time:NOW,timeNano});
const failure=(fn,reason)=>assert.throws(fn,new RegExp('R7B_VECTOR053_BLOCKED_'+reason));

test('R7B5-01 pinned source references Vector official v0.53.0',()=>{
  const f=r7bVector053ContractFacts();
  assert.equal(f.sourceTag,'v0.53.0');
  assert.equal(f.sourceCommit,'2b51b40a7a0b40996350d73cf46791c7e991fcb6');
  assert.equal(f.sourceBlob,'45268788d45cc869f36b34d9b9791c05cd7b3e83');
});
test('R7B5-02 plan has exactly four GET-only operations',()=>{
  const p=plan();assert.deepEqual(Object.keys(p),['list','inspect','events','logs']);
  for(const op of Object.values(p)) assert.equal(op.method,'GET');
});
test('R7B5-03 LIST filters label on running containers only',()=>{
  assert.equal(plan().list.path,'/containers/json');
  assert.equal(plan().list.query.all,false);
  assert.deepEqual(plan().list.query.filters.label,['r7b.lab.owner=LAB_ONLY']);
});
test('R7B5-04 INSPECT uses only the full synthetic ID',()=>{
  assert.equal(plan().inspect.path,`/containers/${ID}/json`);
});
test('R7B5-05 EVENTS includes four Vector actions in exact order',()=>{
  const f=plan().events;
  assert.equal(f.path,'/events');
  assert.deepEqual(f.query.filters.event,names);
  assert.deepEqual(f.query.filters.type,['container']);
  assert.deepEqual(f.query.filters.label,['r7b.lab.owner=LAB_ONLY']);
});
test('R7B5-06 events since = Vector source start seconds',()=>{
  assert.equal(plan().events.query.since,String(NOW));
});
test('R7B5-07 LOGS follow true, stdout/stderr true, timestamps true',()=>{
  const q=plan().logs.query;
  assert.deepEqual(q,{follow:true,stdout:true,stderr:true,since:NOW-1,timestamps:true});
});
test('R7B5-08 LOGS target is exactly the synthetic ID',()=>{
  assert.equal(plan().logs.path,`/containers/${ID}/logs`);
});
test('R7B5-09 refuses arbitrary Docker identity, partial ID or empty ID',()=>{
  for(const value of ['b'.repeat(64),'a'.repeat(12),'','../../etc/passwd',null])
    failure(()=>planR7BVector053ReadOnly({nowSeconds:NOW,containerId:value}),'CONTAINER_ID');
});
test('R7B5-10 rejects timestamps crossing Vector i32 since guard',()=>{
  for(const v of [2147483648,0,-1,1,NaN,Infinity,1.5,'1794860000',null])
    failure(()=>planR7BVector053ReadOnly({nowSeconds:v,containerId:ID}),'SINCE_SECONDS');
});
test('R7B5-11 still accepts upper i32 limit without wrapping',()=>{
  const p=planR7BVector053ReadOnly({nowSeconds:2147483647,containerId:ID});
  assert.equal(p.logs.query.since,2147483646);
});
test('R7B5-12 rejects extra, missing, inherited argument properties',()=>{
  failure(()=>planR7BVector053ReadOnly({nowSeconds:NOW,containerId:ID,secret:true}),'ARGUMENT_FIELDS');
  failure(()=>planR7BVector053ReadOnly({nowSeconds:NOW}),'ARGUMENT_FIELDS');
  failure(()=>planR7BVector053ReadOnly(Object.create({nowSeconds:NOW,containerId:ID})),'ARGUMENT_SHAPE');
});
test('R7B5-13 disallows getter invocation for plan arguments',()=>{
  let touched=0;const args={containerId:ID};
  Object.defineProperty(args,'nowSeconds',{enumerable:true,get(){touched++;return NOW;}});
  failure(()=>planR7BVector053ReadOnly(args),'ACCESSOR');
  assert.equal(touched,0);
});
test('R7B5-14 plan and options are immutable',()=>{
  const p=plan();assert.ok(Object.isFrozen(p));
  assert.ok(Object.isFrozen(p.events.query.filters.event));
  assert.ok(Object.isFrozen(p.logs.query));
  assert.throws(()=>{p.events.query.filters.event.push('destroy');},TypeError);
});
test('R7B5-15 emits every action, using official EventMessage JSON keys',()=>{
  for(const action of names){
    const s=emit(action).toString();
    assert.match(s,/"Type":"container"/);
    assert.match(s, new RegExp('"Action":"'+action+'"'));
    assert.match(s, new RegExp('"ID":"'+ID+'"'));
    assert.match(s,/"Attributes":\{"name":"r7b-synthetic-fixture","r7b.lab.owner":"LAB_ONLY"\}/);
  }
});
test('R7B5-16 timeNano is JSON number, not quoted string',()=>{
  assert.match(emit().toString(),/,"timeNano":1794860000000000001\}\n$/);
  assert.doesNotMatch(emit().toString(),/,"timeNano":"/);
});
test('R7B5-17 preserves 1 nanosecond without JavaScript Number roundtrip',()=>{
  const text=emit('start','1794860000000000001').toString();
  assert.match(text,/1794860000000000001/);
  assert.ok(Number('1794860000000000001')!==1794860000000000001n);
});
test('R7B5-18 preserves maximal nanosecond offset',()=>{
  assert.match(emit('die','1794860000999999999').toString(),/1794860000999999999/);
});
test('R7B5-19 different action has same integer temporal contract',()=>{
  for(const action of names)assert.match(emit(action).toString(),/"timeNano":1794860000000000001/);
});
test('R7B5-20 denies unknown action, casing, dangerous event names',()=>{
  for(const v of ['destroy','create','restart','START','',null,42])
    failure(()=>renderR7BVector053SyntheticEvent({action:v,time:NOW,timeNano:'1794860000000000000'}),'ACTION');
});
test('R7B5-21 rejects quoted JSON token or leading zero for timeNano',()=>{
  for(const v of ['"1794860000000000001"','01794860000000000001','0','1e18','+1794860000000000000'])
    failure(()=>renderR7BVector053SyntheticEvent({action:'start',time:NOW,timeNano:v}),'NANO_TOKEN');
});
test('R7B5-22 refuses nanoseconds from another second',()=>{
  for(const v of ['1794860001000000000','1794859999999999999'])
    failure(()=>renderR7BVector053SyntheticEvent({action:'start',time:NOW,timeNano:v}),'NANO_TIME');
});
test('R7B5-23 refuses timeNano beyond signed 64-bit',()=>{
  failure(()=>renderR7BVector053SyntheticEvent({action:'start',time:NOW,timeNano:'9223372036854775808'}),'NANO_TIME');
});
test('R7B5-24 refuses JS numeric timeNano, even though it looks numeric',()=>{
  failure(()=>renderR7BVector053SyntheticEvent({action:'start',time:NOW,timeNano:1794860000000000000}),'NANO_TOKEN');
});
test('R7B5-25 rejects ambiguous options, extra props, inherited object and getters',()=>{
  failure(()=>renderR7BVector053SyntheticEvent({action:'start',time:NOW,timeNano:'1794860000000000000',unsafe:'secret'}),'ARGUMENT_FIELDS');
  failure(()=>renderR7BVector053SyntheticEvent(Object.create({action:'start',time:NOW,timeNano:'1794860000000000000'})),'ARGUMENT_SHAPE');
  let touched=0;const args={action:'start',time:NOW};Object.defineProperty(args,'timeNano',{enumerable:true,get(){touched++;return '1794860000000000000';}});
  failure(()=>renderR7BVector053SyntheticEvent(args),'ACCESSOR');assert.equal(touched,0);
});
test('R7B5-26 emitted JSON includes only public synthetic fields',()=>{
  const text=emit().toString();
  assert.doesNotMatch(text,/secret|token|password|host\.docker|f5solucoes|LogPath|Env|Mounts/);
  assert.deepEqual(Object.keys(JSON.parse(text)),['Type','Action','Actor','time','timeNano']);
});
test('R7B5-27 generated buffer remains independent across calls',()=>{
  const x=emit(),y=emit();x.fill(0);assert.notEqual(y[0],0);
});
test('R7B5-28 the wire contract is offline and cannot invoke Docker or HTTP',()=>{
  const source=readFileSync(new URL('../src/r7b-vector053-wire-contract.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/^\s*import\b/m);
  assert.doesNotMatch(source,/\b(?:fetch|spawn|child_process|createServer|createConnection|readFileSync|writeFileSync|Dockerode|docker\.sock)\b/);
});

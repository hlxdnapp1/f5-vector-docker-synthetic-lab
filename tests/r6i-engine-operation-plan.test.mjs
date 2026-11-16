import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeR6IWorkload, verifyR6IImageInspect, makeR6ICreateBody,
  planR6IOperation, verifyR6IContainerInspect, verifyR6IRecovery,
  makeR6IJournal, advanceR6IJournal
} from '../src/r6i-engine-operation-plan.mjs';

const id='c'.repeat(64), outsider='d'.repeat(64);
const manifestDigest='sha256:'+'e'.repeat(64);
const imageRef='docker.io/library/busybox@'+manifestDigest;
const imageConfigId='sha256:'+'f'.repeat(64);
const nonce='12345678'.repeat(4);
const base={owner:'hlxdnapp1/f5-vector-docker-synthetic-lab',nonce,runId:314,nowSec:1900000000,imageRef,imageConfigId};
const workload=()=>makeR6IWorkload(base);
const imageInspect=()=>({Id:imageConfigId,RepoDigests:[imageRef],Os:'linux',Architecture:'amd64',RootFS:{Layers:['sha256:'+'1'.repeat(64)]}});
const inspect=(m=workload(), role='authorized', actualId=id, overrides={})=>{
  const b=makeR6ICreateBody(m,role),n=m.roles.find(x=>x.role===role).name;
  return {Id:actualId,Image:imageConfigId,Name:'/'+n,Created:new Date((m.nowSec-2)*1000).toISOString(),RestartCount:0,
    Config:{Image:m.imageRef,User:b.User,Tty:false,Labels:{...b.Labels}},
    HostConfig:{...structuredClone(b.HostConfig)},Mounts:[],State:{Running:false},...overrides};
};
const advance=(m,j,role,event,data)=>advanceR6IJournal(m,j,role,event,data);
const intent=(m=workload(),role='authorized')=>advance(m,makeR6IJournal(m),role,'intent-create');
const created=(m=workload(),role='authorized',realId=id)=>advance(m,intent(m,role),role,'created',{id:realId});
const attested=(m=workload(),role='authorized',realId=id)=>advance(m,created(m,role,realId),role,'attested',inspect(m,role,realId));
const active=(m=workload(),role='authorized',realId=id)=>advance(m,attested(m,role,realId),role,'started',inspect(m,role,realId,{State:{Running:true}}));

test('R6I-01 demands exact public owner, nonce, run and separated image identities',()=>{
  const m=workload();assert.equal(m.owner,base.owner);assert.equal(m.mode,'OFFLINE_OPERATION_PLAN_ONLY');
  assert.notEqual(m.imageConfigId,m.imageRef.slice(m.imageRef.indexOf('sha256:')));
  assert.deepEqual(m.roles.map(x=>x.role),['authorized','outsider']);
});
test('R6I-02 invalid registry, missing digest, tag, nonce or run fails closed',()=>{
  for(const patch of [{owner:'other'},{nonce:'oops'},{runId:0},{nowSec:-1},
    {imageRef:'busybox:latest'},{imageRef:'docker.io/library/busybox:latest'},
    {imageRef:'example.invalid/private@'+manifestDigest},
    {imageConfigId:'sha256:'+'0'.repeat(64)}]) {
    assert.throws(()=>makeR6IWorkload({...base,...patch}),/R6I_BLOCKED_MANIFEST/);
  }
});
test('R6I-03 image manifest digest and image config ID validated separately',()=>{
  assert.equal(verifyR6IImageInspect(workload(),imageInspect()),true);
  assert.equal(verifyR6IImageInspect(workload(),{...imageInspect(),Id:manifestDigest}),false);
  assert.equal(verifyR6IImageInspect(workload(),{...imageInspect(),RepoDigests:['other@'+manifestDigest]}),false);
});
test('R6I-04 no create plan without write-ahead intent and attested cached image',()=>{
  const m=workload();
  assert.throws(()=>planR6IOperation(m,'authorized','create',{imageInspect:imageInspect()}),/CREATE_LEDGER/);
  assert.throws(()=>planR6IOperation(m,'authorized','create',{journal:intent(m)}),/IMAGE_NOT_ATTESTED/);
  assert.equal(planR6IOperation(m,'authorized','create',{journal:intent(m),imageInspect:imageInspect()}).method,'POST');
});
test('R6I-05 create plan is inert and uses a strict, digest-pinned security contract',()=>{
  const m=workload();const p=planR6IOperation(m,'authorized','create',{journal:intent(m),imageInspect:imageInspect()});
  assert.equal(p.inert,true);assert.equal(p.body.Image,imageRef);assert.equal(p.body.User,'10001:10001');
  assert.equal(p.body.HostConfig.Privileged,false);assert.equal(p.body.HostConfig.NetworkMode,'none');
  assert.equal(p.body.HostConfig.ReadonlyRootfs,true);assert.deepEqual(p.body.HostConfig.Binds,[]);
  assert.deepEqual(p.body.HostConfig.Mounts,[]);assert.deepEqual(p.body.HostConfig.CapDrop,['ALL']);
  assert.equal(p.body.HostConfig.AutoRemove,true);assert.equal(p.body.HostConfig.PublishAllPorts,false);
});
test('R6I-06 no privileged mounts, shared network or production identifiers in create body',()=>{
  const p=makeR6ICreateBody(workload(),'authorized');
  assert.equal(p.Labels['f5.synthetic.lab'],'R6G_ONLY');
  assert.equal(p.Labels['f5.synthetic.nonce'],nonce);assert.equal(p.Labels['f5.synthetic.run'],'314');
  assert.doesNotMatch(JSON.stringify(p),/f5solucoes\.net|prod|SECRET_CANARY|host\.docker\.internal|2375/i);
  assert.ok(p.Cmd.join(' ').includes('R6F_PUBLIC_SYNTHETIC_ONLY'));
});
test('R6I-07 image inspect GET planning never pulls or mutates an image',()=>{
  const p=planR6IOperation(workload(),'authorized','image-inspect');
  assert.equal(p.inert,true);assert.equal(p.method,'GET');
  assert.ok(p.path.startsWith('/images/'));assert.match(p.path,/\/json$/);
});
test('R6I-08 operation planner rejects unknown role and unknown mutation',()=>{
  assert.throws(()=>planR6IOperation(workload(),'admin','create'),/ROLE/);
  assert.throws(()=>planR6IOperation(workload(),'authorized','prune'),/UNKNOWN_OPERATION/);
});
test('R6I-09 Docker create and recover paths are owner scoped, not broad prune',()=>{
  const m=workload();
  const create=planR6IOperation(m,'authorized','create',{journal:intent(m),imageInspect:imageInspect()});
  assert.equal(create.path,'/containers/create?name=r6g-synthetic-'+nonce.slice(0,8));
  let j=advance(m,intent(m),'authorized','create-uncertain');
  const r=planR6IOperation(m,'authorized','recover-by-owner',{journal:j});
  assert.equal(r.method,'GET');assert.match(decodeURIComponent(r.path),/f5.synthetic.nonce/);
  assert.match(decodeURIComponent(r.path),/f5.synthetic.run/);
  assert.match(decodeURIComponent(r.path),/f5.synthetic.role/);
  assert.doesNotMatch(r.path,/prune/);
});
test('R6I-10 inspect evidence matches R6G name/labels/image config ID',()=>{
  const m=workload(),proof=inspect(m);
  assert.equal(verifyR6IContainerInspect(m,'authorized',id,proof),true);
  assert.equal(proof.Config.Labels['f5.synthetic.lab'],'R6G_ONLY');
  assert.equal(proof.Name,'/r6g-synthetic-'+nonce.slice(0,8));
});
test('R6I-11 inspect label ordering does not create a false rejection',()=>{
  const m=workload(),proof=inspect(m);proof.Config.Labels=Object.fromEntries(Object.entries(proof.Config.Labels).reverse());
  assert.equal(verifyR6IContainerInspect(m,'authorized',id,proof),true);
});
test('R6I-12 reject any identity, image, label or resource mismatch before mutation',()=>{
  const m=workload();
  for(const bad of [
    inspect(m,'authorized',outsider),inspect(m,'authorized',id,{Image:manifestDigest}),
    inspect(m,'authorized',id,{Mounts:[{Source:'/etc'}]}),
    inspect(m,'authorized',id,{HostConfig:{...inspect(m).HostConfig,NetworkMode:'host'}}),
    inspect(m,'authorized',id,{Config:{...inspect(m).Config,Labels:{}}}),
    inspect(m,'authorized',id,{RestartCount:2})
  ])assert.equal(verifyR6IContainerInspect(m,'authorized',id,bad),false);
});
test('R6I-13 read-only inspect requires owned ID from ledger',()=>{
  const m=workload();
  assert.throws(()=>planR6IOperation(m,'authorized','inspect',{id}),/INSPECT_LEDGER/);
  assert.equal(planR6IOperation(m,'authorized','inspect',{id,journal:created(m)}).method,'GET');
  assert.throws(()=>planR6IOperation(m,'authorized','inspect',{id:outsider,journal:created(m)}),/INSPECT_LEDGER/);
});
test('R6I-14 start forbidden without journal attestation and matching live proof',()=>{
  const m=workload();
  assert.throws(()=>planR6IOperation(m,'authorized','start',{id,journal:created(m),inspectProof:inspect(m)}),/START_LEDGER_OR_PROOF/);
  assert.throws(()=>planR6IOperation(m,'authorized','start',{id,journal:attested(m),inspectProof:inspect(m,'authorized',id,{Image:manifestDigest})}),/START_LEDGER_OR_PROOF/);
  assert.equal(planR6IOperation(m,'authorized','start',{id,journal:attested(m),inspectProof:inspect(m)}).path,'/containers/'+id+'/start');
});
test('R6I-15 stop and delete are gated by cleanup intent plus freshly matching inspect',()=>{
  const m=workload(),j=active(m),running=inspect(m,'authorized',id,{State:{Running:true}});
  assert.throws(()=>planR6IOperation(m,'authorized','stop',{id,journal:j,inspectProof:running}),/STOP_LEDGER_OR_PROOF/);
  const intentCleanup=advance(m,j,'authorized','intent-cleanup',running);
  assert.equal(planR6IOperation(m,'authorized','stop',{id,journal:intentCleanup,inspectProof:running}).path,'/containers/'+id+'/stop?t=3');
  assert.throws(()=>planR6IOperation(m,'authorized','delete',{id,journal:intentCleanup,inspectProof:running}),/DELETE_LEDGER_OR_PROOF/);
  assert.equal(planR6IOperation(m,'authorized','delete',{id,journal:intentCleanup,inspectProof:inspect(m)}).path,'/containers/'+id+'?force=false&v=false');
});
test('R6I-16 no mutations can be planned for outsider ID using authorized journal',()=>{
  const m=workload(),running=inspect(m,'authorized',id,{State:{Running:true}});
  const cleanup=advance(m,active(m),'authorized','intent-cleanup',running);
  for(const op of ['start','stop','delete']){
    assert.throws(()=>planR6IOperation(m,'authorized',op,{id:outsider,journal:cleanup,inspectProof:inspect(m,'authorized',outsider)}));
  }
});
test('R6I-17 unknown create result ID forces a different recovery path, never replay create',()=>{
  const m=workload(),j=advance(m,intent(m),'authorized','create-uncertain');
  assert.equal(j.roles.authorized.phase,'RECOVERY_REQUIRED');
  assert.throws(()=>planR6IOperation(m,'authorized','create',{journal:j,imageInspect:imageInspect()}),/CREATE_LEDGER/);
  assert.equal(planR6IOperation(m,'authorized','recover-by-owner',{journal:j}).method,'GET');
});
test('R6I-18 recover refuses duplicate matches, foreign or unproven containers',()=>{
  const m=workload();
  assert.equal(verifyR6IRecovery(m,'authorized',[],null).status,'ABSENT_UNCONFIRMED');
  assert.equal(verifyR6IRecovery(m,'authorized',[{Id:id},{Id:outsider}],inspect(m)).status,'BLOCKED');
  assert.equal(verifyR6IRecovery(m,'authorized',[{Id:id}],inspect(m,'authorized',id,{Image:manifestDigest})).status,'BLOCKED');
  assert.deepEqual(verifyR6IRecovery(m,'authorized',[{Id:id}],inspect(m)),{status:'RECOVERED',id});
});
test('R6I-19 journal transitions need explicit create, inspect and start evidence',()=>{
  const m=workload();let j=makeR6IJournal(m);
  assert.equal(j.roles.authorized.phase,'PLANNED');
  j=advance(m,j,'authorized','intent-create');assert.equal(j.roles.authorized.phase,'CREATE_INTENT');
  j=advance(m,j,'authorized','created',{id});assert.equal(j.roles.authorized.phase,'NEEDS_INSPECT');
  j=advance(m,j,'authorized','attested',inspect(m));assert.equal(j.roles.authorized.phase,'ATTESTED');
  j=advance(m,j,'authorized','started',inspect(m,'authorized',id,{State:{Running:true}}));
  assert.equal(j.roles.authorized.phase,'ACTIVE');
});
test('R6I-20 only both independent absence proofs can complete cleanup',()=>{
  const m=workload(),j=advance(m,active(m),'authorized','intent-cleanup',inspect(m,'authorized',id,{State:{Running:true}}));
  assert.throws(()=>advance(m,j,'authorized','absent-verified',{inspectStatus:404,matchingOwnerListCount:1}),/TRANSITION/);
  assert.throws(()=>advance(m,j,'authorized','absent-verified',{inspectStatus:200,matchingOwnerListCount:0}),/TRANSITION/);
  const cleaned=advance(m,j,'authorized','absent-verified',{inspectStatus:404,matchingOwnerListCount:0});
  assert.equal(cleaned.roles.authorized.phase,'CLEANED');assert.equal(cleaned.roles.authorized.id,null);
});
test('R6I-21 cleanup failure remains blocked, requires fresh attestation for retry',()=>{
  const m=workload(),j=advance(m,active(m),'authorized','intent-cleanup',inspect(m,'authorized',id,{State:{Running:true}}));
  const failed=advance(m,j,'authorized','cleanup-failed');
  assert.equal(failed.roles.authorized.phase,'CLEANUP_BLOCKED');
  assert.throws(()=>advance(m,failed,'authorized','absent-verified',{inspectStatus:404,matchingOwnerListCount:0}));
  const retried=advance(m,failed,'authorized','intent-cleanup',inspect(m,'authorized',id,{State:{Running:true}}));
  assert.equal(retried.roles.authorized.phase,'CLEANUP_INTENT');
});
test('R6I-22 journals are copy-on-write serializable inert data, not filesystem commits',()=>{
  const m=workload(),j=makeR6IJournal(m),updated=advance(m,j,'authorized','intent-create');
  assert.equal(j.roles.authorized.phase,'PLANNED');assert.equal(updated.roles.authorized.phase,'CREATE_INTENT');
  assert.deepEqual(JSON.parse(JSON.stringify(updated)),updated);
  assert.doesNotMatch(JSON.stringify(updated),/PASSWORD|LEAK_CANARY/);
});
test('R6I-23 Docker Engine mutating methods occur only as inert plan strings, no socket code',()=>{
  const src=readFileSync(new URL('../src/r6i-engine-operation-plan.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^\s*import\b/m);
  assert.doesNotMatch(src,/\b(?:fetch\(|createConnection\(|http\.request\(|https\.request\(|spawn\(|execFile\(|writeFileSync\(|readFileSync\()/);
  assert.doesNotMatch(src,/\/var\/run\/docker\.sock|host\.docker\.internal|docker\s+(?:run|start|stop|rm|create)\b/);
});
test('R6I-24 plans never initiate image pull/build or privileged Docker daemon operation',()=>{
  const m=workload();for(const action of ['pull','build','prune','volume-delete','kill','exec','network-create']){
    assert.throws(()=>planR6IOperation(m,'authorized',action),/UNKNOWN_OPERATION/);
  }
  const operations=['image-inspect','recover-by-owner','create','inspect','start','stop','delete'];
  assert.equal(operations.length,7);
});

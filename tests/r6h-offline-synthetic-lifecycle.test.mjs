import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeR6HManifest, OfflineFakeDocker, createR6HOfflineController } from '../src/r6h-offline-synthetic-lifecycle.mjs';

const base={owner:'hlxdnapp1/f5-vector-docker-synthetic-lab', nonce:'a'.repeat(32),
  imageDigest:'sha256:'+'f'.repeat(64), runId:107, nowSec:1900000000};
const setup=()=>{const manifest=makeR6HManifest(base),driver=new OfflineFakeDocker();
  return {manifest,driver,controller:createR6HOfflineController(manifest,driver)};};

test('R6H-01 accepts only pinned owner nonce digest and numerical run identity',()=>{
  const m=makeR6HManifest(base);assert.equal(m.schema,1);assert.equal(m.containers.length,2);
  for(const patch of [{owner:'other'},{nonce:'BAD'},{imageDigest:'latest'},
    {imageDigest:'sha256:'+'0'.repeat(64)},{runId:0},{nowSec:0}]){
    assert.throws(()=>makeR6HManifest({...base,...patch}),/R6H_BLOCKED_MANIFEST/);
  }
});
test('R6H-02 plans only fake resources with strict security limits',()=>{
  const m=makeR6HManifest(base);
  for(const c of m.containers){
    assert.equal(c.privileged,false);assert.equal(c.networkMode,'none');
    assert.equal(c.readOnlyRootfs,true);assert.deepEqual(c.mounts,[]);
    assert.deepEqual(c.capDrop,['ALL']);assert.equal(c.noNewPrivileges,true);
    assert.equal(c.user,'10001:10001');assert.equal(c.autoRemove,true);
    assert.equal(c.restartPolicy,'no');assert.equal(c.memoryBytes,64*1024*1024);
  }
});
test('R6H-03 rejects forged or tampered plans',()=>{
  const m=makeR6HManifest(base);const clone=structuredClone(m);
  clone.containers[0].networkMode='host';
  assert.throws(()=>createR6HOfflineController(clone,new OfflineFakeDocker()),/R6H_BLOCKED_DRIFT/);
});
test('R6H-04 rejects a generic transport instead of offline fake',()=>{
  assert.throws(()=>createR6HOfflineController(makeR6HManifest(base),{}),/REAL_TRANSPORT_FORBIDDEN/);
});
test('R6H-05 simulates exactly two resources and can reconcile repeat create',()=>{
  const {driver,controller}=setup();
  assert.deepEqual(controller.create(),{phase:'ACTIVE',created:2});
  assert.deepEqual(controller.create(),{phase:'ACTIVE',created:2});
  assert.equal(driver.trace().filter(x=>x.op==='FAKE_CREATE').length,2);
});
test('R6H-06 never cleans up an unrelated foreign object',()=>{
  const {driver,controller}=setup();const foreign=driver.seedForeignForTest();
  controller.create();controller.cleanup();
  assert.deepEqual(driver.snapshot().map(x=>x.id),[foreign]);
});
test('R6H-07 idempotent cleanup touches only recorded fake owned IDs',()=>{
  const {driver,controller}=setup();controller.create();
  assert.deepEqual(controller.cleanup(),{phase:'CLEANED',remaining:0});
  assert.deepEqual(controller.cleanup(),{phase:'CLEANED',remaining:0});
  assert.equal(driver.trace().filter(x=>x.op==='FAKE_REMOVE').length,2);
});
test('R6H-08 cleanup without creation does nothing',()=>{
  const {driver,controller}=setup();controller.cleanup();
  assert.deepEqual(driver.trace(),[]);
});
test('R6H-09 explicit create failure prevents subsequent creation and permits cleanup',()=>{
  const {driver,controller}=setup();driver.injectFailure({createRole:'outsider'});
  assert.throws(()=>controller.create(),/SIMULATED_CREATE/);
  assert.equal(controller.status().phase,'FAILED');
  assert.equal(driver.trace().filter(x=>x.op==='FAKE_CREATE').length,1);
  assert.deepEqual(controller.cleanup(),{phase:'CLEANED',remaining:0});
});
test('R6H-10 cleanup failures stay visible and no false PASS',()=>{
  const {driver,controller}=setup();controller.create();
  driver.injectFailure({removeId:'d'.repeat(64)});
  assert.throws(()=>controller.cleanup(),/SIMULATED_REMOVE/);
  assert.equal(controller.status().phase,'CLEANUP_FAILED');
  assert.equal(controller.status().ownedIds.length,2);
  driver.injectFailure({});
  controller.cleanup();
  assert.equal(controller.status().phase,'CLEANED');
});
test('R6H-11 rejects unknown ID deletion, no prune capability',()=>{
  const d=new OfflineFakeDocker();
  assert.throws(()=>d.removeExactOwned('e'.repeat(64),base.nonce,base.runId),/UNKNOWN_ID/);
});
test('R6H-12 wrong nonce or run ID fails closed before simulated delete',()=>{
  const {driver,controller}=setup();controller.create();
  assert.throws(()=>driver.removeExactOwned('c'.repeat(64),'b'.repeat(32),107),/NOT_OWNED/);
  assert.throws(()=>driver.removeExactOwned('c'.repeat(64),base.nonce,108),/NOT_OWNED/);
  assert.equal(driver.snapshot().length,2);
});
test('R6H-13 no reuse once cleaned',()=>{
  const {controller}=setup();controller.create();controller.cleanup();
  assert.throws(()=>controller.create(),/ALREADY_CLEANED/);
});
test('R6H-14 no real daemon, networking, subprocess or privileged calls',()=>{
  const src=readFileSync(new URL('../src/r6h-offline-synthetic-lifecycle.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^import\s|require\(|fetch\(|https?\.request\(|createConnection\(|spawn\(|execFile\(|child_process/mi);
  assert.doesNotMatch(src,/docker\s+(?:create|run|rm|stop)|\/var\/run\/docker\.sock|host\.docker\.internal/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterSyntheticDockerResponse as filter } from './synthetic-response-boundary.mjs';

const allowed = 'a'.repeat(64);
const outsider = 'b'.repeat(64);
const get = target => ({ method: 'GET', target });
const list = get('/containers/json?all=false&filters=%7B%7D&size=false');
const inspect = get('/containers/'+allowed+'/json');
const events = get('/events?since=0&filters=%7B%7D');
const logs = (query='?stdout=true&tail=all')=>get('/containers/'+allowed+'/logs'+query);
const marker = '2026-11-16T16:45:00.000Z SYNTHETIC_VECTOR_R6B_ONLY\n';
const json = obj => JSON.stringify(obj);
const frame = (line=marker, channel=1) => {
  const bytes=Buffer.from(line,'utf8');
  const h=Buffer.alloc(8);
  h[0]=channel;
  h.writeUInt32BE(bytes.length,4);
  return Buffer.concat([h,bytes]);
};
const leak = 'LEAK_CANARY_NEVER_EXPOSE';

test('R6D-01 ping accepts only an exact synthetic reply',()=>{
  assert.deepEqual(filter(get('/_ping'),'OK'),{allowed:true,category:'SAFE_PING',output:'OK'});
  assert.deepEqual(filter(get('/_ping'),leak),{allowed:false,category:'PING_BODY_DENIED',output:null});
});
test('R6D-02 version output strips arbitrary daemon information',()=>{
  const x=filter(get('/version'),json({ApiVersion:'1.49',OperatingSystem:leak,KernelVersion:leak}));
  assert.deepEqual(x,{allowed:true,category:'SAFE_VERSION',output:{ApiVersion:'1.49'}});
  assert.doesNotMatch(json(x),/LEAK_CANARY/);
  assert.equal(filter(get('/version'),json({ApiVersion:'2.50'})).allowed,false);
});
test('R6D-03 container list filters outsider records and metadata',()=>{
  const body=json([
    {Id:allowed,Names:['/synthetic-allowed'],Env:[leak],Labels:{secret:leak}},
    {Id:outsider,Names:[leak],Config:{Env:[leak]}}
  ]);
  const x=filter(list,body);
  assert.equal(x.allowed,true);
  assert.equal(x.output.length,1);
  assert.deepEqual(x.output[0],{Id:allowed,Names:['/synthetic-allowed'],
    Image:'synthetic/review-only',State:'running'});
  assert.doesNotMatch(json(x),/LEAK_CANARY|bbbbbbbb/);
});
test('R6D-04 list refuses unknown container identities and leaks no raw data',()=>{
  const c='c'.repeat(64);
  const x=filter(list,json([{Id:c,Names:[leak]}]));
  assert.deepEqual(x,{allowed:false,category:'LIST_ID_DENIED',output:null});
  assert.doesNotMatch(json(x),/LEAK_CANARY|cccccccc/);
});
test('R6D-05 malformed or oversized list payloads fail closed',()=>{
  for(const input of ['{','{}','"string"',json([{Name:leak}]),' '.repeat(8193)]) {
    assert.equal(filter(list,input).allowed,false);
  }
  assert.deepEqual(filter(list,'[]'),{allowed:true,category:'SAFE_CONTAINER_LIST',output:[]});
});
test('R6D-06 inspect projects only known harmless synthetic fields',()=>{
  const x=filter(inspect,json({Id:allowed,Name:'/synthetic-allowed',Config:{Env:[leak],Labels:{key:leak}},NetworkSettings:{IPAddress:leak},State:{Status:'running'}}));
  assert.deepEqual(x,{allowed:true,category:'SAFE_INSPECT',output:{
    Id:allowed,Name:'/synthetic-allowed',
    Config:{Image:'synthetic/review-only',Labels:{}},
    State:{Status:'running'}
  }});
  assert.doesNotMatch(json(x),/LEAK_CANARY/);
});
test('R6D-07 inspect rejects wrong identity and unauthorized request',()=>{
  const x=filter(inspect,json({Id:outsider,Name:'/synthetic-allowed',Env:leak}));
  assert.deepEqual(x,{allowed:false,category:'INSPECT_ID_DENIED',output:null});
  assert.equal(filter(get('/containers/'+outsider+'/json'),json({Id:outsider})).category,'REQUEST_DENIED');
});
test('R6D-08 events stream drops outsider events and every attribute',()=>{
  const payload=json({Type:'container',Action:'start',Actor:{ID:outsider,Attributes:{secret:leak}}})+'\n'+
    json({Type:'container',Action:'die',Actor:{ID:allowed,Attributes:{secret:leak}}})+'\n';
  const x=filter(events,payload);
  assert.deepEqual(x,{allowed:true,category:'SAFE_EVENTS',output:[
    {Type:'container',Action:'die',Actor:{ID:allowed}}
  ]});
  assert.doesNotMatch(json(x),/LEAK_CANARY|bbbbbbbb/);
});
test('R6D-09 event stream rejects unknown identity or mutation',()=>{
  for(const payload of [
    json({Type:'container',Action:'start',Actor:{ID:'c'.repeat(64)}})+'\n',
    json({Type:'container',Action:'exec',Actor:{ID:allowed}})+'\n',
    json({Type:'image',Action:'start',Actor:{ID:allowed}})+'\n',
    json({Type:'container',Action:'start',Actor:{ID:allowed}}),
    '{\n'
  ]) assert.equal(filter(events,payload).allowed,false);
});
test('R6D-10 valid synthetic log frame preserves safe channel and timestamp only',()=>{
  const original=frame();
  const x=filter(logs(),original);
  assert.equal(x.allowed,true);
  assert.equal(x.category,'SAFE_LOGS');
  assert.ok(Buffer.isBuffer(x.output));
  assert.notEqual(x.output,original);
  assert.equal(x.output[0],1);
  assert.equal(x.output.readUInt32BE(4),x.output.length-8);
  assert.equal(x.output.subarray(8).toString('utf8'),marker);
});
test('R6D-11 malformed Docker multiplex header is rejected',()=>{
  const reserved=frame();reserved[1]=1;
  const invalidChannel=frame();invalidChannel[0]=9;
  const brokenLength=frame();brokenLength.writeUInt32BE(9999,4);
  for(const payload of [reserved,invalidChannel,brokenLength,Buffer.from([1,0,0]),Buffer.alloc(0)]) {
    assert.equal(filter(logs(),payload).allowed,false);
  }
});
test('R6D-12 logs containing arbitrary or outsider material are denied',()=>{
  for(const payload of [
    frame('2026-11-16T16:45:00.000Z '+leak+'\n'),
    frame('garbage SYNTHETIC_VECTOR_R6B_ONLY\n'),
    frame('2026-11-16T16:45:00.000Z SYNTHETIC_VECTOR_R6B_ONLY'),
    Buffer.concat([frame(),frame('2026-11-16T16:45:00.000Z '+leak+'\n')])
  ]) {
    const result=filter(logs(),payload);
    assert.equal(result.allowed,false);
    assert.equal(result.output,null);
    assert.doesNotMatch(json(result),/LEAK_CANARY/);
  }
});
test('R6D-13 bounded tail enforced against frame count, even for tail=all',()=>{
  const two=Buffer.concat([frame(),frame(marker,2)]);
  assert.equal(filter(logs('?tail=all'),two).allowed,true);
  assert.equal(filter(logs('?tail=2'),two).allowed,true);
  assert.equal(filter(logs('?tail=1'),two).category,'LOG_TAIL_LIMIT_DENIED');
  assert.equal(filter(logs('?tail=0'),frame()).allowed,false);
  assert.equal(filter(logs('?tail=101'),two).category,'REQUEST_DENIED');
});
test('R6D-14 forbidden requests denied before parsing any response',()=>{
  const request={method:'POST',target:'/containers/'+allowed+'/logs?tail=all'};
  const x=filter(request,frame(leak));
  assert.deepEqual(x,{allowed:false,category:'REQUEST_DENIED',output:null});
  assert.equal(filter(get('/containers/'+outsider+'/logs?tail=all'),frame()).allowed,false);
  assert.equal(filter(get('/containers/'+allowed+'/logs?tail=all&tail=10'),frame()).allowed,false);
});
test('R6D-15 oversized and invalid payload types are always rejected',()=>{
  assert.equal(filter(logs(),Buffer.alloc(16385)).allowed,false);
  assert.equal(filter(logs(),'not a binary frame').allowed,false);
  assert.equal(filter(events,' '.repeat(9000)).allowed,false);
  assert.equal(filter(inspect,json({Id:allowed,Name:'/synthetic-allowed',data:'x'.repeat(9000)})).allowed,false);
  assert.equal(filter(get('/version'),'{}').allowed,false);
});
test('R6D-16 filter has no network, subprocess, filesystem or environment APIs',()=>{
  const src=readFileSync(new URL('./synthetic-response-boundary.mjs',import.meta.url),'utf8');
  assert.match(src,/import \{ classifySyntheticDockerRead \} from '\.\/synthetic-read-policy\.mjs'/);
  assert.doesNotMatch(src,/\b(?:process\.env|spawn|fetch|createServer|createConnection|http\.request|https\.request|net\.connect|Dockerode|child_process)\b|\b(?:execFileSync|execSync)\s*\(/);
  assert.doesNotMatch(src,/\b(?:require|eval|Function)\s*\(/);
  assert.doesNotMatch(src,/\b(?:readFileSync|writeFileSync|openSync)\s*\(/);
});

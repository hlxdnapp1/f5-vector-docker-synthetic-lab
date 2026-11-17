import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeR7B12NumericEventLine as decode,
  createR7B12NumericEventStream as stream
} from '../src/r7b-vector053-numeric-event-decoder.mjs';

const ID = 'a'.repeat(64);
const TIME = 1794916801;
const PREFIX = (action='start', seconds=TIME) =>
  '{"Type":"container","Action":"'+action+'","Actor":{"ID":"'+ID+'","Attributes":{"name":"r7b-synthetic-fixture","r7b.lab.owner":"LAB_ONLY"}},"time":'+seconds+',"timeNano":';
const wire = (action='start', seconds=TIME, nano=String(BigInt(seconds)*1000000000n)) =>
  Buffer.from(PREFIX(action,seconds)+nano+'}\n');
const line = (action='start', seconds=TIME, nano=String(BigInt(seconds)*1000000000n)) =>
  wire(action,seconds,nano).subarray(0,-1);
const denied = (f,kind) => assert.throws(f,new RegExp('R7B12_BLOCKED_'+kind));

for (const action of ['start','unpause','die','pause']) {
  test('accept '+action+' and preserve JSON int64 exactly', () => {
    const nano=String(BigInt(TIME)*1000000000n+BigInt(['start','unpause','die','pause'].indexOf(action)));
    const e=decode(line(action,TIME,nano));
    assert.equal(e.action,action);
    assert.equal(e.timeNano,nano);
    assert.equal(e.subsecondNano,Number(BigInt(nano)%1000000000n));
    assert.equal(e.timeNanoWireType,'JSON_INT64_NUMBER');
    assert.equal(e.origin,'R7B_PUBLIC_SYNTHETIC_ONLY');
    assert.ok(BigInt(e.timeNano)>BigInt(Number.MAX_SAFE_INTEGER));
    assert.ok(Object.isFrozen(e));
  });
}

test('decode uses exact digit string, not rounded JSON.parse number',()=>{
  const a=decode(line('start',TIME,'1794916801000000000'));
  const b=decode(line('start',TIME,'1794916801000000001'));
  assert.equal(BigInt(b.timeNano)-BigInt(a.timeNano),1n);
});
test('minimal supported seconds 2',()=>assert.equal(decode(line('start',2,'2000000000')).time,2));
test('max supported seconds 2147483647',()=>assert.equal(decode(line('die',2147483647,'2147483647999999999')).subsecondNano,999999999));
test('canonical identity',()=>{const e=decode(line());assert.equal(e.actorId,ID);assert.equal(e.name,'r7b-synthetic-fixture');assert.equal(e.label,'LAB_ONLY');});

const invalid = [
  ['quoted nano',s=>s.replace('"timeNano":1794916801000000000','"timeNano":"1794916801000000000"')],
  ['floating nano',s=>s.replace('1794916801000000000','1794916801000000000.0')],
  ['exponential nano',s=>s.replace('1794916801000000000','1.794916801e18')],
  ['leading zeros nano',s=>s.replace('1794916801000000000','01794916801000000000')],
  ['minus nano',s=>s.replace('1794916801000000000','-1794916801000000000')],
  ['plus nano',s=>s.replace('1794916801000000000','+1794916801000000000')],
  ['nano mismatched second',s=>s.replace('1794916801000000000','1794916802000000000')],
  ['nano enormous',s=>s.replace('1794916801000000000','99999999999999999999')],
  ['nano truncated',s=>s.replace('1794916801000000000','1794916801')],
  ['wrong actor',s=>s.replace(ID,'b'.repeat(64))],
  ['extra actor chars',s=>s.replace(ID,ID+'a')],
  ['wrong label',s=>s.replace('LAB_ONLY','NOT_LAB')],
  ['missing label',s=>s.replace(',"r7b.lab.owner":"LAB_ONLY"','')],
  ['wrong name',s=>s.replace('r7b-synthetic-fixture','live')],
  ['wrong type',s=>s.replace('"Type":"container"','"Type":"network"')],
  ['foreign action',s=>s.replace('"Action":"start"','"Action":"rename"')],
  ['duplicate action',s=>s.replace('"Action":"start"','"Action":"start","Action":"die"')],
  ['duplicate nano',s=>s.replace('"timeNano":','"timeNano":1794916801000000000,"timeNano":')],
  ['duplicate time',s=>s.replace('"time":1794916801','"time":1794916801,"time":1794916801')],
  ['unknown metadata',s=>s.replace('"time":1794916801','"unknown":true,"time":1794916801')],
  ['trailing whitespace',s=>s+' '],
  ['leading whitespace',s=>' '+s],
  ['reordered fields',s=>s.replace('"Type":"container","Action":"start"','"Action":"start","Type":"container"')],
  ['escaped key',s=>s.replace('"Type"','"\\u0054ype"')],
  ['nanosecond as null',s=>s.replace('1794916801000000000','null')],
  ['nanosecond as object',s=>s.replace('1794916801000000000','{}')],
  ['extra newline',s=>s+'\n'],
  ['CRLF',s=>s+'\r'],
  ['zero time',s=>s.replace('"time":1794916801','"time":0')],
  ['one time',s=>s.replace('"time":1794916801','"time":1')],
  ['i32 overflow time',s=>s.replace('"time":1794916801','"time":2147483648')],
  ['decimal time',s=>s.replace('"time":1794916801','"time":1794916801.0')],
  ['time as string',s=>s.replace('"time":1794916801','"time":"1794916801"')],
  ['wrong key case',s=>s.replace('"Actor"','"actor"')],
  ['javascript proto key',s=>s.replace('"time":1794916801','"__proto__":{},"time":1794916801')]
];
for(const [label,mutate] of invalid){
  test('fail closed: '+label,()=>denied(()=>decode(Buffer.from(mutate(line().toString()))),label.includes('time')?'(EVENT_WIRE|TIME_RANGE)':'.*'));
}
test('fail closed: wrong input types and empty',()=>{
  for(const value of [null,undefined,'{}',{},[],Buffer.alloc(0),new Uint8Array([123])])
    denied(()=>decode(value),'EVENT_SIZE');
});
test('fail closed: invalid UTF8',()=>denied(()=>decode(Buffer.from([0xff,0x7b])),'EVENT_UTF8'));
test('fail closed: >768 single record',()=>denied(()=>decode(Buffer.alloc(769,0x61)),'EVENT_SIZE'));

test('four events in independently fragmented seven-byte chunks',()=>{
  const s=stream();const all=Buffer.concat(['start','unpause','die','pause'].map((a,i)=>wire(a,TIME,String(BigInt(TIME)*1000000000n+BigInt(i)))));
  const found=[];for(let pos=0;pos<all.length;pos+=7){s.push(Buffer.from(all.subarray(pos,pos+7)));found.push(...s.take());}
  assert.equal(s.finish().state,'ENDED');
  assert.deepEqual(found.map(e=>e.action),['start','unpause','die','pause']);
  assert.deepEqual(found.map(e=>e.timeNano),['1794916801000000000','1794916801000000001','1794916801000000002','1794916801000000003']);
});
test('one-byte fragments work',()=>{const s=stream(),b=wire();for(const x of b)s.push(Buffer.from([x]));assert.equal(s.finish().records,1);assert.equal(s.take()[0].action,'start');});
test('two records accepted in one chunk',()=>{const s=stream();s.push(Buffer.concat([wire(),wire('die')]));assert.deepEqual(s.take().map(e=>e.action),['start','die']);assert.equal(s.finish().records,2);});
test('chunk with first valid and then invalid is atomic and permanently failed',()=>{
  const s=stream();const payload=Buffer.concat([wire(),Buffer.from('{"bad":true}\n')]);
  denied(()=>s.push(payload),'INVALID_');assert.equal(s.status().state,'FAILED');assert.equal(s.status().records,0);
  denied(()=>s.take(),'NOT_READABLE');denied(()=>s.push(wire()),'NOT_ACTIVE');
});
test('earlier already-taken events remain safe after later failure',()=>{
  const s=stream();s.push(wire());const earlier=s.take();denied(()=>s.push(Buffer.from('bad\n')),'INVALID_');assert.equal(earlier[0].timeNano,'1794916801000000000');});
test('backpressure at 8 pending records preserves not-accepted chunk',()=>{
  const s=stream();for(let i=0;i<8;i++)s.push(wire());
  const before=s.status();denied(()=>s.push(wire()),'BACKPRESSURE');assert.deepEqual(s.status(),before);
  assert.equal(s.take(1).length,1);s.push(wire('die'));assert.equal(s.status().records,9);
  assert.equal(s.take().length,8);assert.equal(s.finish().state,'ENDED');
});
test('atomic backpressure when batch would exceed remaining capacity',()=>{
  const s=stream();for(let i=0;i<7;i++)s.push(wire());
  const before=s.status();denied(()=>s.push(Buffer.concat([wire(),wire()])),'BACKPRESSURE');assert.deepEqual(s.status(),before);
  assert.equal(s.take().length,7);assert.equal(s.finish().records,7);
});
test('record quota fails closed after 100 events',()=>{
  const s=stream();for(let i=0;i<100;i++){s.push(wire());s.take();}
  assert.equal(s.status().records,100);denied(()=>s.push(wire()),'RECORD_LIMIT');assert.equal(s.status().state,'FAILED');
});
test('byte budget stays respected under 100 canonical events',()=>{
  const s=stream();for(let i=0;i<99;i++){s.push(wire());s.take();}
  assert.ok(s.status().bytesReceived<65536);
  // This synthetic wire layout reaches the 100-record limit before 65,536 bytes;
  // the separate byte guard remains a defensive limit.
  const s2=stream();const w=wire();let filled=0;
  for(let i=0;i<100;i++){s2.push(w);s2.take();filled+=w.length;}
  assert.ok(filled<65536); // Maximum 100 permitted synthetic events < byte quota.
});
test('empty finish is blocked',()=>{const s=stream();denied(()=>s.finish(),'TRUNCATED_OR_EMPTY');assert.equal(s.status().state,'FAILED');});
test('incomplete NDJSON finish blocked',()=>{const s=stream();s.push(line());denied(()=>s.finish(),'TRUNCATED_OR_EMPTY');assert.equal(s.status().state,'FAILED');});
test('single oversized chunk blocked',()=>{const s=stream();denied(()=>s.push(Buffer.alloc(2049,0x61)),'CHUNK');assert.equal(s.status().state,'FAILED');});
test('invalid chunk type blocked',()=>{const s=stream();denied(()=>s.push('bad'),'CHUNK');assert.equal(s.status().state,'FAILED');});
test('empty chunk blocked',()=>{const s=stream();denied(()=>s.push(Buffer.alloc(0)),'CHUNK');assert.equal(s.status().state,'FAILED');});
test('overlong unterminated record bounded',()=>{const s=stream();denied(()=>s.push(Buffer.alloc(769,0x61)),'INVALID_EVENT_SIZE');assert.equal(s.status().buffered,0);});
test('take invalid limits rejected without state mutation',()=>{const s=stream();s.push(wire());const before=s.status();for(const n of [0,-1,9,1.5,NaN])denied(()=>s.take(n),'TAKE_LIMIT');assert.deepEqual(s.status(),before);});
test('finish then take safe, reject further push and finish',()=>{const s=stream();s.push(wire());assert.equal(s.finish().state,'ENDED');assert.equal(s.take()[0].action,'start');denied(()=>s.push(wire()),'NOT_ACTIVE');denied(()=>s.finish(),'NOT_ACTIVE');});
test('cancel erases buffers, terminal state, idempotent',()=>{const s=stream();s.push(Buffer.from(wire().subarray(0,25)));const st=s.cancel();assert.equal(st.state,'CANCELLED');assert.equal(st.buffered,0);assert.equal(s.cancel().state,'CANCELLED');denied(()=>s.take(),'NOT_READABLE');denied(()=>s.push(wire()),'NOT_ACTIVE');});
test('cancel following FAILED denied',()=>{const s=stream();denied(()=>s.push(Buffer.from('bad\n')),'INVALID_');denied(()=>s.cancel(),'NOT_CANCELLABLE');});
test('never accepts Docker mux log frames as numeric events',()=>{const s=stream(),mux=Buffer.alloc(8);mux[0]=1;mux.writeUInt32BE(3,4);denied(()=>s.push(Buffer.concat([mux,Buffer.from('abc\n')])),'INVALID_');});

// Direct compatibility with the G1B5 generator already used by G1B11;
// its original Git blob is 526e972578ec06db00df5b3738e600040967b8d5.
import {renderR7BVector053SyntheticEvent as render} from '../src/r7b-vector053-wire-contract.mjs';
for (const action of ['start','unpause','die','pause']) {
  test('pinned G1B5 generator -> new G1B12 decoder: '+action,()=>{
    const i=['start','unpause','die','pause'].indexOf(action);
    const nano=String(BigInt(TIME)*1000000000n+BigInt(i));
    const generated=render({action,time:TIME,timeNano:nano});
    const decoded=decode(generated.subarray(0,-1));
    assert.equal(decoded.action,action);
    assert.equal(decoded.timeNano,nano);
    assert.equal(decoded.subsecondNano,i);
  });
}
test('pinned G1B5 generator streaming with varying fragment boundaries',()=>{
  const s=stream();
  const data=Buffer.concat(['start','unpause','die','pause'].map((action,i)=>
    render({action,time:TIME,timeNano:String(BigInt(TIME)*1000000000n+BigInt(i))})));
  const results=[];
  for(let offset=0;offset<data.length;){
    const size=offset%23+1;
    s.push(Buffer.from(data.subarray(offset,offset+size)));
    results.push(...s.take());
    offset+=size;
  }
  assert.equal(s.finish().records,4);
  assert.deepEqual(results.map(x=>x.action),['start','unpause','die','pause']);
});
test('G1B5 source preserves 2038 upper bound decoded exactly',()=>{
  const nanos='2147483647999999999';
  const wire=render({action:'die',time:2147483647,timeNano:nanos});
  const result=decode(wire.subarray(0,-1));
  assert.equal(result.timeNano,nanos);
  assert.equal(result.subsecondNano,999999999);
});

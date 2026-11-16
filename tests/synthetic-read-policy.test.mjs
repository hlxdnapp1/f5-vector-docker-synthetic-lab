import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySyntheticDockerRead as classify } from './synthetic-read-policy.mjs';

const allowed = 'a'.repeat(64);
const outsider = 'b'.repeat(64);
const path = (id, operation = 'logs') => '/containers/' + id + '/' + operation;
const inspect = (id = allowed) => path(id, 'json');
const logs = (id = allowed, query = '') => path(id) + query;
const get = target => classify({ method: 'GET', target });

test('R6C-01 allows only plain synthetic ping and version reads', () => {
  assert.deepEqual(get('/_ping'), { allowed:true, category:'PING', tail:null });
  assert.deepEqual(get('/version'), { allowed:true, category:'VERSION', tail:null });
  assert.equal(get('/_ping?token=never').allowed, false);
});
test('R6C-02 list accepts only all=false and JSON object filters', () => {
  const r = get('/containers/json?all=false&filters=%7B%7D&size=false');
  assert.deepEqual(r, { allowed:true, category:'CONTAINER_LIST', tail:null });
  assert.equal(get('/v1.49/containers/json?all=false&filters=%7B%7D').allowed,true);
});
test('R6C-03 denies broad, malformed and incomplete list requests', () => {
  for (const p of [
    '/containers/json', '/containers/json?all=true&filters=%7B%7D',
    '/containers/json?all=false', '/containers/json?all=false&filters=%5B%5D',
    '/containers/json?all=false&filters=%7B%7D&size=true',
  ]) assert.equal(get(p).allowed,false,p);
});
test('R6C-04 rejects query duplication and unknown list fields', () => {
  for (const p of [
    '/containers/json?all=false&all=true&filters=%7B%7D',
    '/containers/json?all=false&filters=%7B%7D&limit=5',
    '/containers/json?all=false&filters=%7B%7D&secret=private',
  ]) assert.equal(get(p).allowed,false,p);
});
test('R6C-05 synthetic inspect accepts only approved fake ID', () => {
  assert.deepEqual(get(inspect()), { allowed:true, category:'INSPECT', tail:null });
  assert.equal(get(inspect(outsider)).category,'SYNTHETIC_ID_DENIED');
  assert.equal(get(inspect()+'?details=true').allowed,false);
});
test('R6C-06 bounded Bollard tail=all is converted in verdict only', () => {
  assert.deepEqual(get(logs(allowed,'?stdout=true&stderr=true&follow=true&timestamps=true&tail=all&since=1800&until=0')),
    { allowed:true, category:'LOGS', tail:100 });
  assert.deepEqual(get(logs()), { allowed:true, category:'LOGS', tail:100 });
});
test('R6C-07 preserves any numeric log tail within 0-100', () => {
  for (const n of [0,1,20,100]) {
    const r=get(logs(allowed,'?tail='+n));
    assert.equal(r.allowed,true);
    assert.equal(r.tail,n);
  }
});
test('R6C-08 refuses unbounded, oversized, negative, duplicated log parameters', () => {
  for (const q of ['tail=101','tail=1000','tail=-1','tail=1.2',
    'tail=all&tail=100','stdout=maybe','follow=2','details=true',
    'tail=9&since=not-a-timestamp']) {
    assert.equal(get(logs(allowed,'?'+q)).allowed,false,q);
  }
});
test('R6C-09 no log access for any outsider synthetic ID', () => {
  for (const q of ['', '?tail=1', '?stdout=1&tail=all']) {
    assert.equal(get(logs(outsider,q)).category,'SYNTHETIC_ID_DENIED');
  }
});
test('R6C-10 events route accepts limited metadata only', () => {
  assert.equal(get('/events?since=123&filters=%7B%22type%22%3A%5B%22container%22%5D%7D').category,'EVENTS');
  for (const q of ['since=1&since=2','until=-1','foo=bar','filters=%5B%5D']) {
    assert.equal(get('/events?'+q).allowed,false,q);
  }
});
test('R6C-11 denies all mutations, unrelated routes and unsupported versions', () => {
  for (const method of ['POST','PUT','PATCH','DELETE','HEAD']) {
    assert.equal(classify({method,target:inspect()}).category,'METHOD_DENIED');
  }
  for(const p of ['/images/json','/info',path(allowed,'start'),
    '/v1.39'+inspect(),'/v1.60'+inspect(),'/v2.40'+inspect()]) {
    assert.equal(get(p).allowed,false,p);
  }
});
test('R6C-12 refuses unsafe URL forms and never reflects raw inputs', () => {
  for (const p of ['http://evil.invalid/containers/json','//evil.invalid/path',
    '/v1.49/%2e%2e/containers/json', '/containers//json','/containers/../json',
    '/_ping?token=SUPER_PRIVATE_CANARY', '/_ping#fragment']) {
    const verdict=get(p);
    assert.equal(verdict.allowed,false,p);
    assert.doesNotMatch(JSON.stringify(verdict),/SUPER_PRIVATE_CANARY|evil\.invalid|fragment/);
  }
});
test('R6C-13 implementation has no I/O, environment or network dependencies', () => {
  const src=readFileSync(new URL('./synthetic-read-policy.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^\s*import\s/m);
  assert.doesNotMatch(src,/\b(?:process\.env|spawn|fetch|socketPath|createConnection|http\.request|https\.request|net\.connect|Dockerode)\b/);
  assert.doesNotMatch(src,/\b(?:require|eval|Function)\s*\(/);
});

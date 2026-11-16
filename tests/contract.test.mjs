import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(join(root, 'fixtures/contract.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const keys = value => Object.keys(value).sort();

test('PUBLIC-R6B-01: fixture has only approved public fields', () => {
  assert.deepEqual(keys(contract), ['allowed_container','allowed_methods','excluded_container','log_marker','max_log_tail','operations','purpose','schema_version']);
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.purpose, 'public-synthetic-vector-docker-contract-only');
});
test('PUBLIC-R6B-02: IDs are placeholders, not real container identifiers', () => {
  assert.equal(contract.allowed_container.id, 'a'.repeat(64));
  assert.equal(contract.excluded_container.id, 'b'.repeat(64));
  assert.notEqual(contract.allowed_container.id, contract.excluded_container.id);
  assert.deepEqual(keys(contract.allowed_container), ['id','name']);
  assert.deepEqual(keys(contract.excluded_container), ['id','name']);
});
test('PUBLIC-R6B-03: all labels and markers are explicitly synthetic', () => {
  assert.equal(contract.allowed_container.name, 'synthetic-allowed');
  assert.equal(contract.excluded_container.name, 'synthetic-excluded');
  assert.equal(contract.log_marker, 'SYNTHETIC_VECTOR_R6B_ONLY');
});
test('PUBLIC-R6B-04: contract enumerates read-only methods and operations', () => {
  assert.deepEqual(contract.allowed_methods, ['GET']);
  assert.deepEqual(contract.operations, ['ping','version','list','inspect','events','logs']);
});
test('PUBLIC-R6B-05: bounded historical log request, never unlimited', () => {
  assert.equal(contract.max_log_tail, 100);
  assert.ok(contract.max_log_tail > 0 && contract.max_log_tail <= 100);
});
test('PUBLIC-R6B-06: manifest carries no endpoints, accounts or secret material', () => {
  const json = JSON.stringify(contract);
  assert.doesNotMatch(json, /https?:\/\/|localhost|127\.0\.0\.1|host\.docker\.internal|@|token|password|private_key|cert|supabase|postgres/i);
});
test('PUBLIC-R6B-07: repository is not a published package and has no dependencies', () => {
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.test, 'node --test');
  assert.deepEqual(keys(pkg.scripts), ['test']);
  for (const field of ['dependencies','devDependencies','optionalDependencies','publishConfig']) {
    assert.equal(Object.hasOwn(pkg, field), false);
  }
});
test('PUBLIC-R6B-08: no Actions workflow, credential, container or executable runner file', () => {
  const top = readdirSync(root).sort();
  assert.deepEqual(top, ['.git','.gitignore','README.md','SECURITY.md','docs','fixtures','package.json','tests']);
  assert.equal(existsSync(join(root,'.github','workflows')),false);
  assert.equal(existsSync(join(root,'Dockerfile')),false);
  assert.equal(existsSync(join(root,'.env')),false);
  assert.equal(existsSync(join(root,'node_modules')),false);
});
